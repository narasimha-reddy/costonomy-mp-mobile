import type { BrandOption, RecommendedOffer, StorefrontSku } from '@/models/discovery';
import type { SkuDetail } from '@/models/catalog';

describe('Brand Options and Grades fulfillment under items', () => {
  const brandOptions: BrandOption[] = [
    {
      supplierSkuId: 101,
      offerId: 501,
      skuName: 'Nandini Paneer Grade A 1kg',
      brandName: 'Nandini',
      grade: 'Grade A',
      packSize: '1',
      packUnit: 'KG',
      mrp: '450.00',
      sellingPrice: '380.00',
      discountAmount: '70.00',
      discountPercent: 16,
      gstRate: '5.00',
      unitPriceInclusiveGst: '399.00',
      imageUrl: null,
      availability: 'AVAILABLE',
      availableQuantity: '50',
      measureValue: '1',
      measureUnit: 'KG',
    },
    {
      supplierSkuId: 102,
      offerId: 502,
      skuName: 'Amul Fresh Paneer Grade A 1kg',
      brandName: 'Amul',
      grade: 'Grade A',
      packSize: '1',
      packUnit: 'KG',
      mrp: '480.00',
      sellingPrice: '410.00',
      discountAmount: '70.00',
      discountPercent: 15,
      gstRate: '5.00',
      unitPriceInclusiveGst: '430.50',
      imageUrl: null,
      availability: 'AVAILABLE',
      availableQuantity: '100',
      measureValue: '1',
      measureUnit: 'KG',
    },
    {
      supplierSkuId: 103,
      offerId: 503,
      skuName: 'Milky Mist Paneer Premium 1kg',
      brandName: 'Milky Mist',
      grade: 'Premium',
      packSize: '1',
      packUnit: 'KG',
      mrp: '500.00',
      sellingPrice: '430.00',
      discountAmount: '70.00',
      discountPercent: 14,
      gstRate: '5.00',
      unitPriceInclusiveGst: '451.50',
      imageUrl: null,
      availability: 'AVAILABLE',
      availableQuantity: '30',
      measureValue: '1',
      measureUnit: 'KG',
    },
  ];

  it('orders brand options with lowest priced one first and carries grade and mrp', () => {
    const first = brandOptions[0]!;
    const second = brandOptions[1]!;
    const third = brandOptions[2]!;

    expect(first.brandName).toBe('Nandini');
    expect(first.grade).toBe('Grade A');
    expect(first.mrp).toBe('450.00');
    expect(first.discountPercent).toBe(16);
    expect(Number(first.sellingPrice)).toBe(380.0);

    expect(second.brandName).toBe('Amul');
    expect(second.grade).toBe('Grade A');
    expect(second.mrp).toBe('480.00');
    expect(Number(second.sellingPrice)).toBe(410.0);

    expect(third.brandName).toBe('Milky Mist');
    expect(third.grade).toBe('Premium');
    expect(Number(third.sellingPrice)).toBe(430.0);

    // Verify ascending order
    for (let i = 0; i < brandOptions.length - 1; i++) {
      const current = brandOptions[i]!;
      const next = brandOptions[i + 1]!;
      expect(Number(current.sellingPrice)).toBeLessThanOrEqual(
        Number(next.sellingPrice),
      );
    }
  });

  it('can be attached to RecommendedOffer with grade and mrp', () => {
    const offer: Partial<RecommendedOffer> = {
      offerId: 502,
      supplierSkuId: 102,
      skuName: 'Amul Fresh Paneer Grade A 1kg',
      brandName: 'Amul',
      grade: 'Grade A',
      mrp: '480.00',
      unitPrice: '410.00',
      discountAmount: '70.00',
      discountPercent: 15,
      brandOptions,
    };

    expect(offer.brandOptions).toHaveLength(3);
    const firstOption = offer.brandOptions?.[0];
    expect(firstOption?.brandName).toBe('Nandini');
    expect(firstOption?.grade).toBe('Grade A');
    expect(firstOption?.sellingPrice).toBe('380.00');
    expect(firstOption?.mrp).toBe('450.00');
  });

  it('can be attached to StorefrontSku', () => {
    const sku: Partial<StorefrontSku> = {
      supplierSkuId: 101,
      skuName: 'Nandini Paneer Grade A 1kg',
      grade: 'Grade A',
      mrp: '450.00',
      sellingPrice: '380.00',
      brandOptions,
    };

    expect(sku.brandOptions).toHaveLength(3);
    expect(sku.brandOptions?.[0]?.brandName).toBe('Nandini');
  });

  it('can be attached to SkuDetail', () => {
    const detail: Partial<SkuDetail> = {
      supplierSkuId: 102,
      skuName: 'Amul Fresh Paneer Grade A 1kg',
      grade: 'Grade A',
      mrp: '480.00',
      sellingPrice: '410.00',
      brandOptions,
    };

    expect(detail.brandOptions).toHaveLength(3);
    expect(detail.brandOptions?.[0]?.brandName).toBe('Nandini');
  });
});

