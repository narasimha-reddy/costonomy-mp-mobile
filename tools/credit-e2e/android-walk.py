#!/usr/bin/env python3
"""Android emulator walkthrough of the restaurant Credit screens (LOCAL ONLY).

Usage:  python3 tools/credit-e2e/android-walk.py <apk-path> [--no-install] [--shots DIR]

Drives the installed app com.costonomy.mp on the running emulator with adb + uiautomator, takes screenshots and runs
objective checks after every step:
  A  blank cards (card nodes with text in the dump but (almost) no ink in the screenshot, sampled at 0 s, 1 s, 3 s)
  B  soft keyboard vs focused field / primary button
  C  overlapping clickable nodes / clickable over foreign text
  D  raw codes (CREDIT_OVERPAYMENT, undefined, NaN ...)
  E  crashes in logcat
Standard library only (Python 3.9). Needs macOS `sips` (screenshot -> BMP for pixel analysis).
Never sends a payment or a claim; never touches production (the app talks to the local API).
"""
import os, re, sys, time, subprocess, zlib, struct, json, collections
import xml.etree.ElementTree as ET

HOME = os.path.expanduser("~")
ADB = os.environ.get("ADB", HOME + "/.local/opt/android-sdk/platform-tools/adb")
PKG = "com.costonomy.mp"
PHONE = os.environ.get("WALK_PHONE", "9876500004")
OTP = os.environ.get("WALK_OTP", "123456")
SHOTS = os.environ.get(
    "WALK_SHOTS",
    "/private/tmp/claude-502/-Users-vijaykrishna-Documents-costonomyprojects/"
    "e8c4f3f5-248d-4563-9de4-bb838eee1c3c/scratchpad/android-shots")
SW, SH = 1080, 2400
CARD_PREFIXES = ("dues-row-", "credit-invoice-", "credit-line-")
RAW_CODES = ["CREDIT_OVERPAYMENT", "WALLET_INSUFFICIENT_BALANCE", "VALIDATION_ERROR", "undefined", "NaN", "[object Object]"]


