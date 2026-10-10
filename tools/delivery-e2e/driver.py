#!/usr/bin/env python3
"""Delivery tracking end-to-end driver. LOCAL stack only. See README.md. Never prints secrets."""
import hmac, hashlib, json, os, subprocess, sys, time, uuid, urllib.request, urllib.error, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
API_PROPS = os.path.join(ROOT, 'costonomy-mp-api/src/main/resources/application-local.properties')
BASE = os.environ.get('API', 'http://localhost:7080/costonomy-mp-api')
WEB = os.environ.get('WEB', 'http://localhost:7074')
API = BASE + '/api/v1'
OUT = os.path.join(HERE, 'out')
SESS = os.path.join(HERE, '.sessions.json')
REPORT = os.path.join(OUT, 'report.json')
SHOT_WIDTHS = [int(w) for w in os.environ.get('SHOT_WIDTHS', '360,390,412').split(',') if w.strip()]
os.makedirs(OUT, exist_ok=True)
FORBIDDEN_PORTS = ('7070', '7071', '3306')  # the user's own stack; never touched
# Seeded outlet 1 of the merged database.
OUTLET_LATLNG = (12.9784, 77.6408)

BUYER, SELLER, OPERATOR = '+919876500004', '+919876511001', '+919876599001'
OUTLET, STORE = 1, 1

# Database access: MYSQL_CMD is the full command prefix, the SQL is appended as `-N -B -e <sql>`.
# Default is the merged stack's Docker container (root password is the local container's, not a secret of ours).
DEFAULT_MYSQL_CMD = 'docker exec -i merged-mysql mysql -uroot -proot costonomy_mp'
MYSQL_CMD = os.environ.get('MYSQL_CMD', DEFAULT_MYSQL_CMD)

_props = None
def _load_props():
    """application-local.properties is optional; read lazily and only for what the environment does not give."""
    global _props
    if _props is None:
        _props = {}
        try:
            for _l in open(API_PROPS):
                if '=' in _l and not _l.startswith('#'):
                    k, v = _l.split('=', 1)
                    _props[k.strip()] = v.strip()
        except OSError:
            pass
    return _props
def props(k, default=''):
    return _load_props().get(k, default)

def pidge_secret():
    """PIDGE_WEBHOOK_SECRET from the environment first, then the properties file. Never printed."""
    return os.environ.get('PIDGE_WEBHOOK_SECRET') or props('costonomy.mp.pidge.webhook-secret')

def _docker_env():
    env = dict(os.environ)
    home = os.path.expanduser('~')
    dpath = os.path.join(home, '.local/opt/docker')
    if os.path.isdir(dpath) and dpath not in env.get('PATH', ''):
        env['PATH'] = dpath + os.pathsep + env.get('PATH', '')
    sock = os.path.join(home, '.colima/default/docker.sock')
    if 'DOCKER_HOST' not in env and os.path.exists(sock):
        env['DOCKER_HOST'] = 'unix://' + sock
    return env

def db(sql):
    import shlex
    cmd = shlex.split(MYSQL_CMD) + ['-N', '-B', '-e', sql]
    env = _docker_env()
    if cmd[0].endswith('mysql'):  # a plain client: password from the properties file via the environment
        env['MYSQL_PWD'] = props('spring.datasource.password', 'appuser')
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        err = r.stderr
        for secret in (props('spring.datasource.password', ''), 'root'):
            if secret: err = err.replace(secret, '***')
        raise RuntimeError('db error: ' + err[:300])
    return [l.split('\t') for l in r.stdout.splitlines()]
def db1(sql):
    rows = db(sql)
    return rows[0][0] if rows and rows[0] else None

