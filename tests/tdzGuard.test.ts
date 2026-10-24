/**
 * Guards against "Cannot access 'x' before initialization" reaching production.
 * Jest cannot see this bug (babel compiles const to var, and babel's tdz:true option
 * produces invalid code for `for (const x of y)`), so the costonomy/no-tdz lint rule is
 * the guard. These tests pin what the rule must keep catching.
 */
import { Linter } from 'eslint';

const noTdz = require('../tools/eslint/no-tdz');

function lint(code: string) {
  const linter = new Linter({ configType: 'flat' });
  return linter.verify(code, [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: require('@typescript-eslint/parser'), sourceType: 'module' },
      plugins: { costonomy: { rules: { 'no-tdz': noTdz } } },
      rules: { 'costonomy/no-tdz': 'error' },
    },
  ], 'x.ts');
}

describe('temporal dead zone', () => {
  it('lint flags a closure reading a const declared later in the same function', () => {
    const msgs = lint(`
      function useScreen(query: (cb: () => number) => void) {
        query(() => findTimedOut);
        const findTimedOut = 1;
        return findTimedOut;
      }`);
    expect(msgs.map((m) => m.ruleId)).toEqual(['costonomy/no-tdz']);
  });

  it('lint allows the bottom-of-file styles pattern and hoisted functions', () => {
    const msgs = lint(`
      export function Screen() { return styles.a + helper(); }
      function helper() { return 1; }
      const styles = { a: 1 };`);
    expect(msgs).toEqual([]);
  });

  it('lint flags module-level code reading a later module const', () => {
    const msgs = lint(`const a = b + 1;\nconst b = 2;\nexport { a };`);
    expect(msgs.map((m) => m.ruleId)).toEqual(['costonomy/no-tdz']);
  });
});
