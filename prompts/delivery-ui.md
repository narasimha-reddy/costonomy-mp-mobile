# Costonomy Marketplace – React Native Delivery Module

## 1. Project Context

We are building a **B2B marketplace connecting restaurants with suppliers**.

The Restaurant ↔ Supplier onboarding experience has already been implemented.

The backend/API for the Delivery module **already exists**.

Our current objective is to implement the **Delivery / Logistics UI in React Native** and integrate it with the existing backend APIs.

The delivery experience represents movement of goods:

**Supplier → Delivery / Logistics → Restaurant**

The UI should provide a modern, production-quality logistics experience similar to established delivery and logistics applications.

---

# 2. Repository

The React Native application is located at:

```text
/Users/rac/Documents/costonomy_projects/marketplace_be/costonomy-mp-mobile
```

The backend/API already exists here:

```text
/Users/rac/Documents/costonomy_projects/marketplace_be/costonomy-mp-api
```

The API repository should primarily be used for:

* Understanding existing API contracts
* Understanding request/response models
* Understanding delivery status values
* Understanding available tracking information
* Understanding authentication requirements
* Understanding pagination/filtering
* Understanding error responses

**Do not modify the backend unless explicitly requested.**

---

# 3. Primary Objective

Build a **world-class Delivery UI in React Native**.

The experience should make it immediately clear:

* What delivery is being tracked
* Supplier
* Restaurant
* Current delivery status
* Current delivery stage
* Pickup information
* Destination information
* ETA
* Delivery progress
* Timeline/history
* Driver/logistics partner information where available
* Exceptions or delays
* Proof of delivery where available

The UI should feel like a professional logistics application rather than a basic CRUD interface.

---

# 4. Most Important Rule

## Understand Before Implementing

Do NOT immediately start creating screens.

First inspect the existing React Native application.

Understand:

### Existing UI

* Navigation
* Screens
* Components
* Design system
* Theme
* Typography
* Colors
* Spacing
* Cards
* Buttons
* Forms
* Status indicators
* Lists
* Bottom sheets
* Modals
* Loading states
* Empty states
* Error states

### Existing Architecture

Understand:

* Folder structure
* Feature/module structure
* State management
* API client
* Hooks
* Services
* Types/interfaces
* Navigation patterns
* Query/cache strategy
* Authentication
* Error handling
* Testing
* Component conventions

### Existing Onboarding Module

The existing Restaurant/Supplier onboarding module is the primary UI reference.

Identify:

* Reusable components
* Navigation patterns
* API integration patterns
* Screen layout patterns
* Styling conventions
* Form patterns
* Loading/error handling
* State management

**Reuse existing patterns whenever possible.**

Do not introduce a second way of solving something that the application already solves.

---

# 5. Backend Discovery

Inspect the existing API implementation only to understand the available contracts.

Determine:

* Delivery endpoints
* Request models
* Response models
* Delivery statuses
* Timeline/event structure
* ETA information
* Tracking/location information
* Driver information
* Supplier information
* Restaurant information
* Pagination
* Filtering
* Sorting
* Error responses

Do not create fictional APIs.

The UI must work with the **actual backend contract**.

If the API does not currently expose information required by the desired UI, clearly identify the gap rather than inventing a frontend-only solution.

---

# 6. Delivery UX

The Delivery module should be designed around the user's operational questions.

A user opening the Delivery screen should be able to answer quickly:

> Where is my delivery?

> What is its current status?

> When will it arrive?

> Where did it come from?

> Where is it going?

> What happened so far?

> Is anything delayed or wrong?

---

# 7. Delivery List Screen

Create a clear Delivery List experience.

A delivery card should provide the most important information at a glance.

Example:

```text
DEL-10482

ABC Foods
       ↓
Green Leaf Restaurant

● In Transit

ETA
Today, 4:30 PM

Pickup: 3:10 PM
```

Potential information:

* Delivery reference
* Supplier
* Restaurant
* Current status
* ETA
* Date/time
* Exception indicator
* Priority if supported

