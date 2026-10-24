import { accountsFor, billedQuantityOf, rebalanceReceived, refundOutcome, thousandths, unaccountedHint, weighedCaption } from '@/lib/orders/receiving';
import type { SupplierOrderItem } from '@/models/procurement';
import type { Receiving } from '@/models/trust';
import {
  ORDER_READY_SETTLED_9_6, RECEIVING_APPLIED_NO_NOTE_YET, RECEIVING_IN_FULL, RECEIVING_PENDING_CAPTURE,
  RECEIVING_WITH_CREDIT_NOTE,
} from './fixtures/catchWeightContract';

const asReceiving = (raw: object) => raw as unknown as Receiving;
const weighedItem = (ORDER_READY_SETTLED_9_6.items[0] as unknown) as SupplierOrderItem;

describe('what the three counts must add up to', () => {
  it('is the billed 9.6 on a weighed catch-weight line, not the ordered 10', () => {
    expect(billedQuantityOf(weighedItem)).toBe(9.6);
    expect(accountsFor(9.5, 0, 0.1, 9.6)).toBe(true);
    expect(accountsFor(10, 0, 0, 9.6)).toBe(false);
  });

  it('is the accepted quantity on an ordinary line', () => {
    const plain = { ...weighedItem, isCatchWeight: false, billableQuantity: null } as SupplierOrderItem;
    expect(billedQuantityOf(plain)).toBe(10);
  });

  it('compares in thousandths, so decimal noise cannot refuse a correct entry', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(accountsFor(0.1, 0.2, 0, 0.3)).toBe(true);
    expect(thousandths(9.6)).toBe(9600);
  });

  it('says the line was weighed, and why it differs from the ordered quantity', () => {
    expect(weighedCaption(weighedItem)).toBe('Weighed and billed 9.6 KG');
    expect(weighedCaption({ ...weighedItem, billableQuantity: null } as SupplierOrderItem)).toBeNull();
  });
});

describe('what the restaurant is told after a rejection (only what the server sent)', () => {
  it('shows the server\'s refund and no credit-note row while the note has not been issued', () => {
    const outcome = refundOutcome(asReceiving(RECEIVING_APPLIED_NO_NOTE_YET), 'PREPAID');
    expect(outcome?.amount).toBe('₹10.50');
    expect(outcome?.creditNoteNumber).toBeNull();
    expect(outcome?.lines).toEqual([{ name: 'Chicken', amount: '₹10.50' }]);
  });

  it('never invents a credit note number', () => {
    const all = [RECEIVING_APPLIED_NO_NOTE_YET, RECEIVING_PENDING_CAPTURE].map((r) => refundOutcome(asReceiving(r), 'PREPAID'));
    for (const outcome of all) {
      expect(JSON.stringify(outcome)).not.toMatch(/CN-/);
      expect(outcome?.creditNoteNumber).toBeNull();
    }
  });

  it('shows the note\'s number once the server has one', () => {
    expect(refundOutcome(asReceiving(RECEIVING_WITH_CREDIT_NOTE), 'WALLET')?.creditNoteNumber).toBe('CN/2627/000001');
  });

  it('says where the money went by how the order was paid', () => {
    const applied = asReceiving(RECEIVING_APPLIED_NO_NOTE_YET);
    expect(refundOutcome(applied, 'PREPAID')?.where).toBe('Back in your wallet as a refund you can withdraw.');
    expect(refundOutcome(applied, 'WALLET')?.where).toBe('Back in your wallet.');
    expect(refundOutcome(applied, 'CREDIT')?.where).toBe('Taken off what you owe this supplier.');
  });

  it('claims nothing about where it went for a payment method it does not know', () => {
    expect(refundOutcome(asReceiving(RECEIVING_APPLIED_NO_NOTE_YET), 'SOMETHING_NEW')?.where).toBeNull();
    expect(refundOutcome(asReceiving({ ...RECEIVING_APPLIED_NO_NOTE_YET, refundStatus: null }), 'PREPAID')?.where).toBeNull();
  });

  it('tells a card payment still being captured that the refund follows, and needs nothing from them', () => {
    const outcome = refundOutcome(asReceiving(RECEIVING_PENDING_CAPTURE), 'PREPAID');
    expect(outcome?.where).toBe('₹10.50 comes back once your card payment finishes. There is nothing for you to do.');
  });

  it('is nothing at all when nothing was refunded', () => {
    expect(refundOutcome(asReceiving(RECEIVING_IN_FULL), 'PREPAID')).toBeNull();
  });
});

describe('entering a problem lowers Received (check-in friction)', () => {
  const plain = { isCatchWeight: false } as SupplierOrderItem;
  it('one missing out of 3 leaves 2 received', () => {
    expect(rebalanceReceived(plain, 3, { received: 3, damaged: 0, missing: 1 })).toBe(2);
  });
  it('damaged and missing both come off Received, to the thousandth', () => {
    expect(rebalanceReceived(plain, 1, { received: 1, damaged: 0.1, missing: 0.2 })).toBe(0.7);
  });
  it('never goes below zero', () => {
    expect(rebalanceReceived(plain, 3, { received: 3, damaged: 2, missing: 2 })).toBe(0);
  });
  it('leaves a catch-weight line alone', () => {
    expect(rebalanceReceived({ isCatchWeight: true } as SupplierOrderItem, 9.6, { received: 9.6, damaged: 0, missing: 1 })).toBe(9.6);
  });
});

describe('what to do when the counts still do not add up', () => {
  it('says to lower Received, with the number worked out from the billed quantity', () => {
    expect(unaccountedHint({ received: 3, damaged: 0, missing: 1 }, 3, 'KG')).toBe('Lower Received to 2 KG');
  });
  it('says to raise Received when short', () => {
    expect(unaccountedHint({ received: 1, damaged: 0, missing: 1 }, 3, 'KG')).toBe('Raise Received to 2 KG');
  });
  it('says Damaged and Missing are too many when they alone exceed the quantity', () => {
    expect(unaccountedHint({ received: 0, damaged: 2, missing: 2 }, 3, 'KG')).toBe('Damaged and Missing add up to more than 3 KG');
  });
});

describe('where the refund went decides the sheet buttons', () => {
  const applied = asReceiving(RECEIVING_APPLIED_NO_NOTE_YET);
  it('goes to the wallet for PREPAID and WALLET orders, not for credit', () => {
    expect(refundOutcome(applied, 'PREPAID')?.toWallet).toBe(true);
    expect(refundOutcome(applied, 'WALLET')?.toWallet).toBe(true);
    expect(refundOutcome(applied, 'CREDIT')?.toWallet).toBe(false);
  });
});
