/* global Buffer */
// Shared flows for the supplier-side scenarios (S10..S15 in suite.js) and the demo seed (seed-supplier-demo.js).
// LOCAL stack only (lib.js refuses anything else). Nothing here prints or stores credentials.
//
//   const F = require('./flows')(T, SUP);   // T: { rest, rest2, sup1.. } tokens, SUP: storeId -> supplier token
//
// The two objects are read when a call is made, so the caller may fill them after requiring this module.
const L = require('./lib');
const { api, db, dbVal, dbNum, money, sum, RUN } = L;

module.exports = function flows(T, SUP) {
  const OUTLET = 1;   // Spice Garden / Indiranagar (+919876500004)
  const OUTLET2 = 2;  // Tandoor House / Koramangala (+919876500007)
  const n = (x) => Number(x);
  const code = (r) => r.error?.code;

  // ── dates (India calendar days, as the server counts them) ───────────────
  const istDate = (offsetDays = 0) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offsetDays * 864e5));
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
  /** JS port of CreditDueState, an independent check of what the server says. */
  function dueState(status, due, overdueAfter, today) {
    if (status === 'PAID') return 'PAID';
    if (status === 'WRITTEN_OFF') return 'WRITTEN_OFF';
    if (status === 'OVERDUE') return 'OVERDUE';
    const d = dayDiff(today, due);
    if (d > 0) return dayDiff(today, overdueAfter) > 0 ? 'OVERDUE' : 'IN_GRACE';
    const ahead = -d;
    if (ahead === 0) return 'DUE_TODAY';
    return ahead <= 3 ? 'DUE_SOON' : 'DUE_LATER';
  }

  // ── calls ─────────────────────────────────────────────────────────────────
  const G = (p, t) => api(p, { token: t });
  const P = (p, t, body, k) => api(p, { token: t, body: body === undefined ? {} : body, headers: k ? { 'Idempotency-Key': k } : {} });
  /** A file (CSV): status, headers and text, not JSON. */
  async function raw(pathname, token) {
    const res = await fetch(L.API + pathname, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    if (!res.ok) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* not JSON */ } }
    return { status: res.status, headers: res.headers, buf, text: buf.toString('utf8'), error: json?.error };
  }
  /** RFC 4180 reader: rows of cells; quotes, doubled quotes and CRLF handled. */
  function parseCsv(text) {
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* ignored: the \n ends the row */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  const buyerOf = (outlet) => (outlet === OUTLET2 ? T.rest2 : T.rest);
  const agreementsOf = async (outlet, token) => {
    const r = await G(`/outlets/${outlet}/credit/agreements`, token || buyerOf(outlet));
    return r.status === 200 ? r.data : [];
  };
  const findAgreement = async (storeId, outlet = OUTLET) => (await agreementsOf(outlet)).find((a) => a.supplierStoreId === storeId);
  const agr = async (id, token) => (await G(`/credit/agreements/${id}`, token || T.rest)).data;
  const agrAny = async (id) => (await G(`/credit/agreements/${id}`, T.rest)).data || (await G(`/credit/agreements/${id}`, T.rest2)).data;
  const invoicesOf = async (aid, token) => (await G(`/credit/agreements/${aid}/invoices`, token || T.rest)).data || [];
  const invoiceDetail = async (id, token) => (await G(`/credit/invoices/${id}`, token || T.rest)).data;
  const snapOf = (a) => ({ status: a.status, limit: n(a.approvedLimit), reserved: n(a.reserved), utilized: n(a.utilized),
    available: n(a.available), due: n(a.due), overdue: n(a.overdue), openClaims: n(a.openClaimsAmount) });
  const snap = async (aid, token) => snapOf(await agr(aid, token));

  // ── the order flow (draft, send, supplier answers, order on credit) ─────────────
  const skuOf = (storeId) => dbNum(`select id from supplier_sku where supplier_store_id=${storeId} and name='Paneer' and status='ACTIVE' order by id limit 1`);
  async function answeredIntent({ storeId, outlet = OUTLET, qty = 1 }) {
    const buyer = buyerOf(outlet);
    const skuId = skuOf(storeId);
    const d = await P(`/outlets/${outlet}/intent-items`, buyer, { supplierSkuId: skuId, quantity: 1 });
    if (d.status !== 200) throw new Error(`intent-items ${d.status} ${code(d)}`);
    const intent = d.data;
    for (const it of intent.items) if (it.supplierSkuId !== skuId) await api(`/intent-items/${it.id}`, { method: 'DELETE', token: buyer });
    const mine = intent.items.find((i) => i.supplierSkuId === skuId);
    const up = await api(`/intent-items/${mine.id}`, { method: 'PATCH', token: buyer, body: { quantity: qty } });
    if (up.status !== 200) throw new Error(`patch qty ${up.status}`);
    const s = await P(`/intents/${intent.id}/send`, buyer, {});
    if (s.status !== 200) throw new Error(`send ${s.status} ${code(s)}`);
    const full = (await G(`/intents/${intent.id}`, buyer)).data;
    const r = await P(`/intents/${intent.id}/respond`, SUP[storeId],
      { lines: full.items.map((i) => ({ intentItemId: i.id, offeredQuantity: i.requestedQuantity })) }, L.key('respond'));
    if (r.status !== 200) throw new Error(`respond ${r.status} ${code(r)}`);
    return { intentId: intent.id };
  }
  const createCreditOrder = (intentId, buyer, k = L.key('order')) =>
    P(`/intents/${intentId}/orders`, buyer, { deliveryMode: 'PICKUP', paymentMethod: 'CREDIT' }, k);

  // ── credit lines ──────────────────────────────────────────────────────────────
  /** Get (outlet, store)'s line to ACTIVE through the real API, whatever state it is in. Returns the agreement id. */
  async function ensureLine(storeId, outlet, { limit = 20000, days = 30, log = () => {} } = {}) {
    const buyer = buyerOf(outlet);
    let a = await findAgreement(storeId, outlet);
    if (!a || ['REJECTED', 'EXPIRED', 'CLOSED'].includes(a.status)) {
      const r = await P('/credit/requests', buyer, { supplierStoreId: storeId, outletId: outlet, requestedLimit: limit, requestedDays: days, purpose: 'E2E', note: `e2e ${RUN}` });
      if (r.status !== 200) throw new Error(`ensureLine: request store ${storeId} outlet ${outlet} -> ${r.status} ${code(r)}`);
      log(`line store ${storeId}/outlet ${outlet} requested again`);
      a = r.data;
    }
    if (a.status === 'REQUESTED') {
      const r = await P(`/credit/agreements/${a.id}/approve`, SUP[storeId], {});
      if (r.status !== 200) throw new Error(`ensureLine: approve -> ${r.status} ${code(r)}`);
      log(`line ${a.id} approved as asked`);
      a = r.data;
    }
    if (a.status === 'APPROVED') {
      const r = await P(`/credit/agreements/${a.id}/accept`, buyer, {});
      if (r.status !== 200) throw new Error(`ensureLine: accept -> ${r.status} ${code(r)}`);
      a = r.data;
    }
    if (a.status === 'SUSPENDED') {
      const r = await P(`/credit/agreements/${a.id}/reinstate`, SUP[storeId], {});
      if (r.status !== 200) throw new Error(`ensureLine: reinstate -> ${r.status} ${code(r)}`);
      log(`line ${a.id} reinstated`);
      a = r.data;
    }
    if (a.status !== 'ACTIVE') throw new Error(`ensureLine: line ${a.id} is ${a.status}`);
    return a.id;
  }

  /** Headroom for `need` rupees (and a per-order cap that fits): raised through the supplier's own modify when short. */
  async function fund(storeId, aid, need, log = () => {}) {
    const full = await agr(aid, T.rest) || await agr(aid, T.rest2);
    const a = snapOf(full);
    if (a.status !== 'ACTIVE') return a;
    const short = need - a.available;
    const cap = n(full.maxSingleOrderCredit);
    if (short <= 0 && cap >= need) return a;
    const maxOver = dbNum(`select coalesce(max_overdue_amount, 0) from credit_agreement where id=${aid}`);
    const r = await P(`/credit/agreements/${aid}/modify`, SUP[storeId], {
      approvedLimit: money(a.limit + Math.max(0, short) + 1), creditPeriodDays: full.creditPeriodDays, gracePeriodDays: full.gracePeriodDays,
      maxSingleOrderCredit: Math.max(cap, need + 1), maxOverdueAmount: maxOver, reason: `e2e ${RUN}: headroom for the run` });
    log(`line ${aid}: limit ${a.limit} -> ${money(a.limit + Math.max(0, short) + 1)} through supplier modify: HTTP ${r.status}`);
    return snapOf((await agr(aid, T.rest)) || (await agr(aid, T.rest2)));
  }

  /** A fresh invoice: a real order on credit (qty units of Paneer) and the invoice it made. */
  async function newInvoice({ storeId, outlet, qty = 1, aid, log }) {
    const buyer = buyerOf(outlet);
    aid = aid || await ensureLine(storeId, outlet, { log });
    await fund(storeId, aid, 1200 * qty, log);
    const it = await answeredIntent({ storeId, outlet, qty });
    const r = await createCreditOrder(it.intentId, buyer);
    if (r.status !== 200) throw new Error(`credit order store ${storeId} outlet ${outlet} -> ${r.status} ${code(r)} ${r.error?.message || ''}`);
    const inv = (await invoicesOf(aid, buyer)).find((i) => i.supplierOrderId === r.data.supplierOrderId);
    if (!inv) throw new Error('no invoice for order ' + r.data.supplierOrderId);
    return { aid, storeId, outlet, buyer, orderId: r.data.supplierOrderId, orderNumber: r.data.orderNumber,
      invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: n(inv.amount) };
  }

  /** Move an invoice's dates (DEMO/TEST DATA ONLY): the server has no way to backdate. Only an open invoice. */
  function setDue(invoiceId, dueOffset, overdueAfterOffset) {
    db(`update credit_invoice set due_date='${istDate(dueOffset)}', overdue_after='${istDate(overdueAfterOffset)}' where id=${invoiceId} and status in ('ISSUED','PARTIALLY_PAID')`);
    const row = db(`select due_date, overdue_after from credit_invoice where id=${invoiceId}`)[0];
    if (!row || row[0] !== istDate(dueOffset)) throw new Error(`setDue: invoice ${invoiceId} not updated (not open?)`);
  }

  // ── receipts ──────────────────────────────────────────────────────────────────────
  let refN = 0;
  const ref = (label) => `E2E-${label}-${RUN}-${++refN}`;
  const receipt = (aid, token, body, k) => P(`/credit/agreements/${aid}/payments`, token, body, k || L.key('rcpt'));
  const receiptPreview = (aid, token, body) => P(`/credit/agreements/${aid}/payments/preview`, token, body);
  /** Settle fixtures the run made, with one receipt over exactly those invoices that are still open. Returns the response or null. */
  async function settle(aid, storeId, invoiceIds, label = 'CLEAN') {
    const open = [];
    for (const id of invoiceIds) {
      const d = await invoiceDetail(id, SUP[storeId]);
      if (d && !['PAID', 'WRITTEN_OFF'].includes(d.status) && n(d.outstanding) > 0) open.push(d);
    }
    if (!open.length) return null;
    const r = await receipt(aid, SUP[storeId], {
      amount: money(sum(open.map((d) => d.outstanding))), method: 'BANK_TRANSFER', reference: ref(label), paidOn: istDate(0),
      invoiceIds: open.map((d) => d.id), allowDuplicateReference: true, note: `e2e ${RUN} settle fixtures` });
    return r;
  }

  // ── one view of a store in SQL (an independent check of the receivables, ageing and restaurant rows) ──────
  function sqlStore(storeId, today) {
    const open = db(`select i.id, i.credit_agreement_id, i.status, i.amount - i.paid_amount - i.credited_amount, i.due_date, i.overdue_after
                       from credit_invoice i where i.supplier_store_id=${storeId} and i.status not in ('PAID','WRITTEN_OFF') order by i.id`)
      .map((r) => ({ id: n(r[0]), aid: n(r[1]), status: r[2], out: n(r[3]), due: r[4], over: r[5] }));
    for (const r of open) { r.state = dueState(r.status, r.due, r.over, today); r.ahead = dayDiff(r.due, today); r.late = -r.ahead; }
    const lines = db(`select id, outlet_id, status, approved_limit, reserved_amount, utilized_amount from credit_agreement where supplier_store_id=${storeId} order by id`)
      .map((r) => ({ id: n(r[0]), outlet: n(r[1]), status: r[2], limit: n(r[3]), reserved: n(r[4]), utilized: n(r[5]) }));
    const waiting = {};
    for (const r of db(`select credit_agreement_id, count(*) from credit_payment_claim where supplier_store_id=${storeId} and status='SUBMITTED' group by 1`)) waiting[n(r[0])] = n(r[1]);
    const ms = today.slice(0, 7) + '-01';
    const nx = new Date(Date.UTC(n(today.slice(0, 4)), n(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const collected = n(dbVal(`select coalesce(sum(p.amount),0) from credit_payment p join credit_agreement a on a.id=p.credit_agreement_id
                                where a.supplier_store_id=${storeId} and p.paid_at >= date_sub('${ms} 00:00:00', interval 330 minute)
                                  and p.paid_at < date_sub('${nx} 00:00:00', interval 330 minute)
                                  and not exists (select 1 from credit_payment_reversal r where r.credit_payment_id=p.id)`));
    return { open, lines, waiting, collected };
  }

  return { OUTLET, OUTLET2, n, code, istDate, dayDiff, dueState, G, P, raw, parseCsv, buyerOf, agreementsOf, findAgreement, agr, agrAny,
    invoicesOf, invoiceDetail, snapOf, snap, skuOf, answeredIntent, createCreditOrder, ensureLine, fund, newInvoice, setDue, ref,
    receipt, receiptPreview, settle, sqlStore };
};