# ---------------- delivery provider detection ----------------
def delivery_provider():
    """'PIDGE', 'MOCK' or 'UNKNOWN'. The merged stack may run Pidge (sandbox), where the mock partners are not registered.
    UNKNOWN (table lists both mocks and PIDGE enabled, no env or log to decide): Pidge-only tools go ahead with a warning,
    the mock-only helper stays BLOCKED. Set DELIVERY_PROVIDER or API_LOG to be exact.
    Order: DELIVERY_PROVIDER env, then the API log (API_LOG file, if given), then the delivery_provider table and the
    latest delivery's provider_code. Read-only."""
    forced = os.environ.get('DELIVERY_PROVIDER', '').upper()
    if forced in ('PIDGE', 'MOCK'):
        return forced
    log = os.environ.get('API_LOG')
    if log and os.path.exists(log):
        try:
            tail = open(log, errors='ignore').read()[-400000:]
            if 'MOCK_EXPRESS' in tail and 'PIDGE' not in tail: return 'MOCK'
            if 'PIDGE' in tail and 'MOCK_EXPRESS' not in tail: return 'PIDGE'
        except OSError:
            pass
    try:
        enabled = {r[0].upper() for r in db("select code from delivery_provider where enabled=1")}
        mock = any(c.startswith('MOCK') for c in enabled); pidge = 'PIDGE' in enabled
        if mock and not pidge: return 'MOCK'
        if pidge and not mock: return 'PIDGE'
        # Both rows enabled: the table cannot say which one the running API registered (PIDGE removes the mocks).
        if mock and pidge: return 'UNKNOWN'
        return 'PIDGE' if pidge else 'UNKNOWN'
    except Exception:
        return 'UNKNOWN'

def blocked_unless(provider, case, step, expected):
    """Record BLOCKED (not FAIL) when the stack runs a different delivery provider than the helper needs."""
    have = delivery_provider()
    if have == provider or (have == 'UNKNOWN' and provider == 'PIDGE'): return True
    rec(case, step, expected, 'not run', 'BLOCKED', 'stack delivery provider is %s, this step needs %s' % (have, provider))
    return False

def mock_simulate(delivery_id, status, lat=None, lng=None):
    """MOCK provider only: POST /internal/deliveries/{id}/simulate. Returns (code, error) or None when BLOCKED."""
    if delivery_provider() != 'MOCK':
        print('BLOCKED: mock simulate needs the MOCK delivery provider (stack runs %s)' % delivery_provider())
        return None
    body = {'status': status}
    if lat is not None: body.update(latitude=lat, longitude=lng)
    code, d, e = api('POST', '/internal/deliveries/%s/simulate' % delivery_id, tok('operator'), body)
    return code, e

def healthy():
    try:
        with urllib.request.urlopen(BASE + '/actuator/health', timeout=5) as r:
            return json.load(r).get('status') == 'UP'
    except Exception:
        return False