Do not display every available API field.

Prioritize information based on operational importance.

---

# 8. Delivery List UX

The list should support appropriate:

* Search
* Status filtering
* Date filtering
* Sorting
* Pull-to-refresh
* Pagination/infinite scrolling if supported by API

Do not implement filters that cannot be supported correctly by the existing API unless client-side filtering is explicitly appropriate.

Provide:

### Loading state

Use the application's existing loading/skeleton patterns.

### Empty state

Clearly explain when there are no deliveries.

### Error state

Provide a useful retry experience.

### Refresh state

Support pull-to-refresh where consistent with the existing app.

---

# 9. Delivery Detail Screen

The Delivery Detail screen is the primary experience.

Suggested structure:

```text
────────────────────────────

DEL-10482

● IN TRANSIT

Arriving by
4:30 PM

────────────────────────────

FROM

ABC Foods
Supplier Location

        ↓

PICKED UP
3:10 PM

        ↓

IN TRANSIT
Current

        ↓

TO

Green Leaf Restaurant
Restaurant Location

────────────────────────────

DELIVERY TIMELINE

✓ Delivery created
✓ Driver assigned
✓ Pickup completed
● In transit
○ Delivered

────────────────────────────

DRIVER

John
Vehicle: TS09 XX 1234

────────────────────────────
```

This is a UX direction, not a rigid layout.

Use the application's existing design language.

---

# 10. Delivery Status Visualization

Do not simply display backend enum values.

For example:

```text
PICKUP_COMPLETED
```

should become something understandable such as:

```text
Picked up
```

Similarly:

```text
IN_TRANSIT
```

should become:

```text
In transit
```

Status presentation should include appropriate:

* Label
* Icon
* Visual indicator
* Progress position

Create a centralized status mapping rather than scattering status logic across components.

For example:

```text
DeliveryStatus
    ↓
status presentation model
    ↓
label
icon
progress
visual treatment
```

This prevents inconsistent status presentation throughout the app.

---

# 11. Delivery Timeline

The timeline is a key part of the experience.

Example:

```text
✓ 10:20
  Delivery created

✓ 11:05
  Driver assigned

✓ 12:15
  Picked up from supplier

● 12:45
  In transit

○
  Delivered
```

The timeline should make chronological progress immediately understandable.

Where API data supports it, display:

* Event
* Timestamp
* Location
* Relevant actor
* Additional context

Do not fabricate missing events.

---

# 12. Tracking Experience

If the backend provides location/tracking information, create an appropriate tracking experience.

Potentially:

```text
┌─────────────────────────────┐
│                             │
│           MAP               │
│                             │
│     ● Driver                │
│              ● Restaurant   │
│                             │
└─────────────────────────────┘

ETA: 18 min

Driver is approaching the
restaurant
```

If real-time tracking is not available yet, do not fake live tracking.

Instead create the best experience supported by the existing API.

Clearly separate:

* Current status
* Last known location
* ETA
* Tracking freshness

---

# 13. Supplier → Restaurant Visualization

The journey should be visually obvious.

Prefer a visual representation such as:

```text
SUPPLIER
ABC Foods
Hyderabad

       │
       │
       ▼

DELIVERY
In Transit
ETA 25 min

       │
       ▼

RESTAURANT
Green Leaf
Miyapur
```

The user should understand the journey without reading technical details.

---

# 14. Reusable Component Strategy

Create reusable components where they represent real UI concepts.

Potential components:

```text
DeliveryCard
DeliveryStatusBadge
DeliveryStatusIndicator
DeliveryTimeline
DeliveryTimelineItem
DeliveryRoute
DeliveryLocationCard
DeliveryEta
DriverCard
DeliveryExceptionCard
DeliveryProgress
DeliveryEmptyState
```

These are examples.

Do not create components simply to increase abstraction.

A component should exist when it:

* Has a meaningful UI responsibility
* Is reused
* Encapsulates meaningful logic
* Improves readability/testability

---

# 15. API Integration

