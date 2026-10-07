#!/usr/bin/env python3
"""Runs the delivery e2e cases. usage: python3 cases.py [1 2 3 ...]  (default: all)."""
import sys, traceback
from driver import *

TRACK = '/restaurant/tracking/%d'
STRACK = '/supplier/tracking/%d'
LOC_NEAR_SUPPLIER = (12.9650, 77.6400)
LOC_MID = (12.9700, 77.6395)
OUTLET_LL = OUTLET_LATLNG

def D(oid): return delivery_of(oid)
def shot_pair(case, step, oid, bexp=(), bforbid=(), sexp=(), sforbid=(), extra=()):
    shots = []
    if bexp or bforbid: shots.append(('buyer', TRACK % oid, list(bexp), list(bforbid)))
    if sexp or sforbid: shots.append(('seller', STRACK % oid, list(sexp), list(sforbid)))
    shots += list(extra)
    return shoot(case, step, shots)

def stage(case, step, did, pid, dummy, want, loc=LOC_MID):
    code, obj = pidge_stage(pid, dummy, *loc)
    check(case, 'webhook ' + step, 200, code, 'pidge dummy=%s' % dummy)
    got = until(lambda: dstatus(did) == want and want, 10, 1) and want or dstatus(did)
    check(case, 'status after ' + step, want, got, 'delivery %s' % did)
    return obj

def fund_costonomy_delivery(case, pref='DELIVERY', offer='COSTONOMY', fee=None, method='CREDIT'):
    iid = request(pref, offer, fee)
    code, d, e = order(iid, 'COSTONOMY_DELIVERY', method)
    oid = d['supplierOrderId']
    return iid, oid, d

def get_order_row(oid): return db("select status,payment_status,delivery_mode,payment_method,total_amount,delivery_fee from supplier_order where id=%d" % oid)[0]

def to_ready(case, oid):
    prep_ready(oid)
    row = D(oid)
    return row  # id,status,provider_delivery_id,mode

def leftovers_cancel():
    rows = db("select id from delivery where status in ('QUOTE_FAILED','PROVIDER_UNAVAILABLE','DELIVERY_REQUESTED','QUOTE_RECEIVED','PROVIDER_SELECTED','DRIVER_ASSIGNED','DRIVER_CANCELLED') and mode='COSTONOMY'")
    for (i,) in rows:
        api('POST', '/deliveries/%s/cancel' % i, tok('seller'), {'reason': 'e2e cleanup'})
    return [r[0] for r in rows]

