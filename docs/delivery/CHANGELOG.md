# PR-006 – Route / driver refinement

## Objective

Take the operational delivery experience from functional to premium by polishing the logistics context: route clarity, driver confidence, and richer operational detail that staff can scan at a glance without leaving the order view.

## Scope

- Refine the route summary and place-specific context for pickup / destination.
- Strengthen driver and vehicle clarity on the detail screen.
- Add richer operational cues for route confidence and status transitions.
- Keep the layout grounded in the existing delivery contract and design system.

## Files Updated

- `app/restaurant/tracking/[orderId].tsx`
- `docs/delivery/CHANGELOG.md`

## Packaging

This PR is the current production-ready route/driver refinement slice for the restaurant delivery workflow. It keeps the operational flow grounded in the real backend contract while improving the scanability of route status, driver confidence, and live ETA context.

## Planned Follow-up

- This PR follows the final hardening pass and should only add operational polish, not new data contracts.

---

# PR-005 – Final hardening pass

## Objective

Tighten the delivery experience before premium route refinement by addressing small UX gaps, consistency issues, and the edge cases that matter most to restaurant operators when they triage the queue.

## Scope

- Sort late or overdue deliveries ahead of normal active work.
- Improve queue summaries and empty-state messaging for late and clear states.
- Keep the operational list responsive and readable under search and status filtering.
- Preserve the current backend contract and avoid speculative UI additions.

## Files Updated

- `app/restaurant/deliveries.tsx`
- `docs/delivery/CHANGELOG.md`

---

# PR-004 – Delivery ops package

## Objective

Package the current delivery work as a clean, reviewable slice for the restaurant operations workflow. This keeps the feature set stable, documents the exact shipped scope, and makes the next cleanup and route/driver refinements easier to sequence without reworking the list/detail foundation.

## Scope

- Freeze the real delivery list and exception flow as the current package for review.
- Keep all list/detail work grounded in the backend admin delivery contract and status mapping.
- Preserve the queue UX for operational users: search, filters, late emphasis, and empty states.
- Prepare the patch for a final hardening pass before any premium route/driver refinement.

## Files Updated

- `app/restaurant/deliveries.tsx`
- `app/restaurant/tracking/[orderId].tsx`
- `services/delivery.ts`
- `models/delivery.ts`
- `docs/delivery/CHANGELOG.md`

## Planned Follow-up

- PR-005 – Final hardening pass for polish, accessibility, and live-state clarity
- PR-006 – Route / driver refinement for a richer logistics-style detail experience

---

# PR-003 – Delivery exception UX

## Objective

Add the operational exception layer for active deliveries: late or missed ETA states should be visible immediately and separated from normal in-progress tracking so restaurant staff can triage them without reading the whole timeline.

## Scope

- Warning card for delivery delay when expected arrival is already in the past.
- Clear distinction between delayed delivery and raw failure state.
- Delivery list emphasizes late deliveries and gives actionable no-match / empty-state copy.
- Home quick actions expose the delivery queue as an operational entry point.
- Keep the screen grounded in real backend fields and status mappings only.

## Files Updated

- `app/restaurant/tracking/[orderId].tsx`
- `app/restaurant/deliveries.tsx`
- `app/restaurant/(tabs)/index.tsx`

---

# PR-002 – Delivery list & detail hardening

## Objective

Build the next operational slice after the order-level tracking foundation: make the delivery detail more legible for restaurant ops and add the first real delivery list view enabled by the backend delivery search API.

## Scope

- Delivery detail header now presents a stronger status headline, expected-arrival summary, and last-updated context.
- Delivery progress and route cards are clearer for fast operational scanning.
- Added a delivery list screen for live delivery triage with active/late/delivered filters.
- List and detail screens stay anchored to the actual backend contract and avoid fabricated delivery data.

## Files Updated

- `app/restaurant/tracking/[orderId].tsx`
- `app/restaurant/deliveries.tsx`
- `models/delivery.ts`
- `services/delivery.ts`

---

# PR-001 – Delivery Architecture & UI Foundation

## Objective

Establish the first delivery UI foundation around the existing backend contract and the app’s current restaurant flow. This PR focuses on the order-level delivery/tracking experience that is already supported by the API, while keeping the implementation aligned with the app’s design system, session model, and realtime refresh patterns.