def wait_health(timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if healthy():
            return True
        time.sleep(3)
    raise RuntimeError('API not healthy')

def _raw(method, path, token=None, body=None, idem=True, headers=None, raw=None, retry=True):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = 'Bearer ' + token
    if idem and method in ('POST', 'PUT', 'PATCH', 'DELETE'): h['Idempotency-Key'] = str(uuid.uuid4())
    if headers: h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if isinstance(data, str): data = data.encode()
    if method in ('POST', 'PUT', 'PATCH') and data is None: data = b'{}'
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode(); code = r.status
    except urllib.error.HTTPError as e:
        txt = e.read().decode(); code = e.code
    except (urllib.error.URLError, ConnectionError) as e:
        if retry:
            wait_health(); return _raw(method, path, token, body, idem, headers, raw, retry=False)
        raise
    try: j = json.loads(txt) if txt else {}
    except Exception: j = {'_text': txt[:200]}
    return code, j

def api(method, path, token=None, body=None, idem=True, headers=None, raw=None):
    """Returns (status, data, error)."""
    code, j = _raw(method, path, token, body, idem, headers, raw)
    return code, j.get('data'), j.get('error') or (j if code >= 400 else None)

# ---------------- sessions ----------------
def _load():
    try: return json.load(open(SESS))
    except Exception: return {}
def _save(c):
    fd = os.open(SESS, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f: json.dump(c, f)
def adopt(phone, tokens):
    c = _load(); c[phone] = tokens; _save(c)
def session(phone):
    """access token; refresh preferred, OTP login at most once per number."""
    c = _load()
    if phone in c:
        code, d, e = api('POST', '/auth/refresh', body={'refreshToken': c[phone]['refreshToken']}, idem=False)
        if code == 200:
            c[phone] = d; _save(c); return d['accessToken']
    while True:
        code, d, e = api('POST', '/auth/otp/request', body={'phone': phone, 'purpose': 'LOGIN'}, idem=False)
        if code == 429 or (e and e.get('code') == 'OTP_RESEND_TOO_SOON'):
            time.sleep(((e or {}).get('details') or {}).get('retryAfterSeconds', 60) + 1); continue
        break
    code, d, e = api('POST', '/auth/otp/verify', body={'phone': phone, 'otp': props('costonomy.mp.otp.mock-code', '123456'), 'purpose': 'LOGIN'}, idem=False)
    if code != 200: raise RuntimeError('login failed %s %s' % (phone, e))
    c = _load(); c[phone] = d; _save(c); return d['accessToken']

def until(fn, timeout=60, every=2):
    t0 = time.time(); last = None
    while time.time() - t0 < timeout:
        last = fn()
        if last: return last
        time.sleep(every)
    return last

# ---------------- report ----------------
RESULTS = []
def rec(case, step, expected, observed, result, evidence=''):
    RESULTS.append(dict(case=case, step=step, expected=str(expected), observed=str(observed), result=result, evidence=str(evidence)))
    print('  [%s] %s / %s | exp=%s | obs=%s | %s' % (result, case, step, str(expected)[:80], str(observed)[:120], str(evidence)[:100]))
    sys.stdout.flush()
    json.dump(RESULTS, open(REPORT, 'w'), indent=1)
def check(case, step, expected, observed, evidence='', ok=None):
    ok = (expected == observed) if ok is None else ok
    rec(case, step, expected, observed, 'PASS' if ok else 'FAIL', evidence)
    return ok

# ---------------- building blocks ----------------
class Ctx: pass
def tok(who): return session({'buyer': BUYER, 'seller': SELLER, 'operator': OPERATOR}[who])

def sku_id():
    return int(db1("select id from supplier_sku where supplier_store_id=1 and status='ACTIVE' order by id limit 1"))

def request(pref='DELIVERY', offer='COSTONOMY', fee=None, qty=2):
    b, s = tok('buyer'), tok('seller')
    code, d, e = api('POST', '/outlets/%d/intent-items' % OUTLET, b, {'supplierSkuId': sku_id(), 'quantity': qty})
    assert code == 200, (code, e)
    iid, item = d['id'], d['items'][0]['id']
    if pref == 'PICKUP':
        code, d, e = api('PUT', '/intents/%d/delivery-preference' % iid, b, {'preference': 'PICKUP'}); assert code == 200, (code, e)
    code, d, e = api('POST', '/intents/%d/send' % iid, b, {}); assert code == 200, (code, e)
    body = {'lines': [{'intentItemId': item, 'offeredQuantity': qty}]}
    if offer is not None:
        body['deliveryOffer'] = offer
        if fee is not None: body['deliveryFee'] = fee
    code, d, e = api('POST', '/intents/%d/respond' % iid, s, body)
    assert code == 200, ('respond', code, e)
    return iid

def order(iid, mode, method, expect=200):
    b = tok('buyer'); body = {'deliveryMode': mode, 'paymentMethod': method}
    if mode == 'COSTONOMY_DELIVERY':
        code, d, e = api('POST', '/intents/%d/delivery-quote' % iid, b, {})
        assert code == 200, ('quote', code, e)
        body['deliveryQuoteReference'] = d['quoteReference']
    code, d, e = api('POST', '/intents/%d/orders' % iid, b, body)
    if expect is not None and code != expect: raise AssertionError(('order', code, e))
    return code, d, e

def sorder(oid): 
    code, d, e = api('GET', '/supplier-orders/%d' % oid, tok('buyer')); return d
def ostatus(oid): return db1('select status from supplier_order where id=%d' % oid)

def prep_ready(oid):
    s = tok('seller')
    c1, d, e = api('POST', '/supplier-orders/%d/preparing' % oid, s, {}); assert c1 == 200, ('preparing', c1, e)
    c2, d, e = api('POST', '/supplier-orders/%d/ready' % oid, s, {}); assert c2 == 200, ('ready', c2, e)

def delivery_of(oid, timeout=300):
    r = until(lambda: db("select id,status,coalesce(provider_delivery_id,''),coalesce(mode,'') from delivery where supplier_order_id=%d order by id desc limit 1" % oid), timeout, 2)
    return r[0] if r else None

def dstatus(did): return db1('select status from delivery where id=%s' % did)

def pidge_order(pid, dummy):
    code, d, e = api('GET', '/admin/deliveries/pidge/sandbox/status?pidgeDeliveryId=%s&dummyStatus=%s' % (pid, urllib.parse.quote(dummy)), tok('operator'), idem=False)
    if code != 200: raise RuntimeError('pidge status %s %s' % (code, e))
    return (d or {}).get('data', d)
import urllib.parse

def sign(raw): return hmac.new(pidge_secret().encode(), raw, hashlib.sha256).hexdigest()
def post_webhook(obj, bad_sig=False, signed_raw=None):
    raw = signed_raw or json.dumps(obj, separators=(',', ':')).encode()
    sig = 'deadbeef' * 8 if bad_sig else sign(raw)
    return _raw('POST', '/webhooks/delivery/pidge', None, raw=raw, idem=False, headers={'X-Pidge-Signature': sig})[0]

def _logs(obj):
    f = obj.get('fulfillment') or {}
    return f.get('logs') if isinstance(f.get('logs'), list) else []

def add_location(obj, lat, lng):
    logs = _logs(obj)
    if not logs: return obj
    if any((lg.get('location') or {}).get('latitude') for lg in logs): return obj
    # The log Pidge lists first is the newest.
    ts = [lg.get('timestamp') or '' for lg in logs]
    newest = logs[ts.index(max(ts))]
    newest['location'] = {'latitude': lat, 'longitude': lng}
    return obj

def pidge_stage(pid, dummy, lat=19.0, lng=72.8, bad_sig=False):
    """Fetch Pidge's sandbox order at a stage, make sure a location is present, post it to our webhook."""
    time.sleep(1)
    obj = pidge_order(pid, dummy)
    add_location(obj, lat, lng)
    return post_webhook(obj, bad_sig), obj

def craft_cancel(pid, base_obj=None):
    """The rider's fulfilment cancelled while the parent stays fulfilled."""
    obj = base_obj or pidge_order(pid, 'fulfilled|out for pickup')
    obj['status'] = 'fulfilled'
    obj.setdefault('fulfillment', {})['status'] = 'CANCELLED'
    obj['fulfillment'].setdefault('logs', []).insert(0, {'status': 'CANCELLED', 'timestamp': now_iso()})
    return post_webhook(obj), obj

def now_iso(): return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

def receive(oid):
    b = tok('buyer'); o = sorder(oid)
    items = [{'supplierOrderItemId': it['id'], 'receivedQuantity': it.get('acceptedQuantity') or it.get('requestedQuantity'), 'damagedQuantity': 0, 'missingQuantity': 0} for it in o['items']]
    return api('POST', '/supplier-orders/%d/receive' % oid, b, {'items': items})

# ---------------- screenshots ----------------
def shoot(case, step, shots):
    """shots: list of (aud, path, expect[], forbid[]). Returns list of shot results; records PASS/FAIL per shot."""
    toks = {}
    for aud, who in (('buyer', 'buyer'), ('seller', 'seller')):
        if any(s[0] == aud for s in shots):
            tok(who)  # refresh
            toks[aud] = _load()[BUYER if who == 'buyer' else SELLER]
            toks[aud] = {'accessToken': toks[aud]['accessToken'], 'refreshToken': toks[aud]['refreshToken']}
    spec = dict(web=WEB, widths=SHOT_WIDTHS, out=os.path.join(OUT, 'shots'), tokens=toks, shots=[
        dict(aud=a, path=p, name='%s-%s-%s' % (case, a, step if len(shots) == 1 else '%s%d' % (step, i)), expect=e, forbid=f)
        for i, (a, p, e, f) in enumerate(shots)])
    sp = os.path.join(OUT, '.spec.json')
    fd = os.open(sp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f: json.dump(spec, f)
    r = subprocess.run(['node', os.path.join(HERE, 'shots.js'), sp], capture_output=True, text=True, timeout=300)
    os.remove(sp)
    if r.returncode != 0: raise RuntimeError('shots.js: ' + r.stderr[-300:])
    out = json.loads(r.stdout.strip().splitlines()[-1])
    for aud, t in out['tokens'].items():
        if t.get('accessToken') and t.get('refreshToken'):
            adopt(BUYER if aud == 'buyer' else SELLER, t)
    for s in out['results']:
        rec(case, 'shot ' + s['name'], 'contains %s; lacks %s' % (spec_exp(shots, s), spec_forb(shots, s)),
            ('missing=%s forbidden=%s | %s' % (s['missing'], s['forbiddenPresent'], s['text'][:300])),
            'PASS' if s['ok'] else 'FAIL', os.path.relpath(s['png'], HERE))
    return out['results']
def spec_exp(shots, s): 
    return [x for a, p, e, f in shots if p == s['path'] and a == s['aud'] for x in e]
def spec_forb(shots, s):
    return [x for a, p, e, f in shots if p == s['path'] and a == s['aud'] for x in f]

# ---------------- test-data setup that must be undone ----------------
RESTORE = os.path.join(OUT, '.restore.json')
def widen_hours():
    """Open the store all day (it is closed at night); remember the original so restore_hours() can undo it."""
    s = tok('seller')
    c, d, e = api('GET', '/supplier-stores/%d' % STORE, s, idem=False)
    orig = d['operatingHours']
    if not os.path.exists(RESTORE):
        json.dump({'operatingHours': orig}, open(RESTORE, 'w'))
    c, d, e = api('PATCH', '/supplier-stores/%d' % STORE, s, {'operatingHours': {'days': orig['days'], 'opensAt': '00:00', 'closesAt': '23:59'}})
    return c, e
def restore_hours():
    if not os.path.exists(RESTORE): return None
    orig = json.load(open(RESTORE))['operatingHours']
    c, d, e = api('PATCH', '/supplier-stores/%d' % STORE, tok('seller'), {'operatingHours': orig})
    if c == 200: os.remove(RESTORE)
    return c


# ---------------- self-test ----------------
def self_test():
    """Checks the env wiring only: no network, no database, no writes. Fails if anything points at 7070/7071/3306."""
    import re, shlex
    fails = []
    def port_hit(text):
        return [p for p in FORBIDDEN_PORTS if re.search(r'(?<!\d)%s(?!\d)' % p, text)]
    print('self-test (no network, no database)')
    for name, val in (('API', BASE), ('WEB', WEB), ('MYSQL_CMD', MYSQL_CMD)):
        shown = val.replace('-proot', '-p***')
        hit = port_hit(val)
        print('  %-9s would use: %s%s' % (name, shown, '   <-- FORBIDDEN PORT ' + ','.join(hit) if hit else ''))
        if hit: fails.append('%s points at %s' % (name, ','.join(hit)))
    for name, val in (('API', BASE), ('WEB', WEB)):
        if not re.match(r'^https?://[^/]+:\d+', val): fails.append('%s has no explicit port: %s' % (name, val))
    parts = shlex.split(MYSQL_CMD)
    if not parts: fails.append('MYSQL_CMD is empty')
    elif parts[0] == 'docker':
        print('  DB via docker container: %s' % next((p for p in parts[2:] if not p.startswith('-')), '?'))
    elif not any(re.match(r'^(-P|--port=)\d+$', p) for p in parts):
        print('  DB via a plain client with no port flag: it would use the default 3306')
        fails.append('MYSQL_CMD is a plain client without a non-default port (default is 3306)')
    print('  PIDGE_WEBHOOK_SECRET: %s' % ('set (%s)' % ('environment' if os.environ.get('PIDGE_WEBHOOK_SECRET') else 'properties file') if pidge_secret() else 'NOT set (only simulate_riders/stage/cases need it)'))
    print('  screenshot widths: %s' % SHOT_WIDTHS)
    print('  outlet: %s,%s' % OUTLET_LATLNG)
    js = os.path.join(HERE, 'shots.js')
    if not all(str(w) in open(js).read() for w in (360, 390, 412)): fails.append('shots.js lacks widths 360/390/412')
    print('  delivery provider: detected at run time (DELIVERY_PROVIDER, API_LOG, delivery_provider table); mock-only steps say BLOCKED on PIDGE')
    if fails:
        print('SELF-TEST FAILED:'); [print('  - ' + f) for f in fails]
        return 1
    print('SELF-TEST OK')
    return 0

if __name__ == '__main__':
    if '--self-test' in sys.argv:
        sys.exit(self_test())
    print(__doc__ or '', 'usage: driver.py --self-test')