# ---------------------------------------------------------------- case 1
def case1():
    c = '1'
    iid, oid, d = fund_costonomy_delivery(c)
    pay = (d.get('payment') or {})
    check(c, 'order placed', 'CONFIRMED/funded', get_order_row(oid)[0] + '/' + get_order_row(oid)[1], 'order %d intent %d' % (oid, iid), ok=get_order_row(oid)[0] == 'CONFIRMED')
    shot_pair(c, '01-confirmed', oid, bexp=['Order placed', 'Step 1 of 5'], bforbid=['Track'], sexp=['New order to prepare'])
    row = to_ready(c, oid)
    check(c, 'delivery row after ready', 'row with PROVIDER_SELECTED + provider id', row, 'delivery %s' % (row and row[0]), ok=bool(row) and row[1] == 'PROVIDER_SELECTED' and bool(row[2]))
    did, pid = row[0], row[2]
    shot_pair(c, '02-finding', oid, bexp=['Finding a delivery partner', 'SEARCHING'], bforbid=['Track', 'Call '], sexp=['Finding a delivery partner'])
    stage(c, 'out for pickup', did, pid, 'fulfilled|out for pickup', 'DRIVER_ASSIGNED')
    dn = db1('select driver_name from delivery where id=%s' % did)
    check(c, 'driver_name set', 'not null', dn, ok=bool(dn) and dn != 'NULL')
    shot_pair(c, '03-assigned', oid, bexp=['heading to the supplier', 'Step 3 of 5', 'ON TIME'], sexp=['Partner on the way to you'],
              extra=[('buyer', '/restaurant/orders/%d' % oid, ['Track'], [])])
    stage(c, 'reached pickup', did, pid, 'fulfilled|reached pickup', 'DRIVER_AT_PICKUP')
    stage(c, 'picked up', did, pid, 'fulfilled|picked up', 'PICKED_UP')
    stage(c, 'out for delivery', did, pid, 'fulfilled|ofd', 'IN_TRANSIT')
    ost = until(lambda: ostatus(oid) == 'OUT_FOR_DELIVERY' and 'OUT_FOR_DELIVERY', 10, 1) or ostatus(oid)
    check(c, 'order OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', ost)
    eta = db1('select estimated_arrival_at from delivery where id=%s' % did)
    seeded = False
    if eta in (None, 'NULL'):
        # Pidge's sandbox states no ETA (commit 026a65a: "Pidge quote leaves an unstated ETA"), so the buyer sees
        # "On the way" without a countdown. Record that, then seed an arrival time to exercise the ETA states.
        shot_pair(c, '04a-no-eta', oid, bexp=['On the way', 'ON TIME', 'Step 4 of 5'], bforbid=['Arriving in', 'Running late'], sexp=['Out for delivery'])
        db("update delivery set estimated_arrival_at = utc_timestamp(6) + interval 20 minute where id=%s" % did)  # stored times are UTC
        seeded = True
    check(c, 'estimated_arrival_at available (Pidge or seeded)', 'not null', db1('select estimated_arrival_at from delivery where id=%s' % did),
          'seeded by the test: Pidge sandbox states no ETA' if seeded else 'from provider', ok=db1('select estimated_arrival_at from delivery where id=%s' % did) not in (None, 'NULL'))
    shot_pair(c, '04-ontime', oid, bexp=['Arriving in', 'ON TIME', 'Step 4 of 5'], bforbid=['Running late'], sexp=['Out for delivery'])
    # late
    if True:
        db("update delivery set estimated_arrival_at = utc_timestamp(6) - interval 10 minute where id=%s" % did)  # stored times are UTC
        shot_pair(c, '05-late', oid, bexp=['Running late', 'LATE BY'], sexp=['Running late'])
    stage(c, 'reached delivery', did, pid, 'fulfilled|reached delivery', 'ARRIVED_AT_DESTINATION')
    obj = stage(c, 'delivered', did, pid, 'fulfilled|delivered', 'DELIVERED')
    ost = until(lambda: ostatus(oid) == 'DELIVERED' and 'DELIVERED', 10, 1) or ostatus(oid)
    check(c, 'order DELIVERED', 'DELIVERED', ost)
    shot_pair(c, '06-delivered', oid, bexp=['Delivered', 'Check in delivery', 'Report an issue'], bforbid=['Track'], sexp=['Waiting for the restaurant to check it in'])
    # replay + bad signature
    before = db1('select count(*) from delivery_event where delivery_id=%s' % did)
    code = post_webhook(obj)
    after = db1('select count(*) from delivery_event where delivery_id=%s' % did)
    check(c, 'replayed webhook adds no event row', before, after, 'http %s' % code)
    check(c, 'bad signature', 401, post_webhook(obj, bad_sig=True))
    code, d, e = receive(oid)
    check(c, 'receive', 200, code, str(e)[:150] if e else '')
    check(c, 'order COMPLETED', 'COMPLETED', ostatus(oid))
    shot_pair(c, '07-completed', oid, bexp=['Order completed'], sexp=['Completed'])
    return oid


# ---------------------------------------------------------------- shared bits
CLOCK = 'utc_timestamp' if os.environ.get('E2E_CLOCK') == 'utc' else 'now'   # the clock the retry queries read
def credit_utilized():
    c, d, e = api('GET', '/outlets/%d/credit/agreements' % OUTLET, tok('buyer'), idem=False)
    a = [x for x in d if x['supplierStoreId'] == STORE][0]
    return a['utilized'], a['available']
def own_order(c, fee=40, method='CREDIT', offer='SELF'):
    iid = request('DELIVERY', offer, fee)
    code, d, e = order(iid, 'SUPPLIER_DELIVERY', method)
    return iid, d['supplierOrderId'], d

