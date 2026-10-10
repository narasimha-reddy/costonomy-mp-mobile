/**
 * Regression guard: a role=radio row must expose `checked`, never `selected`
 * (react-native-web turns `selected` into aria-selected, invalid on role=radio,
 * and TalkBack can announce "selected, checked" twice). Use radioState().
 *
 * Second guard: react-native-web does not turn accessibilityState.checked into
 * aria-checked for role=radio (the web reads aria-checked=null), so every radio
 * row must carry aria-checked itself: spread radioProps(active) (or set
 * aria-checked) on the element.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, out: string[]): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

// Each radio row: from its role line, look at the props of the same element
// (up to the next `>` that closes the opening tag is hard to find with a regex,
// so use a small window and stop at the next element opening).
function offenders(src: string): number[] {
  const lines = src.split('\n');
  const bad: number[] = [];
  lines.forEach((line, i) => {
    if (!line.includes('accessibilityRole="radio"')) return;
    const lo = Math.max(0, i - 8);
    const hi = Math.min(lines.length, i + 9);
    for (let j = lo; j < hi; j++) {
      if (j !== i && /^\s*<[A-Za-z]/.test(lines[j] ?? "")) {
        if (j < i) continue; // props before our element opener belong to another tag
        break;
      }
      if (/accessibilityState=\{\{[^}]*\bselected\b/.test(lines[j] ?? "")) bad.push(i + 1);
    }
  });
  return bad;
}

// The props of the element whose role line is i: from the role line back to its opener and on to the next opener.
function elementWindow(lines: string[], i: number): string[] {
  let lo = i;
  while (lo > 0 && i - lo < 8 && !/^\s*<[A-Za-z]/.test(lines[lo] ?? '')) lo--;
  let hi = i + 1;
  while (hi < lines.length && hi - i < 9 && !/^\s*<[A-Za-z]/.test(lines[hi] ?? '') && !/^\s*\/?>\s*$/.test(lines[hi] ?? '')) hi++;
  return lines.slice(lo, hi + 1);
}

/** Radio rows (1-based line numbers) with no aria-checked: neither radioProps(...) spread nor an aria-checked prop. */
function missingAriaChecked(src: string): number[] {
  const lines = src.split('\n');
  const bad: number[] = [];
  lines.forEach((line, i) => {
    if (!line.includes('accessibilityRole="radio"')) return;
    const props = elementWindow(lines, i).join('\n');
    if (!/\{\.\.\.radioProps\(/.test(props) && !/aria-checked/.test(props)) bad.push(i + 1);
  });
  return bad;
}

describe('radio rows never expose accessibilityState.selected', () => {
  const files = [...walk(path.join(ROOT, 'app'), []), ...walk(path.join(ROOT, 'components'), [])];
  const radioFiles = files.filter((f) => fs.readFileSync(f, 'utf8').includes('accessibilityRole="radio"'));

  it('finds the radio rows (guard is not vacuous)', () => {
    expect(radioFiles.length).toBeGreaterThan(20);
  });

  it('no role=radio element sets selected in accessibilityState', () => {
    const found = radioFiles.flatMap((f) =>
      offenders(fs.readFileSync(f, 'utf8')).map((n) => `${path.relative(ROOT, f)}:${n}`),
    );
    expect(found).toEqual([]);
  });
});

describe('radio rows carry aria-checked for the web', () => {
  const files = [...walk(path.join(ROOT, 'app'), []), ...walk(path.join(ROOT, 'components'), [])];
  const radioFiles = files.filter((f) => fs.readFileSync(f, 'utf8').includes('accessibilityRole="radio"'));

  it('every role=radio element spreads radioProps() or sets aria-checked', () => {
    const found = radioFiles.flatMap((f) =>
      missingAriaChecked(fs.readFileSync(f, 'utf8')).map((n) => `${path.relative(ROOT, f)}:${n}`),
    );
    expect(found).toEqual([]);
  });

  it('the scanner catches a radio row with only accessibilityState (guard is not vacuous)', () => {
    const bare = [
      '<Pressable',
      '  onPress={onPress}',
      '  accessibilityRole="radio"',
      '  accessibilityState={radioState(active)}',
      '>',
    ].join('\n');
    expect(missingAriaChecked(bare)).toEqual([3]);
    expect(missingAriaChecked(bare.replace('accessibilityState={radioState(active)}', '{...radioProps(active)}'))).toEqual([]);
  });
});
