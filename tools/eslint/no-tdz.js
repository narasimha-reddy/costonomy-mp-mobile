/**
 * `@typescript-eslint/no-use-before-define` with ONE exemption, so it can run as an
 * error without 2,400 false alarms.
 *
 * Exempt: a function body that reads a MODULE-level binding declared further down the
 * file. The ubiquitous `const styles = StyleSheet.create(...)` at the bottom of a screen
 * is that shape, and it is safe because the function runs after the module finished
 * evaluating.
 *
 * Still reported (this is the production crash): a reference to a const/let declared
 * LATER IN THE SAME FUNCTION (a closure inside a component reading a const declared
 * further down the component), and module-level code that reads a later module binding
 * while the module is still evaluating. See docs/NO_USE_BEFORE_DEFINE.md.
 */
const base = require('@typescript-eslint/eslint-plugin').rules['no-use-before-define'];

function findVariable(scope, name) {
  for (let s = scope; s; s = s.upper) {
    const v = s.set.get(name);
    if (v) return v;
  }
  return null;
}

module.exports = {
  meta: base.meta,
  defaultOptions: base.defaultOptions,
  create(context) {
    const sourceCode = context.sourceCode;
    const filtered = Object.create(context, {
      report: {
        value(descriptor) {
          const node = descriptor.node;
          const name = descriptor.data && descriptor.data.name;
          if (node && name) {
            const scope = sourceCode.getScope(node);
            const variable = findVariable(scope, name);
            const declScope = variable && variable.scope.variableScope;
            const refScope = scope.variableScope;
            const declAtModule = declScope && (declScope.type === 'module' || declScope.type === 'global');
            if (declAtModule && refScope.type === 'function') return; // runs after module init
          }
          context.report(descriptor);
        },
      },
    });
    return base.create(filtered);
  },
};