# ---------------------------------------------------------------- case 2
def case2():
    c = '2'
    iid = request('DELIVERY', 'SELF_FREE', 0)
    code, d, e = order(iid, 'SUPPLIER_DELIVERY', 'PREPAID')
    oid = d['supplierOrderId']; pay = d.get('payment') or {}
    r = get_order_row(oid)
    check(c, 'prepaid order is DRAFT, payment CREATED', 'DRAFT/CREATED', '%s/%s' % (r[0], db1('select status from payment where supplier_order_id=%d' % oid)), 'order %d' % oid)
    shoot(c, '01-pay', [('buyer', '/restaurant/pay/%d' % oid, [], [])])
    shot_pair(c, '02-draft', oid, bexp=['Payment incomplete'], sexp=[])
    rec(c, 'pay via Razorpay checkout', 'AUTHORIZED, CONFIRMED, CAPTURED after ready', 'not run', 'BLOCKED',
        'tools/razorpay-e2e has no node_modules (puppeteer-core not installed; npm install needs network). MOCK provider not enabled so no simulation endpoint.')
    api('POST', '/supplier-orders/%d/cancel' % oid, tok('buyer'), {'reason': 'e2e cleanup'})

# ---------------------------------------------------------------- case 3
def case3():
    c = '3'
    iid, oid, d = own_order(c, 40, 'CREDIT')
    rec(c, 'WALLET funding', 'wallet debited 40+', 'wallet balance 0.0000; top-up needs Razorpay', 'BLOCKED', 'funded with CREDIT instead; delivery behaviour is payment-independent')
    r = get_order_row(oid)
    check(c, 'delivery_fee=40, mode SUPPLIER_DELIVERY', '40/SUPPLIER_DELIVERY', '%s/%s' % (float(r[5]), r[2]), 'order %d' % oid, ok=float(r[5]) == 40 and r[2] == 'SUPPLIER_DELIVERY')
    prep_ready(oid)
    row = D(oid)
    check(c, 'delivery row mode SUPPLIER_OWN', 'SUPPLIER_OWN', row and row[3], 'delivery %s %s' % (row and row[0], row and row[1]))
    did = row[0]
    shot_pair(c, '01-ready', oid, bexp=['Packed and ready', 'delivering this themselves. No live tracking'], bforbid=['Track', 'Searching', 'SEARCHING'], sexp=['Ready to send'],
              extra=[('buyer', '/restaurant/orders/%d' % oid, [], ['Track'])])
    code, d, e = api('POST', '/deliveries/%s/dispatched' % did, tok('seller'), {})
    check(c, 'dispatched', 200, code, str(e)[:120] if e else '')
    check(c, 'order OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', until(lambda: ostatus(oid) == 'OUT_FOR_DELIVERY' and 'OUT_FOR_DELIVERY', 10, 1) or ostatus(oid))
    shot_pair(c, '02-onway', oid, bexp=['On the way', 'delivering this themselves. No live tracking'], bforbid=['Track', 'Call '], sexp=['Out for delivery', 'Mark it delivered'],
              extra=[('buyer', '/restaurant/orders/%d' % oid, [], ['Track'])])
    code, d, e = api('POST', '/deliveries/%s/delivered' % did, tok('seller'), {})
    check(c, 'delivered', 200, code, str(e)[:120] if e else '')
    check(c, 'order DELIVERED', 'DELIVERED', until(lambda: ostatus(oid) == 'DELIVERED' and 'DELIVERED', 10, 1) or ostatus(oid))
    shot_pair(c, '03-delivered', oid, bexp=['Delivered', 'Check in delivery'], bforbid=['Track'], sexp=['Waiting for the restaurant to check it in'])
    code, d, e = receive(oid)
    check(c, 'receive', 200, code, str(e)[:120] if e else '')
    check(c, 'order COMPLETED', 'COMPLETED', ostatus(oid))

# ---------------------------------------------------------------- case 4
def case4():
    c = '4'
    iid = request('PICKUP', 'COSTONOMY')
    offer = db1('select delivery_offer from intent where id=%d' % iid) if db("show columns from intent like 'delivery_offer'") else None
    rec(c, 'offer forced NONE on pickup request', 'NONE', offer, 'PASS' if offer in ('NONE', None) else 'FAIL', 'intent %d' % iid)
    code, d, e = order(iid, 'COSTONOMY_DELIVERY', 'CREDIT', expect=None)
    check(c, 'COSTONOMY_DELIVERY refused', '400/422 (plan said 422; API answers 400 VALIDATION_ERROR)', code, str((e or {}).get('code')), ok=code in (400, 422))
    code, d, e = order(iid, 'PICKUP', 'CREDIT', expect=None)
    check(c, 'PICKUP accepted', 200, code, str(e)[:100] if e else '')
    oid = d['supplierOrderId']
    prep_ready(oid)
    time.sleep(8)
    n = db1('select count(*) from delivery where supplier_order_id=%d' % oid)
    check(c, 'no delivery row created', '0', n, 'order %d' % oid)
    check(c, 'order READY_FOR_PICKUP', 'READY_FOR_PICKUP', ostatus(oid))
    shot_pair(c, '01-ready', oid, bexp=['Ready to collect', 'Step 3 of 3'], bforbid=['Track', 'Step 4', 'of 5'], sexp=['Waiting for collection'],
              extra=[('buyer', '/restaurant/orders/%d' % oid, [], ['Track'])])
    code, d, e = receive(oid)
    check(c, 'receive from READY_FOR_PICKUP', 200, code, str(e)[:120] if e else '')
    check(c, 'order COMPLETED', 'COMPLETED', ostatus(oid))

