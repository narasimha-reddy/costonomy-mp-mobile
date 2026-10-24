/* global process */
// Demo seed for the supplier side of Credit. LOCAL stack and LOCAL data only (lib.js refuses anything else).
//
//   export PATH=$HOME/.local/opt/node/bin:$PATH
//   node tools/credit-e2e/seed-supplier-demo.js
//
// Run it AFTER the end-to-end suite. It tidies Sri Balaji Traders (store 1, +919876511001) and its credit line with
// Spice Garden / Indiranagar (agreement 1, +919876500004) into a state a product manager can click through:
//
//   2 invoices overdue (20 and 8 days late), 2 due this week, 1 due later, 1 of those partly paid,
//   1 fresh "Paid direct" claim waiting and 1 stale one (older than 7 days), 1 payment recorded then reversed,
//   1 credit note, 1 refund due (an order cancelled after part of it was paid), 1 wallet repayment waiting for its payout,
//   1 reminder sent, and a pending credit request from the other outlet (Tandoor House, +919876500007) to store 1.
//
// Everything that moves money goes through the real API as the supplier or the restaurant, with the same checks and audit
// rows as the apps. The only direct SQL is what the server cannot do: moving due dates back in time, marking the two late
// invoices OVERDUE the way the hourly sweep would, and ageing the stale claim. Nothing is deleted.
//
// Re-running is safe: it settles what an earlier run left open on agreement 1 with one receipt (reference SEEDCLEAN-...),
// withdraws waiting claims, and builds the same open state again. The refund due, the wallet payout and the reminder are
// created only when none of that kind is waiting any more, so they do not pile up. History (paid invoices, notes,
// reversals) does accumulate, as it would for a real store.
const L = require('./lib');
const { db, dbNum, RUN, PHONES } = L;

const T = {}; const SUP = {};
const F = require('./flows')(T, SUP);
const { istDate, G, P, code } = F;
const say = (m) => console.log(m);
const fail = (m) => { throw new Error(m); };
const need = (what, r, ok = [200, 201]) => { if (!ok.includes(r.status)) fail(`${what}: HTTP ${r.status} ${code(r)} ${r.error?.message || ''}`); return r; };
const seedKey = (label) => `seedsup-${RUN}-${label}`;

