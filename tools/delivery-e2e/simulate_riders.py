#!/usr/bin/env python3
"""Local rider simulator for the Pidge SANDBOX. Pidge's sandbox never assigns a rider by itself, so this plays the
rider: every Pidge delivery booked after it starts is moved through the stages on its own, by asking Pidge's sandbox
for each stage and posting that answer to our webhook, signed, exactly as Pidge would. LOCAL only.

usage: python3 simulate_riders.py [seconds-per-stage]   (default 25; Ctrl-C to stop)
"""
import sys, time, datetime
from driver import *
from cases import LOC_NEAR_SUPPLIER, LOC_MID

PACE = int(sys.argv[1]) if len(sys.argv) > 1 else 25
OUTLET = (12.9784, 77.6408)
NEXT = {  # current delivery status -> (stage to report, where the rider is, label)
    'PROVIDER_SELECTED': ('fulfilled|out for pickup', LOC_NEAR_SUPPLIER, 'partner assigned'),
    'DRIVER_ASSIGNED': ('fulfilled|reached pickup', LOC_NEAR_SUPPLIER, 'at the supplier'),
    'DRIVER_AT_PICKUP': ('fulfilled|picked up', LOC_NEAR_SUPPLIER, 'picked up'),
    'PICKED_UP': ('fulfilled|ofd', LOC_MID, 'on the way'),
    'IN_TRANSIT': ('fulfilled|reached delivery', OUTLET, 'arrived'),
    'ARRIVED_AT_DESTINATION': ('fulfilled|delivered', OUTLET, 'delivered'),
}
started = sys.argv[2] if len(sys.argv) > 2 else db1("select date_format(utc_timestamp(6), '%Y-%m-%d %H:%i:%s.%f')")
seen = {}
print('rider simulator on: deliveries booked from now on move one stage every %ds. Ctrl-C to stop.' % PACE, flush=True)
while True:
    try:
        rows = db("""select d.id, d.supplier_order_id, d.status, d.provider_delivery_id from delivery d
                     where d.provider_code='PIDGE' and d.mode='COSTONOMY' and d.provider_delivery_id is not null
                       and d.requested_at >= '%s' and d.status in (%s)""" % (started, ','.join("'%s'" % s for s in NEXT)))
        now = time.time()
        for did, oid, status, pid in rows:
            # Its own clock per delivery: the record's updated_at is refreshed by the app's status poll, and the
            # sandbox's event times are made up, so neither says how long the order has sat at this stage.
            if seen.get(did, (None,))[0] != status:
                seen[did] = (status, now)
            if now - seen[did][1] < PACE:
                continue
            dummy, loc, label = NEXT[status]
            code, _ = pidge_stage(pid, dummy, *loc)
            if status == 'PICKED_UP':
                # Pidge's sandbox states no arrival time; give the on-the-way stage one so the countdown shows.
                db("update delivery set estimated_arrival_at = utc_timestamp(6) + interval %d second where id=%s" % (PACE * 2, did))
            seen.pop(did, None)
            print('%s order %s: %s (webhook %s)' % (datetime.datetime.now().strftime('%H:%M:%S'), oid, label, code), flush=True)
    except Exception as ex:  # keep running through an API restart
        print('retrying after error: %s' % str(ex)[:160], flush=True)
    time.sleep(5)