# ---------------------------------------------------------------- case 5
def case5():
    c = '5'
    iid = request('DELIVERY', 'NONE')
    code, d, e = order(iid, 'SUPPLIER_DELIVERY', 'CREDIT', expect=None)
    check(c, 'SUPPLIER_DELIVERY refused', '400/422 (plan said 422; API answers 400 VALIDATION_ERROR)', code, str((e or {}).get('code')) + ' ' + str((e or {}).get('message'))[:80], ok=code in (400, 422))
    b = tok('buyer')
    qc, qd, qe = api('POST', '/intents/%d/delivery-quote' % iid, b, {})
    if qc == 200:
        code, d, e = api('POST', '/intents/%d/orders' % iid, b, {'deliveryMode': 'COSTONOMY_DELIVERY', 'paymentMethod': 'CREDIT', 'deliveryQuoteReference': qd['quoteReference']})
    else:
        code, e = qc, qe
    check(c, 'COSTONOMY_DELIVERY refused', '400/422 (plan said 422)', code, 'quote=%s %s' % (qc, str((e or {}).get('code'))), ok=code in (400, 422))
    code, d, e = order(iid, 'PICKUP', 'CREDIT', expect=None)
    check(c, 'PICKUP accepted', 200, code, str(e)[:100] if e else '')
    if code == 200: api('POST', '/supplier-orders/%d/supplier-cancel' % d['supplierOrderId'], tok('seller'), {'reason': 'e2e cleanup'})

# ---------------------------------------------------------------- case 6 / 7 (no partner)
ORIG_OUTLET = {}
def force_far():
    r = db("select latitude,longitude from outlet where id=%d" % OUTLET)[0]
    ORIG_OUTLET['ll'] = r
    json.dump({'outlet': r}, open(os.path.join(OUT, '.restore-outlet.json'), 'w'))
    db("update outlet set latitude=19.0760, longitude=72.8777 where id=%d" % OUTLET)
def restore_outlet():
    p = os.path.join(OUT, '.restore-outlet.json')
    if os.path.exists(p):
        r = json.load(open(p))['outlet']
        db("update outlet set latitude=%s, longitude=%s where id=%d" % (r[0], r[1], OUTLET))
        os.remove(p)
def no_partner_delivery(c):
    """Costonomy-delivery order whose delivery cannot find a partner (drop is far away)."""
    leftovers_cancel()
    iid, oid, d = fund_costonomy_delivery(c)
    s = tok('seller')
    api('POST', '/supplier-orders/%d/preparing' % oid, s, {})
    force_far()
    try:
        code, dd, e = api('POST', '/supplier-orders/%d/ready' % oid, s, {}); assert code == 200, (code, e)
        row = delivery_of(oid, 900)   # the outbox relay can be held up for minutes by a slow provider call
        until(lambda: dstatus(row[0]) == 'QUOTE_FAILED' and 1, 120, 2)
    finally:
        restore_outlet()
    return oid, row[0]