Use the existing API client architecture.

Do not introduce a new networking layer.

Follow existing application conventions for:

* API calls
* Authentication
* Headers
* Error handling
* Retries
* Caching
* Query invalidation
* Pagination

Prefer typed API models.

Do not use `any` to bypass API typing.

If the API response is complex, introduce appropriate mapping between:

```text
API response
      ↓
UI/domain model
      ↓
React Native components
```

Avoid coupling every UI component directly to raw API responses.

---

# 16. State Management

Follow the application's existing state management approach.

Do not introduce Redux/Zustand/Context/etc. simply because it is familiar.

First understand what the project already uses.

Keep:

* Server state
* UI state
* Navigation state

appropriately separated.

Avoid unnecessary global state.

---

# 17. Navigation

Integrate Delivery into the existing navigation architecture.

Determine:

```text
Existing navigation
        ↓
Delivery entry point
        ↓
Delivery list
        ↓
Delivery detail
        ↓
Tracking / supporting screens
```

Do not redesign application-wide navigation unless explicitly required.

---

# 18. UI Quality Bar

The UI must be:

### Clear

Users should understand delivery state immediately.

### Consistent

Follow the existing application's visual language.

### Responsive

Support different device sizes.

### Accessible

Consider:

* Touch targets
* Text readability
* Contrast
* Screen reader labels where appropriate
* Meaningful accessibility roles

### Resilient

Handle:

* Loading
* Empty
* Error
* Partial API data
* Missing optional fields
* Long supplier/restaurant names
* Long addresses
* Slow network
* API failures

---

# 19. Do Not Fake Data

During development, mock data may be used only when necessary for isolated UI development.

Clearly mark mock data.

Do not commit fake tracking information as if it were real backend data.

Do not show:

* Fake GPS locations
* Fake ETA
* Fake driver information
* Fake delivery events

in production flows.

---

# 20. Implementation Strategy

Do NOT implement the entire Delivery module in one PR.

Break it into small, meaningful vertical slices.

A suggested sequence:

## PR-001 — Delivery Architecture & UI Foundation

Scope:

* Repository discovery
* API contract discovery
* Delivery navigation entry
* Delivery types/models
* API integration foundation
* Shared delivery status mapping
* Basic screen structure
* Required reusable components

No unnecessary visual polish yet.

---

## PR-002 — Delivery List

Implement:

* Delivery list
* Delivery cards
* Status
* Supplier
* Restaurant
* ETA
* Loading state
* Empty state
* Error state
* Pull-to-refresh
* Pagination if supported

---

## PR-003 — Delivery Detail

Implement:

* Delivery detail screen
* Supplier
* Restaurant
* Pickup
* Destination
* Status
* ETA
* Delivery summary
* Responsive layout

---

## PR-004 — Delivery Timeline

Implement:

* Delivery lifecycle visualization
* Timeline
* Event timestamps
* Current stage
* Completed/upcoming states
* Timeline error/empty handling

---

## PR-005 — Tracking

Implement only if supported by backend:

* Location
* Map
* Driver
* ETA
* Last updated information
* Tracking state

---

## PR-006 — Exceptions & Operational UX

Implement supported:

* Delays
* Failed delivery
* Cancellation
* Rescheduling
* Exception messages

---

## PR-007 — UX Polish & Hardening

Improve:

* Accessibility
* Animations where useful
* Skeletons
* Performance
* Edge cases
* Long text handling
* Error recovery
* Visual consistency
* Test coverage

This PR breakdown is only a starting point.

After repository discovery, adjust it based on the actual application.

---

# 21. PR Rules

Every PR must represent one meaningful unit of work.

A PR should be:

* Independently understandable
* Independently reviewable
* Testable
* As small as reasonably possible
* Free from unrelated refactoring

Avoid:

```text
Delivery UI
+
Navigation refactor
+
Theme refactor
+
API client rewrite
+
Unrelated bug fixes
```

in a single PR.

---

# 22. Mandatory PR Change Log

