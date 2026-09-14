# Mandi design system

Everything visual in `costonomy-mp-mobile` comes from this folder. If you are
about to write a colour, a font size, a margin or a duration inline in a screen,
it belongs here instead.

## Where things live

| File | Holds |
|---|---|
| `colors.ts` | Every colour, named for meaning |
| `typography.ts` | Font families, sizes, and the named `TextStyles` scale |
| `spacing.ts` | 4-point spacing scale, radii, elevation |
| `layout.ts` | Control heights, icon sizes, touch targets, window size classes |
| `motion.ts` | Durations, easing, countdown thresholds, data-freshness thresholds |

Import from the barrel, never from a file directly:

```ts
import { Colors, Spacing, TextStyles } from '@/theme';
```

## Relationship to costonomy-mobile-app

The base palette, the type scale and the spacing scale are **identical** to
`costonomy-mobile-app/constants/`. Mandi is a Costonomy product and should read
as one. Do not "improve" a shared value here in isolation — if `Spacing.lg`
should change, it changes in both apps or in neither.

What Mandi adds on top are semantic tokens for the procurement domain, which the
Costonomy app has no equivalent of:

- **countdown** — the supplier acceptance SLA ramp (calm → warn → critical)
- **credit** — supplier-funded credit, deliberately a different hue from cash
- **savings / recommended** — best-value ranking
- **deliveryLive / deliveryRoute / deliveryDriver** — live tracking
- **stale / offline** — data freshness

Structural difference worth knowing: this repo uses `theme/` where
costonomy-mobile-app uses `constants/`. Same idea, clearer name for a repo where
the design system is the foundation rather than an afterthought. `constants/` in
this repo is for non-visual constants only.

## Rules

**1. No literal colours outside `theme/colors.ts`.**
A hex in a screen is invisible in review and is what makes a later dark palette a
rewrite instead of a new file. If you need a colour that is not here, the right
move is to add a *semantic* token, not to reach for the nearest existing one.

```ts
// no
<View style={{ backgroundColor: '#FFF7ED' }} />
// yes
<View style={{ backgroundColor: Colors.primaryLight }} />
```

**2. Name tokens for meaning, never appearance.**
`Colors.countdownCritical`, not `Colors.red`. This is the whole reason a dark
palette is later a one-file change: `stale` can become a different grey without
every call site having to agree on what "grey" meant.

**3. Use `TextStyles`, don't assemble type by hand.**
`fontSize: 16, fontFamily: FontFamily.semibold` scattered across screens is how
"the same" section header ends up at three different sizes.

**4. Money and quantities use the tabular variants.**
`TextStyles.price`, `priceSmall`, `numeric`, `countdown` all set
`fontVariant: ['tabular-nums']` so figures in a column align on the decimal
point. A price in a comparison list or cart that does not use one of these will
visibly jitter.

**5. Never convey information by colour alone.**
Required by §23A.48. Every `MandiStatusChip` tone carries an icon as well as a
colour; keep that property when you add one.

**6. Every animation checks `useReducedMotion()`.**
Required by §23A.49. Fall back to an instant change, not a faster animation.

## Dark mode

The app ships light-only today, matching `costonomy-mobile-app`
(`app.json` pins `userInterfaceStyle: light`). The tokens are structured so dark
mode is additive rather than a refactor:

1. add `colors.dark.ts` with the same keys
2. add a `ThemeProvider` that picks a palette from `useColorScheme()`
3. change `Colors` from a constant to a hook (`useColors()`)

Step 3 is a mechanical change *only while rule 1 holds*. Every hex that leaks
into a screen is one more site that has to be found and fixed by hand later, so
treat a stray colour literal as a real defect, not a nit.

## What is intentionally not here

**No `MandiProductCard`, `MandiSupplierCard`, `MandiOrderCard`, `MandiTimeline`,
`MandiMap`, `MandiDriverCard`, `MandiCreditSummary`.** Those appear in the
§23A.3 component list but they are *domain* components: their shape is decided by
the DTOs the API returns, and building them before those contracts exist means
guessing twice. They land with their screens, composed from the primitives here.