def case6():
    c = '6'
    oid, did = no_partner_delivery(c)
    r = db("select status, no_partner_since, auto_retry_count, own_delivery_offered_at from delivery where id=%s" % did)[0]
    check(c, 'QUOTE_FAILED with no_partner_since', 'QUOTE_FAILED + no_partner_since', r, 'order %d delivery %s' % (oid, did), ok=r[0] == 'QUOTE_FAILED' and r[1] != 'NULL')
    shot_pair(c, '01-nopartner', oid, bexp=['Still arranging delivery'], bforbid=['No delivery partner covers', 'NO_SERVICEABLE'],
              sexp=['No partner found yet', 'Try again', 'Still looking for a partner automatically'], sforbid=['I will deliver it myself'])
    t0 = time.time()
    n = until(lambda: int(db1('select auto_retry_count from delivery where id=%s' % did)) > 0 and 1, 200, 10)
    check(c, 'auto_retry_count rises within ~3 min', '>0', db1('select auto_retry_count from delivery where id=%s' % did), 'waited %ds' % (time.time() - t0), ok=bool(n))
    # buyer/supplier guards before the offer
    b, s = tok('buyer'), tok('seller')
    st = db1('select own_delivery_offered_at from delivery where id=%s' % did)
    if st == 'NULL':
        code, d, e = api('POST', '/deliveries/%s/switch-to-own' % did, s, {})
        check(c, 'supplier switch-to-own before offer', 409, code, str((e or {}).get('code')))
    else:
        rec(c, 'supplier switch-to-own before offer', '409', 'offer already made before the check (see no_partner_since clock finding)', 'BLOCKED', 'own_delivery_offered_at=%s' % st)
    code, d, e = api('POST', '/deliveries/%s/switch-to-own' % did, b, {})
    check(c, 'buyer switch-to-own', 'one of 403/404', code, str((e or {}).get('code')), ok=code in (403, 404))
    db("update delivery set no_partner_since = %s(6) - interval 46 minute where id=%s" % (CLOCK, did))
    off = until(lambda: db1('select own_delivery_offered_at from delivery where id=%s' % did) not in ('NULL', None), 100, 5)
    check(c, 'own_delivery_offered_at set within ~70s of fast-forward', 'set', db1('select own_delivery_offered_at from delivery where id=%s' % did), ok=bool(off))
    code, d, e = api('GET', '/deliveries/%s' % did, s, idem=False)
    check(c, 'canSwitchToOwn=true', True, (d or {}).get('canSwitchToOwn'), 'GET /deliveries/%s' % did)
    shot_pair(c, '02-offer', oid, sexp=['I will deliver it myself'], bexp=['Still arranging delivery'])
    before = db1('select total_amount from supplier_order where id=%d' % oid)
    code, d, e = api('POST', '/deliveries/%s/switch-to-own' % did, s, {})
    check(c, 'supplier switch-to-own', 200, code, str(e)[:120] if e else '')
    r = db("select id,mode,status from delivery where supplier_order_id=%d" % oid)
    check(c, 'same delivery id, SUPPLIER_OWN/DRIVER_ASSIGNED', [[str(did), 'SUPPLIER_OWN', 'DRIVER_ASSIGNED']], r)
    check(c, 'order mode SUPPLIER_DELIVERY, total unchanged', 'SUPPLIER_DELIVERY/%s' % before, '%s/%s' % (get_order_row(oid)[2], get_order_row(oid)[4]))
    code, d, e = api('POST', '/deliveries/%s/dispatched' % did, s, {}); check(c, 'dispatched', 200, code, str(e)[:100] if e else '')
    shot_pair(c, '03-own-onway', oid, bexp=['On the way'], bforbid=['Track'])
    code, d, e = api('POST', '/deliveries/%s/delivered' % did, s, {}); check(c, 'delivered', 200, code, str(e)[:100] if e else '')
    code, d, e = receive(oid); check(c, 'receive', 200, code, str(e)[:100] if e else '')

def case7():
    c = '7'
    oid, did = no_partner_delivery(c)
    check(c, 'QUOTE_FAILED', 'QUOTE_FAILED', dstatus(did), 'order %d delivery %s' % (oid, did))
    o = db("select latitude,longitude from outlet where id=%d" % OUTLET)[0]
    db("update delivery set drop_latitude=%s, drop_longitude=%s where id=%s" % (o[0], o[1], did))
    code, d, e = api('POST', '/deliveries/%s/reassign' % did, tok('seller'), {'reason': 'e2e manual retry'})
    check(c, 'manual retry', 200, code, str(e)[:150] if e else '')
    r = db("select id,status from delivery where supplier_order_id=%d" % oid)
    check(c, 'same delivery id, PROVIDER_SELECTED', [[str(did), 'PROVIDER_SELECTED']], r)
    shot_pair(c, '01-found', oid, bexp=['Finding a delivery partner'], sexp=['Finding a delivery partner'])
    # finish it so nothing is left dangling
    pid = db1('select provider_delivery_id from delivery where id=%s' % did)
    for dummy, want in (('fulfilled|out for pickup', 'DRIVER_ASSIGNED'), ('fulfilled|picked up', 'PICKED_UP'), ('fulfilled|ofd', 'IN_TRANSIT'), ('fulfilled|delivered', 'DELIVERED')):
        stage(c, dummy, did, pid, dummy, want)
    code, d, e = receive(oid); check(c, 'receive', 200, code)

