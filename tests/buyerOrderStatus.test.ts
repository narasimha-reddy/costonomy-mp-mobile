import { buyerOrderStatus } from '@/models/status';

describe('buyerOrderStatus', () => {
  it('a ready partner-delivery order reads Arranging delivery', () => {
    expect(buyerOrderStatus('READY_FOR_PICKUP', 'COSTONOMY_DELIVERY').label).toBe('Arranging delivery');
  });

  it('a ready supplier-delivery order reads Packed, supplier delivering, not ready for pickup', () => {
    expect(buyerOrderStatus('READY_FOR_PICKUP', 'SUPPLIER_DELIVERY')).toEqual({
      label: 'Packed, supplier delivering', tone: 'info',
    });
  });

  it('a pickup order that is ready keeps the plain ready-for-pickup label', () => {
    expect(buyerOrderStatus('READY_FOR_PICKUP', 'PICKUP').label).toBe('Ready for pickup');
    expect(buyerOrderStatus('PREPARING', 'SUPPLIER_DELIVERY').label).toBe('Preparing');
  });
});
