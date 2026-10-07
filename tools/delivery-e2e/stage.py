#!/usr/bin/env python3
"""Move a Pidge-sandbox delivery to its next stage, as if a rider did it. LOCAL only.

Pidge's sandbox never assigns a rider by itself. This asks Pidge's sandbox for the order at the stage you name and
posts that answer to our webhook, signed, exactly as Pidge would.

usage: python3 stage.py <orderId> <stage>
stages, in order: assign, at-pickup, picked-up, on-the-way, arrived, delivered   (also: failed, cancel-rider)
"""
import sys
from driver import *
from cases import LOC_NEAR_SUPPLIER, LOC_MID

STAGES = {
    'assign': ('fulfilled|out for pickup', LOC_NEAR_SUPPLIER),
    'at-pickup': ('fulfilled|reached pickup', LOC_NEAR_SUPPLIER),
    'picked-up': ('fulfilled|picked up', LOC_NEAR_SUPPLIER),
    'on-the-way': ('fulfilled|ofd', LOC_MID),
    'arrived': ('fulfilled|reached delivery', (12.9784, 77.6408)),
    'delivered': ('fulfilled|delivered', (12.9784, 77.6408)),
    'failed': ('fulfilled|undelivered', LOC_MID),
}

if len(sys.argv) != 3 or (sys.argv[2] not in STAGES and sys.argv[2] != 'cancel-rider'):
    sys.exit(__doc__)
oid, name = int(sys.argv[1]), sys.argv[2]
row = db("select id, coalesce(provider_delivery_id,''), status from delivery where supplier_order_id=%d order by id desc limit 1" % oid)
if not row or not row[0][1]:
    sys.exit('Order %d has no Pidge booking yet. Mark it ready and request a delivery partner first.' % oid)
did, pid, before = row[0]
if name == 'cancel-rider':
    code, _ = craft_cancel(pid)
else:
    dummy, loc = STAGES[name]
    code, _ = pidge_stage(pid, dummy, *loc)
after = until(lambda: db1('select status from delivery where id=%s' % did) != before and db1('select status from delivery where id=%s' % did), 10, 1) \
    or db1('select status from delivery where id=%s' % did)
print('order %d: webhook %s, delivery %s -> %s' % (oid, code, before, after))