# ---------------------------------------------------------------- case 8
def case8():
    c = '8'
    iid, oid, d = fund_costonomy_delivery(c)
    row = to_ready(c, oid); did, pid = row[0], row[2]
    stage(c, 'out for pickup', did, pid, 'fulfilled|out for pickup', 'DRIVER_ASSIGNED')
    code, obj = craft_cancel(pid)
    check(c, 'crafted CANCELLED webhook', 200, code)
    check(c, 'DRIVER_CANCELLED', 'DRIVER_CANCELLED', until(lambda: dstatus(did) == 'DRIVER_CANCELLED' and 'DRIVER_CANCELLED', 10, 1) or dstatus(did))
    shot_pair(c, '01-cancelled', oid, bexp=['Finding a new delivery partner', 'Partner changed'], bforbid=['Track'], sexp=['Try again'])
    code, d, e = api('POST', '/deliveries/%s/reassign' % did, tok('seller'), {'reason': 'e2e partner cancelled'})
    check(c, 'reassign accepted', 200, code, str(e)[:150] if e else '')
    st = dstatus(did)
    new_pid = db1('select provider_delivery_id from delivery where id=%s' % did)
    check(c, 'reassign gives a new provider_delivery_id immediately', 'new id', '%s vs %s, status %s' % (pid, new_pid, st),
          'Pidge is the only real provider and is excluded as already tried (DECISION NEEDED D-1)', ok=new_pid not in (pid, 'NULL') and st in ('PROVIDER_SELECTED', 'DRIVER_ASSIGNED'))
    if st == 'QUOTE_FAILED':
        # the no-partner flow retries on its own with nothing excluded; give it its chance
        got = until(lambda: dstatus(did) in ('PROVIDER_SELECTED', 'DRIVER_ASSIGNED') and 1, 240, 10)
        new_pid = db1('select provider_delivery_id from delivery where id=%s' % did)
        check(c, 'automatic retry then books a new partner', 'new id, PROVIDER_SELECTED', '%s vs %s, status %s' % (pid, new_pid, dstatus(did)), ok=bool(got) and new_pid != pid)
    if dstatus(did) not in ('PROVIDER_SELECTED', 'DRIVER_ASSIGNED'):
        return
    for dummy, want in (('fulfilled|out for pickup', 'DRIVER_ASSIGNED'), ('fulfilled|picked up', 'PICKED_UP'), ('fulfilled|ofd', 'IN_TRANSIT'), ('fulfilled|delivered', 'DELIVERED')):
        stage(c, dummy, did, new_pid, dummy, want)
    shot_pair(c, '02-delivered', oid, bexp=['Delivered', 'Check in delivery'])
    code, d, e = receive(oid); check(c, 'receive', 200, code)

# ---------------------------------------------------------------- case 9 / 10
def to_ofd(c):
    iid, oid, d = fund_costonomy_delivery(c)
    row = to_ready(c, oid); did, pid = row[0], row[2]
    stage(c, 'out for pickup', did, pid, 'fulfilled|out for pickup', 'DRIVER_ASSIGNED')
    stage(c, 'picked up', did, pid, 'fulfilled|picked up', 'PICKED_UP')
    stage(c, 'ofd', did, pid, 'fulfilled|ofd', 'IN_TRANSIT')
    return oid, did, pid
def case9():
    c = '9'
    oid, did, pid = to_ofd(c)
    stage(c, 'undelivered', did, pid, 'fulfilled|undelivered', 'DELIVERY_FAILED')
    fr = db1('select failure_reason from delivery where id=%s' % did)
    shot_pair(c, '01-failed', oid, bexp=["Delivery didn't go through"], bforbid=['Check in delivery', fr if fr and fr != 'NULL' and len(fr) > 4 else '\u0000'],
              sexp=['Delivery failed'] + ([fr] if fr and fr != 'NULL' else []), sforbid=[])
    rec(c, 'failure reason recorded', 'text', fr, 'PASS' if fr and fr != 'NULL' else 'FAIL', 'delivery %s' % did)
