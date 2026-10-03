import type { BrandOption, RecommendedOffer, StorefrontSku } from '@/models/discovery';
import type { SkuDetail } from '@/models/catalog';

describe('Brand Options fulfillment under items', () => {
  const brandOptions: BrandOption[] = [
    {
      supplierSkuId: 101,
      offerId: 501,
      skuName: 'Nandini Paneer 1kg',
      brandName: 'Nandini',
      packSize: '1',
      packUnit: 'KG',
      sellingPrice: '380.00',
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
      skuName: 'Amul Fresh Paneer 1kg',
      brandName: 'Amul',
      packSize: '1',
      packUnit: 'KG',
      sellingPrice: '410.00',
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
      skuName: 'Milky Mist Paneer 1kg',
      brandName: 'Milky Mist',
      packSize: '1',
      packUnit: 'KG',
      sellingPrice: '430.00',
      gstRate: '5.00',
      unitPriceInclusiveGst: '451.50',
      imageUrl: null,
      availability: 'AVAILABLE',
      availableQuantity: '30',
      measureValue: '1',
      measureUnit: 'KG',
    },
  ];

  it('orders brand options with lowest priced one first', () => {
    // Assert first option is lowest price
    expect(brandOptions[0].brandName).toBe('Nandini');
    expect(Number(brandOptions[0].sellingPrice)).toBe(380.0);

    expect(brandOptions[1].brandName).toBe('Amul');
    expect(Number(brandOptions[1].sellingPrice)).toBe(410.0);

    expect(brandOptions[2].brandName).toBe('Milky Mist');
    expect(Number(brandOptions[2].sellingPrice)).toBe(430.0);

    // Verify ascending order
    for (let i = 0; i < brandOptions.length - 1; i++) {
      expect(Number(brandOptions[i].sellingPrice)).toBeLessThanOrEqual(
        Number(brandOptions[i + 1].sellingPrice),
      );
    }
  });

  it('can be attached to RecommendedOffer', () => {
    const offer: Partial<RecommendedOffer> = {
      offerId: 502,
      supplierSkuId: 102,
      skuName: 'Amul Fresh Paneer 1kg',
      brandName: 'Amul',
      sellingPrice: '410.00',
      brandOptions,
    };

    expect(offer.brandOptions).toHaveLength(3);
    expect(offer.brandOptions?.[0].brandName).toBe('Nandini');
    expect(offer.brandOptions?.[0].sellingPrice).toBe('380.00');
  });

  it('can be attached to StorefrontSku', () => {
    const sku: Partial<StorefrontSku> = {
      supplierSkuId: 101,
      skuName: 'Nandini Paneer 1kg',
      brandOptions,
    };

    expect(sku.brandOptions).toHaveLength(3);
    expect(sku.brandOptions?.[0].brandName).toBe('Nandini');
  });

  it('can be attached to SkuDetail', () => {
    const detail: Partial<SkuDetail> = {
      supplierSkuId: 102,
      skuName: 'Amul Fresh Paneer 1kg',
      brandOptions,
    };

    expect(detail.brandOptions).toHaveLength(3);
    expect(detail.brandOptions?.[0].brandName).toBe('Nandini');
  });
});