Every PR must contain a comprehensive change log.

Use:

```text
docs/delivery/CHANGELOG.md
```

Every entry must contain:

````markdown
# PR-XXX – <Title>

## Objective

## User Impact

## Scope

### Screens
-

### Components
-

### API Integration
-

### Navigation
-

### State Management
-

### Styling
-

### Tests
-

## API Dependencies

Existing endpoints used:

-

## UI/UX Changes

-

## Behaviour Changes

-

## Edge Cases Handled

-

## Files Added

-

## Files Modified

-

## Tests Executed

```bash
...
````

## Verification

* [ ] TypeScript/type check
* [ ] Lint
* [ ] Unit tests
* [ ] Component tests
* [ ] Integration tests where applicable
* [ ] Manual verification

## Known Limitations

*

## Follow-up Work

*

## Design/Architecture Decisions

*

## Assumptions

*

````

The changelog must describe **what changed and why**, not just list files.

---

# 23. Change Tracking

The changelog is the historical source of truth for the Delivery UI.

Example:

```text
PR-001
  Foundation
       ↓
PR-002
  Delivery List
       ↓
PR-003
  Delivery Detail
       ↓
PR-004
  Timeline
       ↓
PR-005
  Tracking
       ↓
PR-006
  Exceptions
       ↓
PR-007
  UX Hardening
````

A new agent must read:

```text
docs/delivery/CHANGELOG.md
```

before beginning a new Delivery PR.

Do not rewrite historical entries.

Append new changes.

---

# 24. Agent Workflow

For every task, follow this exact process.

## STEP 1 — DISCOVER

Inspect:

```text
costonomy-mp-mobile
costonomy-mp-api
```

Do not modify code.

---

## STEP 2 — UNDERSTAND

Identify:

* Existing architecture
* Onboarding implementation
* Navigation
* API client
* State management
* Design system
* Reusable components
* Existing testing patterns
* Delivery API contracts

---

## STEP 3 — IDENTIFY REUSE

Explicitly identify:

```text
Existing component → Reuse
Existing hook → Reuse
Existing API client → Reuse
Existing navigation pattern → Reuse
Existing design token → Reuse
```

Only introduce new infrastructure where necessary.

---

## STEP 4 — DESIGN

Before implementation provide:

```text
Problem
Solution
User flow
Screen structure
API integration
Component structure
State management
Testing strategy
PR scope
Risks
Assumptions
```

---

## STEP 5 — DEFINE PR

Clearly state:

```text
PR:
Title:
Objective:
User value:
Included:
Excluded:
Dependencies:
Acceptance criteria:
```

Do not implement anything outside this scope.

---

## STEP 6 — IMPLEMENT

Implement only the agreed PR.

Keep the diff focused.

---

## STEP 7 — TEST

Run the appropriate project commands.

At minimum:

* Type checking
* Lint
* Relevant unit tests
* Relevant component tests
* Build if practical

Also manually verify the affected screens where possible.

---

## STEP 8 — REVIEW THE DIFF

Before completing the PR:

Check:

* Did I modify unrelated files?
* Did I duplicate existing components?
* Did I introduce unnecessary dependencies?
* Did I follow existing patterns?
* Did I introduce `any`?
* Did I hardcode API data?
* Did I handle loading?
* Did I handle errors?
* Did I handle empty states?
* Did I handle missing optional data?
* Does the UI work on different screen sizes?
* Is navigation correct?

---

## STEP 9 — UPDATE CHANGELOG

Update:

```text
docs/delivery/CHANGELOG.md
```

with the complete PR history entry.

---

## STEP 10 — STOP

Once the PR scope is complete:

**STOP.**

Do not automatically implement the next PR.

The next PR should begin as a separate unit of work.

---

# 25. Acceptance Criteria

Every PR must contain explicit acceptance criteria.

Example:

```text
Given the user opens Deliveries

When deliveries are available

Then the user sees a list of deliveries

And each delivery clearly displays:

- Delivery reference
- Supplier
- Restaurant
- Current status
- ETA

And tapping a delivery opens the Delivery Detail screen.

And loading, empty and error states are handled.
```