## User Impact

Restaurant users can now understand whether a delivery is being arranged, if it is in progress, whether tracking is live, and whether the app should show a stale location or a supplier-owned delivery without a GPS feed.

## Scope

### Screens
- Restaurant order detail route remains the entry point to the tracking flow
- Delivery/tracking screen for a supplier order

### Components
- Existing delivery timeline component
- Existing delivery map component
- Reuse of shared Mandi status chip and card patterns

### API Integration
- Fetch delivery by supplier order via `fetchDelivery`
- Fetch timeline via `fetchDeliveryEvents`
- Reuse the session token and query client patterns already used across the app

### Navigation
- Order detail screen routes to `/restaurant/tracking/[orderId]`
- Tracking flow uses existing expo-router + local search params patterns

### State Management
- React Query handles loading, refetching, polling, and error states
- Realtime invalidation is used to refresh authoritative delivery state

### Styling
- Reuse `MandiScreen`, `MandiHeader`, `MandiCard`, `MandiStatusChip`, and existing spacing/color tokens
- Keep delivery UI visually consistent with the rest of the app

### Tests
- Status mapping and tracking render states are the target coverage for this PR

## API Dependencies

Existing endpoints used:
- `GET /api/v1/supplier-orders/{orderId}/delivery`
- `GET /api/v1/deliveries/{id}/events`
- `GET /api/v1/supplier-orders/{orderId}` for context around the order

## UI/UX Changes

- Delivery status is rendered through the app’s centralized status registry rather than raw backend enum strings
- Tracking screen exposes a meaningful “Finding a delivery partner…” empty state when no delivery exists yet
- Driver information, map state, stale location messaging, and timeline are shown when appropriate
- Supplier-own delivery is explained clearly when no live tracking is available

## Behaviour Changes

- The app treats a 404 from the delivery endpoint as a normal intermediate state rather than a crash or error screen
- Delivery polling is constrained and uses the realtime transport where available
- Stale location warnings are shown instead of treating old GPS as current

## Edge Cases Handled

- No delivery exists yet for the order
- Delivery API error while the rest of the order still loads
- Container/driver card with missing phone or vehicle fields
- Supplier-own delivery without trackable position
- Stale location data older than freshness threshold
- Missing or partial timeline data

## Files Added

- `docs/delivery/CHANGELOG.md`

## Files Modified

- `app/restaurant/tracking/[orderId].tsx`
- `components/delivery/DeliveryTimeline.tsx`
- `components/delivery/MandiMap.tsx`
- `services/delivery.ts`
- `models/status.ts`

## Tests Executed

```bash
# Validation was attempted in the local environment, but the required Node.js toolchain is not installed here.
# Attempted commands:
# source ~/.nvm/nvm.sh >/dev/null 2>&1 || true; node -v; npm -v; cd /Users/rac/Documents/costonomy_projects/marketplace_be/costonomy-mp-mobile && npx tsc --noEmit --pretty false
# Result: node/npm missing in this environment
```

## Verification

- TypeScript/type check: attempted, environment missing Node/npm
- Lint: not executed in this environment
- Unit tests: not executed in this environment
- Component tests: not executed in this environment
- Integration tests where applicable: not executed in this environment
- Manual verification: not possible in this environment

## Known Limitations

- There is no list endpoint for “all deliveries” in the current backend contract, so a delivery list is not included in this PR.
- Tracking remains order-level rather than a global delivery feed until the API supports collection queries.

## Follow-up Work

- Add a real delivery list screen when a backend collection endpoint is available
- Extend delivery detail to richer operational states, if the API exposes more data later
- Add automated tests once the Node toolchain is available in the workspace

## Design/Architecture Decisions

- Reuse the existing restaurant detail/tracking flow rather than inventing a new navigation pattern
- Keep delivery status mapping centralized and human-readable
- Treat backend status values as source of truth while translating only at the presentation layer

## Assumptions

- The delivery module is scoped to the restaurant-facing order tracking experience for this PR
- The API contract is the source of truth for delivery fields and status transitions
- We do not invent a list API or mock tracking data in production flows