# ----------------------------------------------------------------------------- adb
def adb(*args, binary=False, timeout=60, check=False):
    r = subprocess.run([ADB, "-s", "emulator-5554"] + list(args), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError("adb %s failed: %s" % (" ".join(args), r.stderr.decode(errors="replace")))
    return r.stdout if binary else r.stdout.decode("utf-8", errors="replace")


# ----------------------------------------------------------------------------- UI tree
class Node:
    __slots__ = ("text", "desc", "rid", "cls", "clickable", "focused", "scrollable", "b", "parent", "children", "enabled")

    def __init__(self, el, parent):
        a = el.attrib
        self.text = a.get("text", "")
        self.desc = a.get("content-desc", "")
        self.rid = a.get("resource-id", "")
        self.cls = a.get("class", "")
        self.clickable = a.get("clickable") == "true"
        self.focused = a.get("focused") == "true"
        self.scrollable = a.get("scrollable") == "true"
        self.enabled = a.get("enabled") != "false"
        m = re.match(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", a.get("bounds", "[0,0][0,0]"))
        self.b = tuple(int(x) for x in m.groups())
        self.parent = parent
        self.children = []

    @property
    def label(self):
        return self.text or self.desc

    @property
    def tid(self):
        # testID shows up as resource-id (RN >= 0.64) or sometimes in content-desc
        return self.rid.split("/")[-1] if self.rid else ""

    @property
    def w(self):
        return self.b[2] - self.b[0]

    @property
    def h(self):
        return self.b[3] - self.b[1]

    def center(self):
        return ((self.b[0] + self.b[2]) // 2, (self.b[1] + self.b[3]) // 2)

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()

    def is_desc_of(self, other):
        p = self.parent
        while p is not None:
            if p is other:
                return True
            p = p.parent
        return False

    def descr(self):
        t = (self.label or "").replace("\n", " | ")
        return "%s%s%s %s" % (self.tid + " " if self.tid else "", "'%s'" % t[:70] if t else "", "", list(self.b))


def parse_dump(xml):
    root = ET.fromstring(xml)
    nodes = []

    def rec(el, parent):
        n = Node(el, parent)
        nodes.append(n)
        if parent:
            parent.children.append(n)
        for c in el.findall("node"):
            rec(c, n)
    top = root.find("node")
    rec(top, None)
    return nodes


def dump(retries=4):
    for i in range(retries):
        out = adb("exec-out", "sh", "-c", "uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml")
        if out.strip().startswith("<?xml"):
            try:
                return parse_dump(out.strip())
            except ET.ParseError:
                pass
        time.sleep(0.7)
    raise RuntimeError("uiautomator dump failed")


def is_glyph(t):
    return bool(t) and all(0xE000 <= ord(c) <= 0xF8FF or c.isspace() for c in t)


def texts(nodes):
    return [n.label for n in nodes if n.label and not is_glyph(n.label)]


# ----------------------------------------------------------------------------- screenshots / pixels
class Shot:
    """Screenshot with pixel access (via sips -> BMP, 32 bit)."""

    def __init__(self, png):
        self.png = png
        tmp = os.path.join(SHOTS, ".tmp")
        os.makedirs(tmp, exist_ok=True)
        p, q = os.path.join(tmp, "s.png"), os.path.join(tmp, "s.bmp")
        with open(p, "wb") as f:
            f.write(png)
        subprocess.run(["sips", "-s", "format", "bmp", p, "--out", q], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=True)
        d = open(q, "rb").read()
        off = struct.unpack_from("<I", d, 10)[0]
        self.w, h, bpp = struct.unpack_from("<iHH", d, 18)[0], 0, 0
        self.w = struct.unpack_from("<i", d, 18)[0]
        hh = struct.unpack_from("<i", d, 22)[0]
        bpp = struct.unpack_from("<H", d, 28)[0]
        self.topdown = hh < 0
        self.h = abs(hh)
        self.bpp = bpp // 8
        self.stride = (self.w * self.bpp + 3) & ~3
        self.data = d
        self.off = off
        if self.bpp == 4:
            self.mv = memoryview(d)[off:off + self.stride * self.h]
            self.mv = self.mv.cast("I") if (len(self.mv) % 4 == 0) else None

    def row(self, y):
        yy = y if self.topdown else self.h - 1 - y
        return yy * (self.stride // self.bpp)

    def crop_stats(self, x1, y1, x2, y2, step=2):
        """(ink_fraction, dominant_rgb, n) ignoring pixels within tolerance of the dominant colour."""
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(self.w, x2), min(self.h, y2)
        if x2 - x1 < 4 or y2 - y1 < 4:
            return None
        cnt = collections.Counter()
        rows = []
        for y in range(y1, y2, step):
            base = self.row(y)
            r = [v & 0x00F8F8F8 for v in self.mv[base + x1:base + x2:step]]
            rows.append(r)
            cnt.update(r)
        dom, dn = cnt.most_common(1)[0]
        n = sum(cnt.values())
        # tolerance: colours within 1 quantisation step (8 levels) of the dominant colour count as background
        db = (dom & 0xFF, (dom >> 8) & 0xFF, (dom >> 16) & 0xFF)
        bg = 0
        for c, k in cnt.items():
            cb = (c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF)
            if all(abs(cb[i] - db[i]) <= 16 for i in range(3)):
                bg += k
        return (1 - bg / n, (db[2], db[1], db[0]), n)


def screencap():
    return adb("exec-out", "screencap", "-p", binary=True, timeout=30)


# ----------------------------------------------------------------------------- keyboard
def ime_top():
    """Top Y of the visible soft keyboard, or None when hidden."""
    out = adb("shell", "dumpsys", "window", "InputMethod")
    shown = adb("shell", "dumpsys", "input_method")
    vis = re.search(r"mInputShown=(true|false)", shown)
    if not (vis and vis.group(1) == "true"):
        return None
    m = re.search(r"touchable region=SkRegion\(\((\d+),(\d+),(\d+),(\d+)\)", out)
    if m:
        return int(m.group(2))
    m = re.search(r"mGivenContentInsets=\[\d+,(\d+)\]", out)
    return int(m.group(1)) if m else None


# ----------------------------------------------------------------------------- the walker
class Walk:
    def __init__(self, apkname):
        self.apk = apkname
        self.n = 0
        self.results = []     # list of dict(step, checks...)
        self.blank_timeline = []
        self.kb = []
        self.problems = []
        self.notes = []
        self.log_mark = ""
        os.makedirs(SHOTS, exist_ok=True)

    # -- basic actions
    def tap(self, x, y, wait=0.8):
        adb("shell", "input", "tap", str(x), str(y))
        time.sleep(wait)

    def tap_node(self, n, wait=0.8):
        x, y = n.center()
        self.tap(x, y, wait)

    def find(self, nodes, pat, clickable=None, exact=False, tid=False):
        rx = re.compile(pat) if not exact else None
        out = []
        for n in nodes:
            s = n.tid if tid else n.label
            if not s:
                continue
            if (exact and s == pat) or (rx and rx.search(s)):
                if clickable is None or n.clickable == clickable:
                    out.append(n)
        return out

    def best_tap_target(self, n):
        """a text node may not be clickable itself: use nearest clickable ancestor if any."""
        p = n
        while p is not None:
            if p.clickable:
                return p
            p = p.parent
        return n

    def tap_text(self, pat, wait=1.0, nth=0, tid=False, required=True):
        nodes = dump()
        c = self.find(nodes, pat, tid=tid)
        c = [x for x in c if x.b[3] > 0 and x.b[1] < SH]
        if len(c) <= nth:
            if required:
                raise RuntimeError("tap_text: %r not found; texts=%s" % (pat, texts(nodes)[:40]))
            return False
        t = self.best_tap_target(c[nth])
        self.tap_node(t, wait)
        return True

    def wait_for_text(self, pat, timeout=15, tid=False):
        end = time.time() + timeout
        while time.time() < end:
            nodes = dump()
            if self.find(nodes, pat, tid=tid):
                return nodes
            time.sleep(0.8)
        raise RuntimeError("timeout waiting for %r" % pat)

    def scroll(self, down=True, frac=0.45):
        ln = min(int(SH * frac), 1400)
        y1, y2 = (1800, 1800 - ln) if down else (800, 800 + ln)   # start inside the list, below any sticky header
        adb("shell", "input", "swipe", "540", str(y1), "540", str(y2), "350")
        time.sleep(0.7)

    def scroll_until_text(self, pat, max_scrolls=12):
        for _ in range(max_scrolls):
            nodes = dump()
            hit = [n for n in self.find(nodes, pat) if 200 < n.b[1] < 2330]
            if hit:
                return hit[0]
            self.scroll(True)
        return None

    def back(self, wait=1.0):
        adb("shell", "input", "keyevent", "4")
        time.sleep(wait)

    def type_text(self, s):
        adb("shell", "input", "text", s.replace(" ", "%s"))
        time.sleep(0.6)

    # -- screenshots
    def shot_name(self, label):
        self.n += 1
        return "%s-%02d-%s" % (self.apk, self.n, re.sub(r"[^A-Za-z0-9]+", "-", label).strip("-"))

    def save_png(self, name, png):
        p = os.path.join(SHOTS, name + ".png")
        with open(p, "wb") as f:
            f.write(png)
        return p

    # -- checks
    def crash_check(self):
        """FATAL EXCEPTION blocks of the app process only (uiautomator's own crashes are ignored)."""
        out = adb("logcat", "-d", "-b", "crash") + "\n" + adb("logcat", "-d", "-b", "main", "-s", "AndroidRuntime:E")
        lines = out.splitlines()
        hits = []
        for k, l in enumerate(lines):
            if "FATAL EXCEPTION" in l and any("Process: " + PKG in x for x in lines[k + 1:k + 4]):
                hits.append(l.strip())
        new = [h for h in hits if h not in self.log_mark]
        self.log_mark += "\n".join(hits)
        return new

    def card_nodes(self, nodes):
        cards = []
        for n in nodes:
            if n.h <= 0 or n.w <= 0:
                continue
            if "EditText" in n.cls:
                continue          # text inputs are not cards
            is_tid = n.tid.startswith(CARD_PREFIXES)
            big = n.clickable and n.h > 120 and n.w > 0.8 * SW
            if not (is_tid or big):
                continue
            tn = [d for d in n.walk() if d.label and not is_glyph(d.label)]
            if not tn:
                continue
            cards.append(n)
        return cards

    def blank_check(self, nodes, shot, kb_top=None, label=""):
        nodes_all = nodes
        blanks, cards_seen = [], []
        limit = kb_top if kb_top else SH - 130   # exclude the nav bar / keyboard
        for c in self.card_nodes(nodes):
            x1, y1, x2, y2 = c.b
            y1v, y2v = max(y1, 140), min(y2, limit)
            # a later sibling that sits on top of the card's upper part (sticky month header, banner) hides it by design
            for o in nodes_all:
                if o is c or o.is_desc_of(c) or c.is_desc_of(o) or not (o.clickable or o.tid.startswith("month-")):
                    continue
                if o.b[1] <= y1v + 10 and o.b[3] > y1v and o.b[0] < x2 and o.b[2] > x1 and o.b[3] < y2v:
                    y1v = max(y1v, o.b[3])
            if y2v - y1v < 150:
                continue    # (almost) fully off screen / under an overlay
            st = shot.crop_stats(x1, y1v, x2, y2v)
            if not st:
                continue
            ink, dom, npx = st
            first = next((d.label for d in c.walk() if d.label), "")
            # a plain button (one short label, white-on-colour) legitimately has few text pixels: only flag it when
            # the crop is a perfectly flat colour. Cards / rows use the 2 % rule from the brief.
            is_btn = c.cls.endswith("Button") and not c.tid.startswith(CARD_PREFIXES) and \
                len([d for d in c.walk() if d.label and not is_glyph(d.label)]) <= 2
            rec = {"node": c.descr(), "text": first[:60], "ink": round(ink, 4), "dom": dom,
                   "kind": "button" if is_btn else "card"}
            cards_seen.append(rec)
            if ink < (0.003 if is_btn else 0.02):
                blanks.append(rec)
        return blanks, cards_seen

    def raw_codes(self, nodes):
        hits = []
        for n in nodes:
            for k in RAW_CODES:
                if k in (n.label or ""):
                    hits.append("%s in %s" % (k, n.descr()))
        return hits

    def overlaps(self, nodes):
        vis = [n for n in nodes if n.w > 0 and n.h > 0 and n.b[3] > 0 and n.b[1] < SH]
        clicks = [n for n in vis if n.clickable and n.h < SH * 0.9]
        hits = []
        for i in range(len(clicks)):
            for j in range(i + 1, len(clicks)):
                a, b = clicks[i], clicks[j]
                if a.is_desc_of(b) or b.is_desc_of(a):
                    continue
                ow = min(a.b[2], b.b[2]) - max(a.b[0], b.b[0])
                oh = min(a.b[3], b.b[3]) - max(a.b[1], b.b[1])
                if ow > 6 and oh > 6:
                    hits.append("clickable/clickable %s x %s (%dx%d px)" % (a.descr(), b.descr(), ow, oh))
        txt = [n for n in vis if n.text and not n.clickable]
        for c in clicks:
            for t in txt:
                if t.is_desc_of(c) or c.is_desc_of(t):
                    continue
                ow = min(c.b[2], t.b[2]) - max(c.b[0], t.b[0])
                oh = min(c.b[3], t.b[3]) - max(c.b[1], t.b[1])
                if ow > 6 and oh > 6:
                    hits.append("clickable over foreign text %s x %s (%dx%d px)" % (c.descr(), t.descr(), ow, oh))
        return hits[:12]

    def step(self, label, settle=1.2, timeline=True, save=True, overlap=True):
        """Take screenshot(s) + dump and run checks A, C, D, E for the current screen."""
        time.sleep(settle)
        name = self.shot_name(label)
        rec = {"step": label, "shot": name, "A": [], "C": [], "D": [], "E": [], "timeline": []}
        t0 = time.time()
        times = [0, 1, 3] if timeline else [0]
        first_nodes = None
        for i, tt in enumerate(times):
            while time.time() - t0 < tt:
                time.sleep(0.1)
            png = screencap()
            nodes = dump()
            shot = Shot(png)
            if i == 0:
                if save:
                    self.save_png(name, png)
                first_nodes = nodes
            blanks, seen = self.blank_check(nodes, shot, label=label)
            rec["timeline"].append({"t": tt, "cards": len(seen), "blank": blanks,
                                    "min_ink": min([c["ink"] for c in seen], default=None)})
            if blanks:
                self.save_png(name + "-t%d-BLANK" % tt, png)   # evidence, also for scroll steps (save=False)
        nodes = first_nodes
        rec["A"] = [b for t in rec["timeline"] for b in t["blank"]]
        rec["C"] = self.overlaps(nodes) if overlap else []   # sticky list headers overlap rows by design while scrolling
        rec["D"] = self.raw_codes(nodes)
        rec["E"] = self.crash_check()
        rec["texts"] = texts(nodes)[:60]
        self.results.append(rec)
        rec["saved"] = save
        flag = ("BLANK" if rec["A"] else "") + (" OVERLAP" if rec["C"] else "") + (" RAW" if rec["D"] else "") + (" CRASH" if rec["E"] else "")
        print("[%s] %s cards=%s %s" % (name, "FAIL" if flag.strip() else "ok", [t["cards"] for t in rec["timeline"]], flag.strip()))
        return nodes

    def kb_check(self, label, field_pat=None, button_pat=None, must_read_pats=(), guidance_pat=None, expect_tid=None):
        """Call with the keyboard open and a field focused."""
        time.sleep(1.2)
        top = ime_top()
        name = self.shot_name("kb-" + label)
        png = screencap()
        self.save_png(name, png)
        nodes = dump()
        rec = {"step": "keyboard: " + label, "shot": name, "kb_top": top, "checks": []}
        if top is None:
            rec["checks"].append(("keyboard visible", "FAIL", "soft keyboard not detected (mInputShown=false)"))
            self.kb.append(rec)
            print("[%s] keyboard NOT shown" % name)
            return nodes, rec
        foc = [n for n in nodes if n.focused and "EditText" in n.cls] or [n for n in nodes if n.focused]
        if expect_tid and not (foc and foc[0].tid == expect_tid):
            rec["checks"].append(("(0) intended field has focus", "FAIL",
                                  "expected %s, focused: %s" % (expect_tid, foc[0].descr() if foc else "nothing")))
            ex = [n for n in nodes if n.tid == expect_tid]
            if ex:
                rec["checks"].append(("(0b) intended field vs keyboard", "FAIL" if ex[0].b[3] > top else "PASS",
                                      "%s bottom=%d vs keyboard top=%d" % (ex[0].descr(), ex[0].b[3], top)))
        if foc:
            f = foc[0]
            ok = f.b[3] <= top
            rec["checks"].append(("(i) focused field above keyboard", "PASS" if ok else "FAIL",
                                  "field %s bottom=%d vs keyboard top=%d (margin %d)" % (f.descr(), f.b[3], top, top - f.b[3])))
        else:
            rec["checks"].append(("(i) focused field above keyboard", "FAIL", "no focused node in dump"))
        if button_pat:
            btn = [n for n in self.find(nodes, button_pat) if n.b[3] > 0]
            if btn:
                b = btn[0]
                above = b.b[3] <= top
                rec["checks"].append(("(ii) primary button", "PASS" if above else "FAIL",
                                      "button %s bottom=%d vs keyboard top=%d -> %s" %
                                      (b.descr(), b.b[3], top, "visible above keyboard" if above else "COVERED/partly covered by keyboard")))
                if not above:
                    scr = self.scroll_to_reveal(button_pat, top)
                    rec["checks"].append(("(ii-b) button reachable by scrolling", "PASS" if scr[0] else "FAIL", scr[1]))
                    self.hide_keyboard()
                    nd = dump()
                    bb = [n for n in self.find(nd, button_pat) if n.h > 0]
                    ok2 = bool(bb) and bb[0].b[3] <= SH - 60
                    rec["checks"].append(("(ii-c) button usable after dismissing keyboard", "PASS" if ok2 else "FAIL",
                                          "after BACK: %s" % (bb[0].descr() if bb else "button not found")))
            else:
                rec["checks"].append(("(ii) primary button", "FAIL", "button %r not in the dump (hidden under keyboard or absent)" % button_pat))
        if foc and button_pat:
            btn = [n for n in self.find(nodes, button_pat) if n.h > 0]
            btn_ok = bool(btn) and btn[0].b[3] <= top and btn[0].b[1] >= 0
            guide = []
            if guidance_pat:
                guide = [n for n in self.find(nodes, guidance_pat) if n.h > 0 and n.b[3] <= top and n.b[3] > 0]
            field_ok = foc[0].b[3] <= top and foc[0].b[1] >= 150
            if not field_ok:
                verdict, why = "FAIL", "focused field not fully above the keyboard"
            elif btn_ok:
                verdict, why = "PASS", "field above keyboard AND primary button visible above keyboard"
            elif guide:
                verdict, why = "PASS", "button hidden, but the form tells how to proceed: %r" % guide[0].label
            else:
                verdict, why = "FAIL", "button hidden under the keyboard and no guidance text visible above it"
            rec["checks"].append(("(iv) field visible and (button visible OR guidance)", verdict, why))
        for pat in must_read_pats:
            hit = [n for n in self.find(nodes, pat) if n.b[3] > 0]
            if not hit:
                rec["checks"].append(("(iii) must-read %r" % pat, "FAIL", "not in dump"))
            else:
                n = hit[0]
                vis = n.b[3] <= top and n.b[1] >= 0
                rec["checks"].append(("(iii) must-read %r" % pat, "PASS" if vis else "FAIL",
                                      "%s bottom=%d vs keyboard top=%d" % (n.descr(), n.b[3], top)))
        self.kb.append(rec)
        print("[%s] keyboard top=%s %s" % (name, top, [(c[0], c[1]) for c in rec["checks"]]))
        return nodes, rec

    def scroll_to_reveal(self, pat, top):
        before = [n.b for n in self.find(dump(), pat) if n.h > 0]
        for i in range(4):
            self.scroll(True, 0.2)
            nodes = dump()
            hit = [n for n in self.find(nodes, pat) if n.b[3] > 0 and n.h > 0]
            if hit and hit[0].b[3] <= top:
                return True, "button visible above keyboard after %d small scroll(s): %s" % (i + 1, hit[0].descr())
            if i == 0 and before and hit and hit[0].b == before[0]:
                return False, "fixed footer: scrolling does not move it, it stays under the keyboard until the keyboard is dismissed"
        return False, "button still not above keyboard after 4 scrolls"

    def hide_keyboard(self):
        for _ in range(3):
            if ime_top() is None:
                return
            adb("shell", "input", "keyevent", "4")   # BACK: the IME consumes it first
            time.sleep(1.3)
        time.sleep(1.0)

    def bring_into_view(self, pat, tid=False, y_lo=450, y_hi=1100, max_scrolls=10):
        """scroll (keyboard hidden) until the node is inside [y_lo, y_hi]; when the list cannot scroll any further
        the node is returned where it is (if on screen). Returns the node or None."""
        last = None
        for _ in range(max_scrolls):
            nodes = dump()
            hit = [n for n in self.find(nodes, pat, tid=tid) if n.h > 0]
            if hit:
                n = hit[0]
                if y_lo <= n.b[1] <= y_hi:
                    return n
                if last == n.b:       # did not move: end of the scroll range
                    return n if 150 < n.b[1] < SH - 300 else None
                last = n.b
                self.scroll(n.b[1] > y_hi, 0.2)
                continue
            last = None
            self.scroll(True, 0.4)
        return None

    def focus_field(self, nth=0, pat=None):
        nodes = dump()
        eds = [n for n in nodes if "EditText" in n.cls and n.b[3] > 0 and n.b[1] < SH]
        if pat:
            eds = [n for n in eds if re.search(pat, n.label + n.rid)] or eds
        if len(eds) <= nth:
            return None
        self.tap_node(eds[nth], 1.2)
        return eds[nth]


# ----------------------------------------------------------------------------- navigation helpers
def app_in_front():
    out = adb("shell", "dumpsys", "activity", "activities")
    m = re.search(r"topResumedActivity=.*", out)
    return bool(m) and PKG in m.group(0)


def go_home(w, tries=8):
    for _ in range(tries):
        if not app_in_front():                      # a Back too many left the app: relaunch it
            adb("shell", "am", "start", "-n", PKG + "/.MainActivity")
            time.sleep(5)
        nodes = dump()
        if w.find(nodes, "^action-credit$", tid=True):
            return nodes
        if w.find(nodes, "^Gmail$|^Chrome$"):      # on the launcher: the app was left, start it again
            adb("shell", "am", "start", "-n", PKG + "/.MainActivity")
            time.sleep(6)
            continue
        w.back(1.3)
    raise RuntimeError("could not get back to Home")


def open_credit(w):
    go_home(w)
    w.tap_text("^action-credit$", 2.5, tid=True)
    w.wait_for_text("^pay-from-wallet$", 15, tid=True)
    w.wait_for_text("^dues-row-", 15, tid=True)


def balance_text(nodes):
    for n in nodes:
        if n.label.startswith("Wallet balance") and "rupees" in n.label:
            return n.label
    return None


def scroll_top(w, max_scrolls=12):
    seen = None
    for _ in range(max_scrolls):
        sig = hash(tuple(texts(dump())))
        if sig == seen:
            return
        seen = sig
        w.scroll(False, 0.6)


def scroll_pass(w, label, max_scrolls=12):
    """Scroll to the bottom, checking blank cards at every stop (single sample), then back to the top."""
    w.step(label + "-top", timeline=True)
    seen, n = None, 0
    for i in range(max_scrolls):
        w.scroll(True, 0.5)
        sig = hash(tuple(texts(dump())))
        if sig == seen:
            break
        seen = sig
        n += 1
        w.step("%s-scroll%d" % (label, n), settle=0.5, timeline=False, save=(i % 3 == 2), overlap=False)
    w.step(label + "-bottom", settle=0.3, timeline=True, overlap=False)
    scroll_top(w)
    w.step(label + "-backtop", settle=0.5, timeline=False, save=False)


def walk(w, fresh=True):
    adb("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1")
    adb("logcat", "-c")
    adb("shell", "am", "force-stop", PKG)
    if fresh:
        adb("shell", "pm", "clear", PKG)
        adb("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1")
    adb("shell", "am", "start", "-n", PKG + "/.MainActivity")
    time.sleep(6)
    nodes = dump()
    if w.find(nodes, "^Sign in to an existing"):
        w.step("welcome", settle=1)
        w.tap_text("^Sign in to an existing", 2)
        for attempt in range(3):
            if w.find(dump(), "Six-digit code"):
                break
            w.wait_for_text("^Send Code$", 15)
            w.focus_field(0)
            w.type_text(PHONE)
            if attempt == 0:
                w.step("signin-phone", settle=0.5, timeline=False)
            w.hide_keyboard()
            time.sleep(1.5)
            w.tap_text("^Send Code$", 1)
            ok = False
            for tap in range(2):          # the first tap right after the keyboard closes can miss the moving button
                try:
                    w.wait_for_text("Six-digit code", 10)
                    ok = True
                    break
                except RuntimeError:
                    if any(re.search("Too many|Try again", t) for t in texts(dump())):
                        break          # rate limited: a second tap would only restart the 60 s window
                    if tap == 0:
                        w.tap_text("^Send Code$", 1, required=False)
            if ok:
                break
            print("OTP screen did not appear (rate limit?): %s; waiting 65 s" % texts(dump())[:12])
            time.sleep(65)
        w.focus_field(0)
        w.type_text(OTP)
        w.hide_keyboard()
        w.step("signin-otp", settle=0.5, timeline=False)
        w.tap_text("^Verify$", 6)
    else:
        print("already signed in (session kept)")
    w.wait_for_text("^action-credit$", 30, tid=True)
    home = w.step("home")
    print("HOME credit tile:", [n.descr() for n in home if n.tid == "action-credit"])

    # ---- Credit overview
    w.tap_text("^action-credit$", 3, tid=True)
    w.wait_for_text("^pay-from-wallet$", 15, tid=True)
    ov = w.step("credit-overview")
    rows = [n for n in ov if n.tid.startswith("dues-row-")]
    w.overview_rows = [(n.tid, n.label[:60]) for n in rows]

    # ---- Pay from wallet (multi) sheet: toggle rows, never pay
    w.tap_text("^pay-from-wallet$", 2.2, tid=True)
    w.wait_for_text("^pay-multiple-sheet$", 10, tid=True)
    w.step("pay-multi-sheet")
    tot0 = [n.label for n in dump() if n.tid == "multi-total"]
    first = [n for n in dump() if n.tid.startswith("multi-row-")]
    toggles = []
    for r in first[:2]:
        w.tap_node(r, 1.2)
        toggles.append([n.label for n in dump() if n.tid == "multi-total"])
    w.step("pay-multi-sheet-toggled", settle=0.5, timeline=False)
    w.multi_total_trace = (tot0, toggles)
    w.tap_text("^Close$", 1.5)

    # ---- I paid outside the app: picker -> Deccan -> form
    w.tap_text("^i-paid$", 2.2, tid=True)
    w.wait_for_text("^supplier-pick-sheet$", 10, tid=True)
    w.step("ipaid-supplier-picker")
    deccan = [n for n in dump() if n.tid.startswith("pick-supplier-") and "Deccan" in n.label]
    w.tap_node(deccan[0], 2.5)
    w.wait_for_text("Which invoice\\?|Change invoice|Amount", 15)
    form = w.step("ipaid-form")           # 0 s / 1 s / 3 s blank check: the place the owner saw blank cards
    w.new_form = bool(w.find(form, "Change invoice"))
    print("I paid form variant:", "NEW (Change invoice)" if w.new_form else "OLD (invoice list)")
    amt = w.bring_into_view("^claim-amount$", tid=True)
    w.step("ipaid-form-amount-in-view", settle=0.5, timeline=False)
    # amount field: clear then type (value is prefilled)
    w.tap_text("^claim-amount$", 1.2, tid=True)
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    for _ in range(12):
        adb("shell", "input", "keyevent", "67")
    w.type_text("1234")
    w.kb_check("ipaid-amount", button_pat="^Send to supplier$", must_read_pats=["Still owed|Amount \\*"],
               guidance_pat="Add the reference|Scroll for|Close the keyboard|to send")
    w.hide_keyboard()
    ref = w.bring_into_view("^claim-reference$", tid=True)
    if ref:
        w.tap_node(ref, 1.2)
        w.type_text("WALK%s0001" % "")
        w.kb_check("ipaid-reference", button_pat="^Send to supplier$", must_read_pats=["^Required$|UTR|^Reference"],
                   guidance_pat="Add the reference|Scroll for|Close the keyboard|to send")
        w.hide_keyboard()
    w.hide_keyboard()
    note = w.bring_into_view("^claim-note$", tid=True)
    if note:
        w.tap_node(note, 1.5)
        w.type_text("walk")
        w.kb_check("ipaid-note", expect_tid="claim-note", button_pat="^Send to supplier$", guidance_pat="Add the reference|Scroll for|Close the keyboard|to send")
        w.hide_keyboard()
    w.step("ipaid-form-filled-not-sent", settle=0.5, timeline=False)
    scroll_pass(w, "ipaid-form-scroll")
    w.back(1.5)       # NOT sent

    # ---- supplier details
    for pat in ("Sri Balaji", "Metro Fresh", "Deccan"):
        open_credit(w)
        row = []
        for _try in range(6):
            row = [n for n in dump() if n.tid.startswith(("dues-row-", "line-row-")) and pat in n.label]
            if row:
                break
            time.sleep(1.5)
        if not row:
            msg = "supplier %r has no dues row (fully repaid by a concurrent run?): skipped" % pat
            print(msg)
            w.notes.append(msg)
            continue
        w.tap_node(row[0], 2.5)
        tag = pat.split()[0].lower()
        try:
            end = time.time() + 15
            while time.time() < end:
                nd = dump()
                if w.find(nd, "^credit-owed$", tid=True) or w.find(nd, "Something went wrong"):
                    break
                time.sleep(1)
        except RuntimeError:
            pass
        if w.find(dump(), "Something went wrong"):
            w.step("supplier-%s-ERROR" % tag)
            w.notes.append("supplier %s detail shows 'Something went wrong / Couldn't load this credit line' (see screenshot)" % pat)
            w.tap_text("^Try Again$", 4, required=False)
            if not w.find(dump(), "^credit-owed$", tid=True):
                w.notes.append("supplier %s detail still failing after Try Again: skipped" % pat)
                continue
        w.step("supplier-%s" % tag)
        for tab, tid in (("open", "^credit-tab-open$"), ("paid", "^credit-tab-paid$")):
            w.tap_text(tid, 1.8, tid=True)
            scroll_pass(w, "supplier-%s-%s" % (tag, tab))
            w.tap_text("^credit-tab-open$", 1.0, tid=True)
            for _ in range(3):
                w.scroll(False, 0.6)
            if tab == "open":
                pass
        w.tap_text("^credit-tab-open$", 1.2, tid=True)

    # ---- Deccan (we are on its detail): invoice -> detail -> Pay sheet -> Other amount
    for _ in range(4):
        w.scroll(False, 0.6)
    inv = [n for n in dump() if n.tid.startswith("credit-invoice-") and not n.tid.startswith("credit-invoice-chip")]
    inv = [n for n in inv if n.h > 100 and 300 < n.b[1] < 2100]
    if not inv:
        w.scroll(True, 0.4)
        inv = [n for n in dump() if n.tid.startswith("credit-invoice-") and not n.tid.startswith("credit-invoice-chip") and n.h > 100]
    w.tap_node(inv[0], 2.5)
    w.wait_for_text("^invoice-amount$", 12, tid=True)
    w.step("invoice-detail")
    w.tap_text("^invoice-pay$", 2.2, tid=True)
    w.wait_for_text("^pay-from-wallet-sheet$", 10, tid=True)
    w.step("pay-sheet-single")
    w.tap_text("^choice-other$", 1.8, tid=True)
    w.step("pay-sheet-other", settle=0.5, timeline=False)
    w.tap_text("^other-amount$", 1.5, tid=True)
    w.kb_check("pay-sheet-other-amount", button_pat="^Pay.*from wallet$|^pay-button$",
               must_read_pats=["^Amount$", "This pays invoice"])
    w.type_text("100")
    w.kb_check("pay-sheet-typed-100", button_pat="^Pay ₹100", must_read_pats=["^Amount$", "This pays invoice"])
    w.hide_keyboard()
    w.tap_text("^Close$", 1.5)             # closes WITHOUT paying
    w.back(1.5)                            # invoice detail -> supplier detail

    # ---- Statement
    nodes = dump()
    if not w.find(nodes, "^credit-statement-row$", tid=True):
        for _ in range(6):
            w.scroll(True, 0.6)
            if w.find(dump(), "^credit-statement-row$", tid=True):
                break
    w.tap_text("^credit-statement-row$", 3, tid=True)
    w.wait_for_text("^statement-list$", 12, tid=True)
    scroll_pass(w, "statement")
    if w.find(dump(), "^history-search-input$", tid=True):      # v4: search bar + Filters screen
        w.tap_text("^history-search-input$", 1.2, tid=True)
        w.type_text("INV")
        w.kb_check("statement-search", must_read_pats=["^statement-range$|to \\d"])
        w.hide_keyboard()
        w.step("statement-after-search", settle=0.8, timeline=False)
        if w.tap_text("^open-filters$", 2, tid=True, required=False):
            w.step("statement-filters")
            w.back(1.5)
        w.hide_keyboard()

    # ---- Wallet -> History -> credit repayment -> details
    go_home(w)
    w.tap_text("^action-wallet$", 3, tid=True)
    wn = w.step("wallet")
    w.wallet_balance_before = balance_text(wn)
    w.tap_text("^action-history$", 3, tid=True)
    scroll_pass(w, "wallet-history", max_scrolls=4)
    for _ in range(8):                      # the list lazy-loads: just swipe up a few times
        w.scroll(False, 0.7)
    hit = w.scroll_until_text("Credit repayment, ", max_scrolls=10)
    if hit:
        w.tap_node(w.best_tap_target(hit), 3)
        w.step("wallet-repayment-details")
        w.back(1.5)
    else:
        w.notes.append("no 'Credit repayment' row found in wallet history: details step skipped")
    w.back(1.5)

    # ---- Request credit
    open_credit(w)
    if not w.tap_text("^get-credit$", 3, tid=True, required=False):
        hit = w.scroll_until_text("^Request credit from another", max_scrolls=8)
        w.tap_node(w.best_tap_target(hit), 3)
    w.step("request-credit")
    w.focus_field(0)
    w.type_text("Metro")
    time.sleep(2)
    w.kb_check("request-search", button_pat="^Send Request$", must_read_pats=["Metro"])
    w.step("request-search-results", settle=0.3, timeline=False)
    w.hide_keyboard()
    for tid, name in (("^limit-field$", "request-limit"), ("^purpose-field$", "request-purpose")):
        f = w.bring_into_view(tid, tid=True)
        if f:
            w.tap_node(f, 1.2)
            w.type_text("5")
            w.kb_check(name, button_pat="^Send Request$")
            w.hide_keyboard()
    w.step("request-form-not-sent", settle=0.5, timeline=False)
    go_home(w)
    # wallet balance after (nothing should have been paid)
    w.tap_text("^action-wallet$", 3, tid=True)
    w.wallet_balance_after = balance_text(dump())
    w.step("wallet-end", timeline=False, save=False)


# ----------------------------------------------------------------------------- report
def report(w, apk_path):
    L = []
    A = L.append
    A("# Android credit walk: %s" % w.apk)
    A("")
    A("APK: `%s`. Emulator: Pixel 6 API 34, 1080x2400. Screenshots: `%s-NN-<screen>.png` in this folder. "
      "Generated by `tools/credit-e2e/android-walk.py`." % (apk_path, w.apk))
    A("")
    A("Legend: A blank card, C overlap, D raw code, E crash. Pixel rule: a card whose crop has >= 98 % pixels within "
      "tolerance of the dominant colour while the dump lists text for it is BLANK.")
    A("")
    A("## Steps")
    A("")
    A("| # | step | cards at 0/1/3 s | min ink | A blank | C overlap | D raw | E crash |")
    A("|---|---|---|---|---|---|---|---|")
    for r in w.results:
        tl = r["timeline"]
        cards = "/".join(str(t["cards"]) for t in tl)
        mi = min([t["min_ink"] for t in tl if t["min_ink"] is not None], default=None)
        A("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
            r["shot"].split("-")[-0 - 0] if False else r["shot"], r["step"], cards, mi,
            "FAIL (%d)" % len(r["A"]) if r["A"] else "PASS", "FAIL (%d)" % len(r["C"]) if r["C"] else "PASS",
            "FAIL" if r["D"] else "PASS", "FAIL" if r["E"] else "PASS"))
    A("")
    A("## Blank-card timeline (check A)")
    A("")
    blanks = [r for r in w.results if r["A"]]
    if not blanks:
        A("No blank card in any sample (all card crops had text ink). Lowest ink seen per step is in the table above.")
    for r in blanks:
        A("### %s (`%s`)" % (r["step"], r["shot"]))
        for t in r["timeline"]:
            A("- t=%ds: %d cards, %d blank" % (t["t"], t["cards"], len(t["blank"])))
        seen_times = [t["t"] for t in r["timeline"] if t["blank"]]
        A("- verdict: %s" % ("PERSISTENT (blank at every sample)" if len(seen_times) == len(r["timeline"]) else
                             "TRANSIENT (blank at t=%s only)" % seen_times))
        for b in r["A"][:8]:
            A("  - %s ink=%.4f bg=%s text=%r" % (b["node"], b["ink"], b["dom"], b["text"]))
        A("")
    A("## Keyboard measurements (check B)")
    A("")
    A("| shot | keyboard top Y | check | result | evidence |")
    A("|---|---|---|---|---|")
    for k in w.kb:
        if not k["checks"]:
            continue
        for c in k["checks"]:
            A("| %s | %s | %s | %s | %s |" % (k["shot"], k["kb_top"], c[0], c[1], c[2].replace("|", "/")))
    A("")
    A("## Overlaps, raw codes, crashes")
    A("")
    for r in w.results:
        for x in r["C"]:
            A("- C `%s`: %s" % (r["shot"], x))
        for x in r["D"]:
            A("- D `%s`: %s" % (r["shot"], x))
        for x in r["E"]:
            A("- E `%s`: %s" % (r["shot"], x))
    A("")
    A("## Facts")
    A("")
    A("- I paid form variant: %s" % ("NEW (Change invoice)" if getattr(w, "new_form", False) else "OLD (all invoices listed)"))
    A("- multi-pay total trace (initial, after toggles): %s" % (getattr(w, "multi_total_trace", None),))
    for nt in w.notes:
        A("- note: %s" % nt)
    A("- wallet balance before / after the walk: %s / %s" % (getattr(w, "wallet_balance_before", None),
                                                           getattr(w, "wallet_balance_after", None)))
    A("")
    A("## Prioritised problems (automatic)")
    A("")
    n = 0
    for r in blanks:
        n += 1
        A("%d. BLANK-CARD on `%s` (%s): %d card(s), e.g. %s" % (n, r["shot"], r["step"], len(r["A"]), r["A"][0]["node"]))
    for k in w.kb:
        for c in k["checks"]:
            if c[1] == "FAIL":
                n += 1
                A("%d. KEYBOARD %s on `%s`: %s" % (n, c[0], k["shot"], c[2]))
    for r in w.results:
        if r["D"] or r["E"]:
            n += 1
            A("%d. RAW/CRASH on `%s`: %s %s" % (n, r["shot"], r["D"][:2], r["E"][:2]))
    if n == 0:
        A("None found by the automatic checks.")
    A("")
    A("## Visual review")
    A("")
    A("(To be added by the reviewer after looking at the screenshots; the script cannot see these.)")
    path = os.path.join(SHOTS, "%s-REPORT.md" % w.apk)
    open(path, "w").write("\n".join(L) + "\n")
    with open(os.path.join(SHOTS, "%s-results.json" % w.apk), "w") as f:
        json.dump({"results": w.results, "kb": w.kb}, f, indent=1, default=str)
    return path


def install(apk):
    r = subprocess.run([ADB, "-s", "emulator-5554", "install", "-r", apk], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = r.stdout.decode()
    if "Success" not in out:
        print("install failed (%s); uninstalling for a signature mismatch" % out.strip()[:200])
        adb("uninstall", PKG)
        out = subprocess.run([ADB, "-s", "emulator-5554", "install", apk], stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT).stdout.decode()
        if "Success" not in out:
            raise SystemExit("install failed: " + out)


def main(argv):
    global SHOTS
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    if "--shots" in argv:
        SHOTS = argv[argv.index("--shots") + 1]
        args = [a for a in args if a != SHOTS]
    apk = os.path.expanduser(args[0])
    if "--no-install" not in argv:
        install(apk)
    name = os.path.splitext(os.path.basename(apk))[0].replace("mandi-credit-restaurant-", "")
    w = Walk(name)
    fresh = "--keep-session" not in argv
    try:
        walk(w, fresh)
    finally:
        p = report(w, apk)
        print("report:", p)


if __name__ == "__main__":
    main(sys.argv)