Also define negative cases.

Example:

```text
Given the Delivery API fails

When the user opens the Delivery screen

Then an appropriate error state is shown

And the user can retry

And the application does not crash.
```

---

# 26. Handling Missing Backend Capabilities

If the desired UI requires information that the existing backend does not provide:

Do NOT invent a solution.

Instead report:

```text
Backend capability gap

Required:
Driver current location

Available:
Driver ID
Driver name
Last known timestamp

Missing:
Latitude
Longitude
```

Then:

1. Build the UI around available information where possible.
2. Clearly identify the missing capability.
3. Mark it as follow-up work.
4. Do not modify the backend unless explicitly requested.

---

# 27. Performance

The Delivery module may eventually handle a large number of deliveries.

Consider:

* FlatList optimization
* Pagination
* Stable keys
* Memoization where justified
* Avoiding unnecessary renders
* Image optimization
* API caching
* Debounced search
* Efficient filtering

Do not prematurely optimize.

Optimize based on actual architecture and requirements.

---

# 28. Testing Strategy

Tests should focus on user-visible behaviour and important business/UI logic.

Test:

### Status mapping

```text
API status → UI status
```

### Delivery cards

* Correct information
* Missing optional information
* Long text
* Different statuses

### Timeline

* Completed events
* Current event
* Future events
* Missing timestamps

### Delivery detail

* Complete response
* Partial response
* API error

### Navigation

* List → Detail
* Back navigation
* Deep linking if applicable

### Error handling

* Network error
* API error
* Empty response

Avoid tests that merely verify implementation details.

---

# 29. Definition of Done

A PR is complete only when:

* [ ] Existing architecture inspected
* [ ] Existing onboarding implementation inspected
* [ ] Existing API contracts inspected
* [ ] Existing components reused where appropriate
* [ ] Scope clearly defined
* [ ] UI implemented
* [ ] API integration implemented
* [ ] Loading state implemented
* [ ] Empty state implemented
* [ ] Error state implemented
* [ ] Accessibility considered
* [ ] Responsive behaviour considered
* [ ] Tests added
* [ ] Type checking passes
* [ ] Lint passes
* [ ] Relevant tests pass
* [ ] No unrelated changes
* [ ] Git diff reviewed
* [ ] `docs/delivery/CHANGELOG.md` updated
* [ ] Known limitations documented
* [ ] Follow-up work documented

---

# 30. First Task — Discovery Only

Start with **Discovery & UI Architecture Assessment**.

Do NOT modify code.

Inspect:

```text
/Users/rac/Documents/costonomy_projects/marketplace_be/costonomy-mp-mobile

/Users/rac/Documents/costonomy_projects/marketplace_be/costonomy-mp-api
```

Then report:

### A. React Native Architecture

* Project structure
* Navigation
* State management
* API client
* Design system
* Component architecture
* Testing approach

### B. Existing Onboarding UI

Identify the relevant onboarding screens/components and explain which patterns should be reused.

### C. Backend Delivery API

Document the existing delivery APIs and response structures relevant to the UI.

### D. Delivery Domain Available to UI

Document:

* Delivery statuses
* Timeline/events
* Supplier information
* Restaurant information
* Pickup information
* Destination information
* ETA
* Tracking information
* Driver information
* Exceptions

### E. UI Architecture Proposal

Propose:

* Delivery navigation
* Delivery list
* Delivery detail
* Timeline
* Tracking
* Reusable components
* Hooks/state
* API integration

### F. PR Breakdown

Provide the recommended PR sequence.

### G. PR-001

Provide:

* Objective
* User value
* Scope
* Out of scope
* Files/components expected to change
* Acceptance criteria
* Testing strategy
* Risks
* Assumptions

### H. Blocking Questions

Only ask questions that genuinely block implementation.

**Do not modify code during this discovery phase.**

Wait for approval before implementing PR-001.
