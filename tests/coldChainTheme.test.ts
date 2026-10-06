import fs from 'fs';
import path from 'path';
import { Colors } from '@/theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('the cold-chain banner colours', () => {
  it('meet WCAG 2.1 AA for small text (4.5:1) on their banner', () => {
    expect(contrastRatio(Colors.coldChain, Colors.coldChainLight)).toBeGreaterThanOrEqual(4.5);
  });

  it('are used through the theme: no screen draws its own copy of the old hard-coded values', () => {
    const roots = ['app', 'components'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name) && /#E0F2FE|#0284C7|#0369A1/i.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(full);
        }
      }
    };
    roots.forEach((root) => walk(path.join(__dirname, '..', root)));
    expect(offenders).toEqual([]);
  });
});
