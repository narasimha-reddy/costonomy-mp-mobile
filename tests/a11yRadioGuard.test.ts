/**
 * Regression guard: a role=radio row must expose `checked`, never `selected`
 * (react-native-web turns `selected` into aria-selected, invalid on role=radio,
 * and TalkBack can announce "selected, checked" twice). Use radioState().
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
