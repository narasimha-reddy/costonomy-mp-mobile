#!/usr/bin/env python3
"""Leaves live orders between Spice Garden (restaurant) and Sri Balaji (supplier) at each tracking stage, to look at
in the app. LOCAL only. usage: python3 demo.py"""
from driver import *
from cases import fund_costonomy_delivery, to_ready, LOC_NEAR_SUPPLIER, LOC_MID

def show(name, oid):
    print('%-26s order %-5d restaurant: http://localhost:7071/restaurant/orders/%d   supplier: http://localhost:7071/supplier/orders/%d'
          % (name, oid, oid, oid))

widen_hours()
try:
    # 1. packing: confirmed and preparing, no delivery yet (illustration band)
    _, oid, _ = fund_costonomy_delivery('demo')
    api('POST', '/supplier-orders/%d/preparing' % oid, tok('seller'), {})
    show('Packing', oid)

    # 2. finding a partner: ready, booked with Pidge, no rider yet
    _, oid, _ = fund_costonomy_delivery('demo')
    to_ready('demo', oid)
    show('Finding a partner', oid)

    # 3. partner assigned: rider heading to the supplier (map + partner card)
    _, oid, _ = fund_costonomy_delivery('demo')
    did, _, pid, _ = to_ready('demo', oid)[:4]
    pidge_stage(pid, 'fulfilled|out for pickup', *LOC_NEAR_SUPPLIER)
    show('Partner assigned', oid)

    # 4. on the way: picked up, in transit, arriving in about 14 minutes
    _, oid, _ = fund_costonomy_delivery('demo')
    did, _, pid, _ = to_ready('demo', oid)[:4]
    for s in ('fulfilled|out for pickup', 'fulfilled|reached pickup', 'fulfilled|picked up', 'fulfilled|ofd'):
        pidge_stage(pid, s, *LOC_MID)
    # Pidge's sandbox states no arrival time; seed one so the ETA shows (stored times are UTC).
    db("update delivery set estimated_arrival_at = utc_timestamp(6) + interval 14 minute, eta_minutes = 14 where id=%s" % did)
    show('On the way', oid)
finally:
    restore_hours()
