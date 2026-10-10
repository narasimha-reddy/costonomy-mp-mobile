import fs from 'fs';
import path from 'path';

/**
 * Customers and suppliers are told about a "delivery partner", never a rider, courier or driver. This scans the
 * copy files for string literals (and JSX text) with those words. Identifiers, enum values, test ids and comments
 * are not copy and are skipped.
 */
const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'lib/delivery/trackingHeader.ts',
  'lib/delivery/supplierTrackingHeader.ts',
  'lib/delivery/orderTracking.ts',
  'lib/delivery/sandbox.ts',
  'lib/supplier/orderInbox.ts',
  'models/status.ts',
  'hooks/useSandboxAdvance.ts',
  'components/delivery/SandboxControlCard.tsx',
  'components/delivery/PartnerSearchPanel.tsx',
  'components/request/DeliveryModePicker.tsx',
  'components/request/DeliveryOfferChoice.tsx',
  'app/restaurant/cart.tsx',
  'app/supplier/settings/store/[id].tsx',
];
const WORD = /\b(rider|courier|driver)s?\b/i;

/** Quoted strings only, comments blanked first. Enum values are UPPER_SNAKE and never contain a space. */
function literals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const found: string[] = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) found.push(m[1] ?? m[2] ?? m[3] ?? '');
  return found.filter((text) => /[a-z]/.test(text) && text.includes(' '));
}

describe('customer-visible wording', () => {
  it.each(FILES)('%s says delivery partner, not rider, courier or driver', (file) => {
    const bad = literals(fs.readFileSync(path.join(ROOT, file), 'utf8')).filter((text) => WORD.test(text));
    expect(bad).toEqual([]);
  });

  it('the scanner itself catches a banned word in a string', () => {
    expect(literals("const a = 'Rider is on the way'; // a rider\\n").filter((t) => WORD.test(t))).toEqual(['Rider is on the way']);
    expect(literals("const k = 'DRIVER_ASSIGNED';").filter((t) => WORD.test(t))).toEqual([]);
  });
});
