# No use before define (temporal dead zone)

## The incident
On the web production build the supplier order screen crashed on every load with
`ReferenceError: Cannot access 'findTimedOut' before initialization`. A react-query
callback (`refetchInterval: (query) => deliveryPollMs(..., findTimedOut)`) read a `const`
declared further down the same component. react-query calls `refetchInterval` synchronously
on the first `useQuery`, so the minified bundle (native `const`) hit the temporal dead zone.

Jest could not see it: babel compiles `const` to `var`, so the closure just read `undefined`.
(Babel's `tdz: true` option would emit the check, but it generates invalid code for
`for (const x of y)`, so it cannot be switched on for the suite.)

## The guard
`eslint.config.js` runs the `costonomy/no-tdz` rule (`tools/eslint/no-tdz.js`) as an error over
`app/`, `components/`, `hooks/`, `lib/`, `contexts/`. It is `@typescript-eslint/no-use-before-define`
(`functions: false, classes: true, variables: true, allowNamedExports: false, ignoreTypeReferences: true`)
with one exemption: a function body reading a MODULE-level binding declared lower in the file
(the `const styles = StyleSheet.create(...)` at the bottom of every screen), which is safe because the
function only runs after the module has loaded. `tests/tdzGuard.test.ts` pins the behaviour.

## What to do when it fires
Move the declaration above its first use. If two things genuinely need each other, read one through a
`useRef` (see `app/supplier/orders/[id].tsx`). Use `// eslint-disable-next-line costonomy/no-tdz -- <why it
cannot run before the declaration>` only when the use is provably after initialisation (for example a
mutation `onError`), and always say why.