(async () => {
  console.log(`supplier demo seed  run=${RUN}  api=${L.API}`);
  for (const [k, ph] of Object.entries({ rest: PHONES.rest, rest2: PHONES.rest2, sup1: PHONES.sup1 })) T[k] = await L.login(ph);
  SUP[1] = T.sup1;
  const today = istDate(0);
  const note = (m) => say(`  . ${m}`);
  const sup = SUP[1];

  // ── 0. waiting claims from earlier runs and tests are taken back by their restaurant, so the claim count starts clean
  const waiting = (await G('/supplier-stores/1/credit/claims?status=SUBMITTED', sup)).data || [];
  for (const c of waiting) {
    const r = await P(`/credit/claims/${c.id}/withdraw`, c.outletId === 2 ? T.rest2 : T.rest, {});
    note(`claim ${c.id} (${c.restaurantName}, ${c.invoiceNumber}, ${c.amount}) withdrawn by its restaurant: HTTP ${r.status}`);
  }

  // ── 1. agreement 1: settle what is open, then build the demo invoices
  const aid = await F.ensureLine(1, 1, { log: note });
  const openIds = ((await F.invoicesOf(aid, sup)) || []).filter((i) => !['PAID', 'WRITTEN_OFF'].includes(i.status)).map((i) => i.id);
  if (openIds.length) {
    const s = await F.settle(aid, 1, openIds, 'SEEDCLEAN');
    note(`${openIds.length} invoice(s) left open on line ${aid} settled with one receipt: HTTP ${s?.status}`);
  }
  const mk = async (qty, due, over) => {
    const x = await F.newInvoice({ storeId: 1, outlet: 1, qty, aid, log: note });
    F.setDue(x.invoiceId, due, over);
    return x;
  };
  const I1 = await mk(2, -20, -15);   // overdue, 20 days late
  const I2 = await mk(1, -8, -3);     // overdue, 8 days late
  const I3 = await mk(1, 2, 7);       // due this week
  const I4 = await mk(2, 5, 10);      // due this week, partly paid below
  const I5 = await mk(2, 14, 19);     // due later
  note(`invoices ${[I1, I2, I3, I4, I5].map((x) => x.invoiceNumber).join(', ')} created and dated`);

  // Partly paid: the supplier records 250 received on I4.
  const part = need('partial receipt on I4', await F.receipt(aid, sup, { amount: 250, method: 'BANK_TRANSFER', reference: F.ref('SEEDUTR'), paidOn: today, invoiceIds: [I4.invoiceId], note: 'Part payment, balance next week' }, seedKey('part')));
  note(`I4 partly paid: receipt ${part.data.receiptId} of 250`);

  // A payment recorded and then undone (typed on the wrong invoice): the statement shows both.
  const typo = need('receipt on I2', await F.receipt(aid, sup, { amount: 200, method: 'UPI', reference: F.ref('SEEDTYPO'), paidOn: today, invoiceIds: [I2.invoiceId], note: 'Recorded against the wrong invoice' }, seedKey('typo')));
  need('reverse the receipt', await P(`/credit/receipts/${typo.data.receiptId}/reverse`, sup, { reason: 'Recorded against the wrong invoice' }, seedKey('typo-rev')));
  note(`receipt ${typo.data.receiptId} of 200 recorded on I2 and then undone`);

  // Claims: a fresh one, and one that has waited 9 days (the API cannot make an old claim, so its date is moved back).
  const fresh = need('fresh claim', await P(`/credit/invoices/${I3.invoiceId}/claims`, T.rest, { amount: 200, method: 'CASH', paidOn: today, note: 'Paid cash to the delivery boy' }, seedKey('claim-fresh')));
  const stale = need('claim for the stale one', await P(`/credit/invoices/${I1.invoiceId}/claims`, T.rest, { amount: 500, method: 'UPI', reference: F.ref('SEEDCLAIM'), paidOn: today, note: 'Sent by UPI last week' }, seedKey('claim-stale')));
  db(`update credit_payment_claim set created_at = date_sub(created_at, interval 9 day), paid_on='${istDate(-9)}' where id=${stale.data.id}`);
  note(`claim ${fresh.data.id} waiting (today) and claim ${stale.data.id} waiting 9 days (date moved back by SQL)`);

  // A credit note: price correction on I5.
  const cn = need('credit note', await P(`/credit/invoices/${I5.invoiceId}/credit-notes`, sup, { amount: 50, reasonCode: 'PRICE', note: 'Onion price corrected after delivery' }, seedKey('note')));
  note(`credit note ${cn.data.creditNoteNumber} of 50 on ${I5.invoiceNumber}`);

  // The two late invoices are marked OVERDUE the way the hourly sweep would, so the line's own figures show it at once.
  db(`update credit_invoice set status='OVERDUE', marked_overdue_at=utc_timestamp() where id in (${I1.invoiceId},${I2.invoiceId}) and status in ('ISSUED','PARTIALLY_PAID')`);

  // ── 2. a refund due: an order cancelled after part of it was paid directly (only when none is waiting)
  const refunds = (await G('/supplier-stores/1/credit/refunds-due?status=OPEN', sup)).data || [];
  if (refunds.some((r) => r.agreementId === aid)) note('a refund due is already waiting; not adding another');
  else {
    const Z = await F.newInvoice({ storeId: 1, outlet: 1, qty: 1, aid, log: note });
    need('direct payment on Z', await F.receipt(aid, sup, { amount: 150, method: 'BANK_TRANSFER', reference: F.ref('SEEDZ'), paidOn: today, invoiceIds: [Z.invoiceId], note: 'Paid the delivery partner' }, seedKey('z-pay')));
    need('cancel the order of Z', await P(`/supplier-orders/${Z.orderId}/cancel`, T.rest, { reason: 'Ordered twice by mistake' }, seedKey('z-cancel')));
    note(`order ${Z.orderNumber} cancelled after 150 was paid: a refund of 150 is due`);
  }

  // ── 3. a wallet repayment waiting for its payout (only when none is waiting)
  const payouts = (await G('/supplier-stores/1/credit/payouts?status=PENDING&size=100', sup)).data;
  if ((payouts?.items || []).some((p) => p.agreementId === aid)) note('a wallet payout is already pending; not adding another');
  else {
    const W = await F.newInvoice({ storeId: 1, outlet: 1, qty: 1, aid, log: note });
    const wr = await P(`/credit/agreements/${aid}/wallet-repayments`, T.rest, { amount: W.amount, invoiceIds: [W.invoiceId] }, seedKey('wallet'));
    if (wr.status === 201) note(`${W.invoiceNumber} repaid in full from the restaurant's wallet: payout of ${W.amount} (less commission) pending`);
    else { note(`wallet repayment refused (HTTP ${wr.status} ${code(wr)}); the invoice is left open and is settled by the next run`); }
  }

  // ── 4. a pending request from the other outlet (Tandoor House): its line is paid off, closed and asked for again
  const a6 = await F.findAgreement(1, 2);
  if (a6 && a6.status === 'REQUESTED') note(`Tandoor House already has a pending request (line ${a6.id})`);
  else {
    if (a6 && ['ACTIVE', 'SUSPENDED', 'APPROVED'].includes(a6.status)) {
      if (a6.status === 'APPROVED') need('withdraw the offer', await P(`/credit/agreements/${a6.id}/reject`, sup, { reason: 'Demo reset: offer withdrawn' }));
      else {
        const open6 = ((await F.invoicesOf(a6.id, sup)) || []).filter((i) => !['PAID', 'WRITTEN_OFF'].includes(i.status)).map((i) => i.id);
        if (open6.length) note(`${open6.length} open invoice(s) of Tandoor House settled: HTTP ${(await F.settle(a6.id, 1, open6, 'SEEDCLEAN'))?.status}`);
        const cl = await P(`/credit/agreements/${a6.id}/close`, sup, { reason: 'Demo reset: line closed so the restaurant can ask again' });
        if (cl.status !== 200) note(`could not close line ${a6.id} (HTTP ${cl.status} ${code(cl)}); no pending request created`);
      }
    }
    const cur = await F.findAgreement(1, 2);
    if (!cur || ['REJECTED', 'EXPIRED', 'CLOSED'].includes(cur.status)) {
      const rq = await P('/credit/requests', T.rest2, { supplierStoreId: 1, outletId: 2, requestedLimit: 15000, requestedDays: 30, purpose: 'Weekly dairy and groceries', note: 'We order twice a week at Koramangala' });
      if (rq.status === 200) note(`Tandoor House asks Sri Balaji for 15,000 for 30 days (line ${rq.data.id}, ${rq.data.status})`);
      else note(`the request was refused: HTTP ${rq.status} ${code(rq)}`);
    }
  }

  // ── 5. a reminder to Spice Garden (the 24-hour gate: one is kept if it was sent in the last day)
  const hist = (await G(`/credit/agreements/${aid}/reminders?size=20`, sup)).data;
  const recent = (hist?.items || []).filter((r) => r.kind === 'MANUAL' && Date.now() - Date.parse(r.requestedAt) < 24 * 3600 * 1000);
  if (recent.length) note(`a reminder was already sent ${recent[0].requestedAt}; kept`);
  else {
    const pv = (await G(`/credit/agreements/${aid}/reminders/preview`, sup)).data;
    if (pv && !pv.canRemind && ['TOO_SOON', 'WEEK_LIMIT'].includes(pv.reason)) {
      db(`update credit_reminder set requested_at = requested_at - interval 8 day where credit_agreement_id=${aid} and kind='MANUAL'`);
      note('earlier reminders on this line moved back 8 days (demo data) so one can be sent now');
    }
    const r = await P(`/credit/agreements/${aid}/reminders`, sup, { note: 'Please clear the overdue invoices this week. Thank you.' }, seedKey('reminder'));
    if (r.status === 201) note(`reminder ${r.data.id} ${r.data.status} to Spice Garden: ${(r.data.invoiceIds || []).length} invoice(s), channels ${(r.data.channels || []).join('+')}`);
    else note(`reminder not sent: HTTP ${r.status} ${code(r)}`);
  }

  // ── what the supplier now sees ──
  say('\n=== what the supplier sees (store 1, Sri Balaji Traders) ===');
  const R = (await G('/supplier-stores/1/credit/receivables', sup)).data;
  const A = (await G('/supplier-stores/1/credit/ageing', sup)).data;
  const RL = (await G('/supplier-stores/1/credit/receivables/restaurants?size=100', sup)).data;
  const inv = (await F.invoicesOf(aid, sup)).filter((i) => !['PAID', 'WRITTEN_OFF'].includes(i.status));
  say(`as of ${R.asOf}: total receivable ${R.totalReceivable}, overdue ${R.overdue}, in grace ${R.inGrace}, due today ${R.dueToday}, due this week ${R.dueThisWeek}, collected this month ${R.collectedThisMonth}`);
  say(`exposure: extended ${R.exposure.extended}, drawn ${R.exposure.drawn}, available to lend ${R.exposure.availableToLend}`);
  say(`counts: ${JSON.stringify(R.counts)}`);
  say(`pending actions: ${JSON.stringify(R.pendingActions)}`);
  say(`ageing: ${A.buckets.map((b) => `${b.bucket} ${b.amount} (${b.invoiceCount} inv, ${b.restaurantCount} rest)`).join(' | ')}`);
  say('restaurants:');
  for (const r of RL.items) say(`  - ${r.restaurantName} / ${r.outletName} (${r.status}): owed ${r.owed}, overdue ${r.overdue}, next due ${r.nextDueDate} ${r.nextDueAmount}, worst ${r.dueState}, claims waiting ${r.claimsWaiting}, ${r.utilization}% of ${r.limit}`);
  say(`open invoices of Spice Garden (${inv.length}):`);
  for (const i of inv) say(`  - ${i.invoiceNumber}: amount ${i.amount}, paid ${i.paidAmount}, credited ${i.creditedAmount}, outstanding ${i.outstanding}, due ${i.dueDate}, ${i.dueState}`);
  const cl = (await G('/supplier-stores/1/credit/claims?status=SUBMITTED', sup)).data || [];
  say(`claims waiting (${cl.length}): ${cl.map((c) => `${c.invoiceNumber} ${c.amount} ${c.method} ${c.ageDays}d${c.stale ? ' STALE' : ''}`).join('; ')}`);
  const rf = (await G('/supplier-stores/1/credit/refunds-due?status=OPEN', sup)).data || [];
  say(`refunds due OPEN (${rf.length}): ${rf.map((r) => `${r.invoiceNumber} ${r.amount} ${r.channel}`).join('; ')}`);
  const po = (await G('/supplier-stores/1/credit/payouts?size=100', sup)).data;
  say(`payouts: pending net ${po.summary.pendingNet}, applied this month ${po.summary.appliedNetThisMonth}; rows ${po.totalElements}, PENDING ${po.items.filter((p) => p.status === 'PENDING').length}`);
  const ag = (await G('/supplier-stores/1/credit/agreements', sup)).data || [];
  say(`credit requests waiting for the supplier: ${ag.filter((a) => a.status === 'REQUESTED').map((a) => `${a.restaurantName}/${a.outletName} asks ${a.latestRequest?.requestedLimit} for ${a.latestRequest?.requestedPeriodDays} days`).join('; ') || 'none'}`);
  const notes = (await G(`/credit/agreements/${aid}/credit-notes?size=5`, sup)).data;
  say(`credit notes on the line: ${notes.total} (latest ${notes.items[0]?.creditNoteNumber} ${notes.items[0]?.amount} ${notes.items[0]?.kind})`);
  const rem = (await G(`/credit/agreements/${aid}/reminders?size=3`, sup)).data;
  say(`reminders on the line: ${rem.total} (latest ${rem.items[0]?.status} ${rem.items[0]?.requestedAt})`);
  say(`payments undone on the line: ${dbNum(`select count(*) from credit_payment_reversal where credit_agreement_id=${aid}`)}`);
  const ra = (await G(`/outlets/1/credit/summary`, T.rest)).data;
  say(`the restaurant (Spice Garden) sees: owes ${ra.due}, overdue ${ra.overdue}, utilized ${ra.utilized}, open claims ${ra.openClaimsAmount}`);
})().catch((e) => { console.error('SEED FAILED:', e.message || e); process.exit(1); });