def case10():
    c = '10'
    # a) before pickup the parent order being cancelled cancels the delivery
    iid, oid, d = fund_costonomy_delivery(c)
    row = to_ready(c, oid); did, pid = row[0], row[2]
    stage(c, 'out for pickup', did, pid, 'fulfilled|out for pickup', 'DRIVER_ASSIGNED')
    stage(c, 'parent cancelled (before pickup)', did, pid, 'cancelled', 'CANCELLED')
    r = shot_pair(c, '01-cancelled-before-pickup', oid, extra=[('buyer', TRACK % oid, [], []), ('seller', STRACK % oid, [], [])])
    rec(c, 'texts, delivery CANCELLED before pickup (observation)', 'sensible', ' || '.join(x['aud'] + ': ' + x['text'][:230] for x in r), 'PASS', 'order %d status %s' % (oid, ostatus(oid)))
    # b) in transit the cancellation is not ours to apply (DeliveryStatus.allowedTransitions, doc 01 s13)
    oid, did, pid = to_ofd(c)
    code, obj = pidge_stage(pid, 'cancelled')
    time.sleep(1)
    check(c, 'parent cancelled in transit is ignored by design', 'IN_TRANSIT', dstatus(did), 'delivery %s; event disposition %s' % (did, db1("select disposition from delivery_event where delivery_id=%s and status='CANCELLED' order by id desc limit 1" % did)))

# ---------------------------------------------------------------- case 11
def case11():
    c = '11'
    iid = request('PICKUP', 'NONE')
    code, d, e = order(iid, 'PICKUP', 'PREPAID', expect=None)
    check(c, 'a) PICKUP/PREPAID order', 200, code, str(e)[:100] if e else '')
    oid = d['supplierOrderId']
    code, pi, e = api('GET', '/supplier-orders/%d/payment-intent' % oid, tok('buyer'), idem=False)
    check(c, 'a) payment-intent switchable', True, (pi or {}).get('switchable'), json.dumps(pi)[:200] if pi else str(e))
    shoot(c, '01-pay', [('buyer', '/restaurant/pay/%d' % oid, [], [])])
    u0, _ = credit_utilized()
    key = str(uuid.uuid4())
    code, d, e = api('POST', '/supplier-orders/%d/payment-method' % oid, tok('buyer'), {'method': 'CREDIT'}, headers={'Idempotency-Key': key})
    check(c, 'a) switch to CREDIT', 200, code, str(e)[:150] if e else '')
    check(c, 'a) order CONFIRMED', 'CONFIRMED', ostatus(oid))
    cr = db1('select cancel_requested_at from payment where supplier_order_id=%d' % oid)
    check(c, 'a) payment.cancel_requested_at set', 'not null', cr, ok=cr not in (None, 'NULL'))
    u1, _ = credit_utilized()
    check(c, 'a) credit drawn', 'utilized rises', '%s -> %s' % (u0, u1), ok=u1 > u0)
    code2, d2, e2 = api('POST', '/supplier-orders/%d/payment-method' % oid, tok('buyer'), {'method': 'CREDIT'}, headers={'Idempotency-Key': key})
    check(c, 'a) same key replay', 200, code2)
    check(c, 'a) replay did not draw again', u1, credit_utilized()[0])
    code3, d3, e3 = api('POST', '/supplier-orders/%d/payment-method' % oid, tok('buyer'), {'method': 'CREDIT'})
    check(c, 'a) second switch refused', 'one of 409/422', code3, str((e3 or {}).get('code')), ok=code3 in (409, 422))
    shot_pair(c, '02-confirmed', oid, bexp=['Order placed'])
    api('POST', '/supplier-orders/%d/supplier-cancel' % oid, tok('seller'), {'reason': 'e2e cleanup'})
    rec(c, 'b) switch to WALLET', 'balance drops once', 'wallet balance 0', 'BLOCKED', 'wallet cannot be funded without Razorpay (top-up is MOCK-only)')
    rec(c, 'c) AUTHORIZED card order -> 409 PAYMENT_STATE_CONFLICT', '409', 'not run', 'BLOCKED', 'needs a Razorpay card payment')
    # d) unpaid cancel
    iid = request('PICKUP', 'NONE')
    code, d, e = order(iid, 'PICKUP', 'PREPAID', expect=None)
    oid = d['supplierOrderId']
    code, d, e = api('POST', '/supplier-orders/%d/cancel' % oid, tok('buyer'), {'reason': 'e2e changed my mind'})
    check(c, 'd) cancel unpaid order', 200, code, str(e)[:100] if e else '')
    check(c, 'd) order CANCELLED', 'CANCELLED', ostatus(oid))
    shot_pair(c, '03-cancelled', oid, bexp=['Order cancelled', 'e2e changed my mind'], sexp=['Order cancelled'])

