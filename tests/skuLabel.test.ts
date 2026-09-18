import { skuSecondaryLine, skuTitle, type SkuDescriptor } from '@/utils/skuLabel';

const base: SkuDescriptor = {
  supplierSkuId: 1,
  productName: 'Paneer',
  skuName: 'Paneer',
  brandName: null,
  packSize: null,
  packUnit: null,
  measureValue: null,
  measureUnit: null,
  imageUrl: null,
  status: 'ACTIVE',
};

describe('skuSecondaryLine', () => {
  it('reads pack, then price, then brand', () => {
    expect(skuSecondaryLine({
      ...base, brandName: 'Amul', packSize: '12', packUnit: 'PACK',
      measureValue: '500', measureUnit: 'ML',
    }, '120.30')).toBe('12 PACK (500 ML) · ₹120.30 · Amul');
  });

  // A pack with no live offer has no price. Omitted rather than shown as zero,
  // which would read as free.
  it('omits the price when there is none', () => {
    expect(skuSecondaryLine({ ...base, brandName: 'Amul', packSize: '1', packUnit: 'KG' }))
      .toBe('1 KG · Amul');
    expect(skuSecondaryLine({ ...base, brandName: 'Amul', packSize: '1', packUnit: 'KG' }, null))
      .toBe('1 KG · Amul');
  });

  // A measure needs both halves. "500" alone reads as a pack size and "(ML)"
  // says nothing, so a half-stated measure is worse than none.
  it('shows the measure only when value and unit are both present', () => {
    expect(skuSecondaryLine({ ...base, packSize: '1', packUnit: 'KG', measureValue: '500' }))
      .toBe('1 KG');
    expect(skuSecondaryLine({ ...base, packSize: '1', packUnit: 'KG', measureUnit: 'ML' }))
      .toBe('1 KG');
  });

  it('drops the brand when a supplier has not set one', () => {
    expect(skuSecondaryLine({ ...base, packSize: '1', packUnit: 'KG' })).toBe('1 KG');
  });

  // 1.0000 KG is how DECIMAL(19,4) comes back, and is not how anybody writes it.
  it('trims trailing zeros without dropping real decimals', () => {
    expect(skuSecondaryLine({ ...base, packSize: '1.0000', packUnit: 'KG' })).toBe('1 KG');
    expect(skuSecondaryLine({ ...base, packSize: '0.5000', packUnit: 'KG' })).toBe('0.5 KG');
  });

  it('survives a missing descriptor rather than throwing', () => {
    expect(skuSecondaryLine(null)).toBe('');
    expect(skuSecondaryLine(undefined)).toBe('');
    expect(skuSecondaryLine(base)).toBe('');
  });

  it('never repeats the SKU name, which is usually the product name', () => {
    expect(skuSecondaryLine({ ...base, skuName: 'Paneer', packSize: '1', packUnit: 'KG' }))
      .not.toContain('Paneer');
  });
});

describe('skuTitle', () => {
  it('leads with the product, falling back to the pack name', () => {
    expect(skuTitle(base)).toBe('Paneer');
    expect(skuTitle({ ...base, productName: null, skuName: 'Amul Paneer Block' }))
      .toBe('Amul Paneer Block');
    expect(skuTitle(null)).toBe('Item');
  });
});
