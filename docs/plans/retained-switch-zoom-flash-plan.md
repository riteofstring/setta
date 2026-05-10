# Retained Switch Zoom Flash Plan

## Goal
Eliminate the user-visible flash where a retained canvas switch briefly shows its previous state after the user toggles it and then zooms or pans before the committed retained texture catches up.

The UI invariant is:

`visible switch state = latest frontend-intended switch state`

Zooming, panning, retained texture fallback, backend latency, websocket latency, and animation timing must not expose an older logical state for a switch whose newer state is already known locally.

## Current Evidence
- The Chrome recording shows `settings-codeobj__gui__gui__leftSidePaneShiftsMap` changing visual state through retained-content snapshots.
- `setParamEnteredValue` and `setViewport` requests overlap in the repro window.
- GPU frame diagnostics show switch animation/native visuals dropping back from `10` to `8` solid rounded rect visuals while retained page uploads remain `0`.
- That means the animation overlay can disappear while retained pages still contain the old switch rendering.

## Non-Goals
- No backward compatibility shims, legacy paths, migrations, dual-read/write paths, or transitional adapters.
- Do not fix this with a longer timer.
- Do not assert private renderer counters in the regression test.
- Do not disable retained texture fallback globally.

## Implementation Plan

### 1. Add a failing user-visible regression test
- Add a Playwright E2E test that drives the production UI:
  - open the settings project
  - make a known switch visible, preferably `gui.leftSidePaneShiftsMap`
  - delay the `setParamEnteredValue` response or websocket confirmation long enough to expose the current animation timeout
  - click the switch to change it from OFF to ON or ON to OFF
  - immediately zoom the canvas in/out using the same wheel gesture a user performs
  - capture screenshots or canvas pixels over the switch through the latency window
- The assertion must be visual/user-facing: the switch must never render as the previous state after the click.
- The test should fail on the current implementation because the switch can return to the old visible state once the animation overlay drops and before fresh retained content is available.
- The test must not inspect `contentVersion`, `staleFallbackDrawQuadCount`, `solidRoundedRectSurfaceCount`, or other implementation diagnostics.

### 2. Define the state ownership contract
- Treat the frontend-intended value as the authoritative visual state from the moment the user commits an immediate switch toggle.
- Use the existing param preview/update path as the local intended-value source where possible.
- Ensure retained row creation, hit records, animation start state, and page content versioning all read from the same intended value.
- Remove any code path where the switch animation store is the only place that knows about the newer switch state.

### 3. Version retained switch row content by intended value
- Include the intended switch value in the retained row content signature used for page content versions.
- When an immediate switch toggle is committed locally, the affected row segment must receive a new content version before backend confirmation.
- Keep this scoped to the affected row segment, not the entire retained surface.

### 4. Invalidate and prioritize the affected row/page
- On immediate retained switch toggle, invalidate the affected row rect in the retained content page manager.
- Queue the work as interactive priority.
- Use the row/source rect already known from the retained hit record or scene command; do not infer it with text or label heuristics.
- Request a texture-upload frame immediately after invalidation.

### 5. Prevent stale retained pages from exposing old switch state
- Add an explicit freshness gate for active switch-intent rows:
  - if retained page coverage for the affected switch row is stale or missing, keep drawing the switch control from the live intended state as a native overlay
  - clear that overlay only when the retained page cache has committed coverage for the current row content version
- This is the principled replacement for timer-only protection.
- The overlay should be precise to the switch track/thumb so unchanged row text and layout can continue to use retained pages.

### 6. Simplify switch animation semantics
- Make switch animation purely presentation over the intended state, not a separate source of truth.
- A transition can finish visually, but freshness protection remains active until retained content is current.
- Remove timer-based assumptions that a completed animation implies the retained texture is safe to show.

### 7. Add focused lower-level coverage
- Add Vitest coverage for retained switch freshness behavior:
  - immediate toggle records a new intended value
  - row content version changes when the intended switch value changes
  - stale retained page coverage keeps the native switch overlay active
  - fresh retained page coverage allows the overlay to clear
- These tests may inspect renderer contracts because they support the implementation, but they are secondary to the user-visible Playwright regression.

### 8. Verify the full flow
- Run the new Playwright regression and confirm it fails before the fix and passes after the fix.
- Run targeted Vitest suites around retained content, switch animation, page versioning, and project GPU retained param interactions.
- Run `./scripts/quality/check.sh` before finishing the implementation.
- Perform Chrome DevTools visual verification for the settings switch toggle + zoom flow.

## Acceptance Criteria
- The Playwright regression captures the observed flash and passes after the fix.
- A switch never visually reverts to its previous state after an immediate user toggle, even while backend confirmation is delayed.
- Zoom and pan can reuse retained texture pages, but cannot expose stale switch state for an active intended-value change.
- The fix is state/version driven, not timer driven.
- Freshness protection is scoped to affected switch rows and does not disable retained page fallback globally.
- No backward compatibility, migration, legacy, or transitional code is added.

## Suggested Execution Order
1. Add the failing Playwright regression.
2. Add the intended switch visual state contract and row versioning changes.
3. Add row/page invalidation at switch commit.
4. Add retained freshness gating and precise native overlay retention.
5. Simplify timer-only switch animation cleanup.
6. Add lower-level Vitest coverage.
7. Run targeted verification, then full quality check.