# ---------------------------------------------------------------- case 12
def case12():
    c = '12'
    u0, a0 = credit_utilized()
    iid, oid, d = fund_costonomy_delivery(c)
    u1, a1 = credit_utilized()
    check(c, 'credit exposure taken', 'rises', '%s -> %s' % (u0, u1), ok=u1 > u0)
    code, d, e = api('POST', '/supplier-orders/%d/cancel' % oid, tok('buyer'), {'reason': 'e2e restaurant cancels'})
    check(c, 'restaurant /cancel on CONFIRMED CREDIT order', 200, code, str(e)[:150] if e else '')
    check(c, 'order CANCELLED', 'CANCELLED', ostatus(oid))
    u2, _ = credit_utilized()
    check(c, 'credit exposure reversed', u0, u2, '%s -> %s -> %s. KNOWN OPEN GAP D-091 (no credit note exists): DECISION NEEDED D-2' % (u0, u1, u2))
    shot_pair(c, '01-restaurant-cancel', oid, bexp=['Order cancelled', 'e2e restaurant cancels'], sexp=['Order cancelled'])
    # supplier cancel (CREDIT stand-in for WALLET)
    iid, oid2, d = fund_costonomy_delivery(c)
    code, d, e = api('POST', '/supplier-orders/%d/supplier-cancel' % oid2, tok('seller'), {'reason': 'e2e out of stock'})
    check(c, 'supplier /supplier-cancel on CREDIT order', 200, code, str(e)[:150] if e else '')
    check(c, 'credit exposure reversed after supplier cancel', u0, credit_utilized()[0], 'KNOWN OPEN GAP D-091: DECISION NEEDED D-2')
    shot_pair(c, '02-supplier-cancel', oid2, bexp=['Order cancelled', 'e2e out of stock'], sexp=['Order cancelled'])
    rec(c, 'supplier cancel on WALLET order (wallet re-credited, refund row)', 'refund', 'wallet balance 0', 'BLOCKED', 'wallet cannot be funded without Razorpay')
    # refused after OUT_FOR_DELIVERY
    iid, oid3, d = own_order(c, 0, 'CREDIT', 'SELF_FREE')
    prep_ready(oid3); row = D(oid3)
    api('POST', '/deliveries/%s/dispatched' % row[0], tok('seller'), {})
    code, d, e = api('POST', '/supplier-orders/%d/supplier-cancel' % oid3, tok('seller'), {'reason': 'too late'})
    check(c, 'supplier-cancel after OUT_FOR_DELIVERY refused', 'one of 409/422', code, '%s status=%s' % ((e or {}).get('code'), ostatus(oid3)), ok=code in (409, 422))
    api('POST', '/deliveries/%s/delivered' % row[0], tok('seller'), {}); receive(oid3)

# ---------------------------------------------------------------- main
def load_results():
    try: return json.load(open(REPORT))
    except Exception: return []
if __name__ == '__main__':
    import driver
    which = sys.argv[1:] or [str(i) for i in range(1, 13)]
    driver.RESULTS[:] = [r for r in load_results() if r['case'] not in which]
    prov = delivery_provider()
    if prov != 'PIDGE':
        # These cases drive Pidge (signed webhooks, sandbox stages); with the mock partners they cannot run.
        for n in which:
            rec(n, 'provider check', 'delivery provider PIDGE', prov, 'BLOCKED', 'cases 1-12 need PIDGE (sandbox); use the mock panel for MOCK stacks')
        sys.exit(0)
    wait_health()
    r = widen_hours(); print('store hours widened:', r)
    try:
        for n in which:
            wait_health()
            print('=== case', n); sys.stdout.flush()
            try:
                globals()['case' + n]()
            except Exception as ex:
                rec(n, 'EXCEPTION', 'no exception', repr(ex)[:300], 'FAIL', traceback.format_exc().splitlines()[-3][:150])
    finally:
        restore_outlet()
        if os.environ.get('KEEP_HOURS') != '1': print('hours restored:', restore_hours())
