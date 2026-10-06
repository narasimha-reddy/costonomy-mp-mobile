#!/usr/bin/env python3
"""Delivery tracking end-to-end driver. LOCAL stack only. See README.md. Never prints secrets."""
import hmac, hashlib, json, os, subprocess, sys, time, uuid, urllib.request, urllib.error, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
API_PROPS = os.path.join(ROOT, 'costonomy-mp-api/src/main/resources/application-local.properties')
BASE = os.environ.get('API', 'http://localhost:7070/costonomy-mp-api')
API = BASE + '/api/v1'
OUT = os.path.join(HERE, 'out')
SESS = os.path.join(HERE, '.sessions.json')
REPORT = os.path.join(OUT, 'report.json')
os.makedirs(OUT, exist_ok=True)

BUYER, SELLER, OPERATOR = '+919876500004', '+919876511001', '+919876599001'
OUTLET, STORE = 1, 1

_props = {}
for _l in open(API_PROPS):
    if '=' in _l and not _l.startswith('#'):
        k, v = _l.split('=', 1)
        _props[k.strip()] = v.strip()
def props(k, default=''):
    return _props.get(k, default)

MYSQL = '/usr/local/mysql/bin/mysql'
def db(sql):
    r = subprocess.run([MYSQL, '-h127.0.0.1', '-u' + props('spring.datasource.username', 'appuser'), 'costonomy_mp', '-N', '-B', '-e', sql],
                       capture_output=True, text=True,
                       env={**os.environ, 'MYSQL_PWD': props('spring.datasource.password', 'appuser')})
    if r.returncode != 0:
        raise RuntimeError('db error: ' + r.stderr.replace(props('spring.datasource.password', 'appuser'), '***')[:300])
    return [l.split('\t') for l in r.stdout.splitlines()]
def db1(sql):
    rows = db(sql)
    return rows[0][0] if rows and rows[0] else None

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

def sign(raw): return hmac.new(props('costonomy.mp.pidge.webhook-secret').encode(), raw, hashlib.sha256).hexdigest()
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
    spec = dict(web='http://localhost:7071', out=os.path.join(OUT, 'shots'), tokens=toks, shots=[
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
