import { DetailType, FontFamily, WalletFont, WalletType } from '@/theme';

describe('wallet screens use the app font', () => {
  it('maps every weight to Source Sans 3, never Inter', () => {
    expect(WalletFont).toEqual({
      regular: FontFamily.regular, medium: FontFamily.medium,
      semibold: FontFamily.semibold, bold: FontFamily.bold,
    });
    const families = [...Object.values(WalletType), ...Object.values(DetailType)].map((t) => t.fontFamily);
    for (const f of families) expect(f).toMatch(/^SourceSans3_/);
  });
  it('keeps tracking at zero or tiny', () => {
    for (const t of [...Object.values(WalletType), ...Object.values(DetailType)]) {
      expect(Math.abs(t.letterSpacing)).toBeLessThanOrEqual(0.15);
    }
  });
});
