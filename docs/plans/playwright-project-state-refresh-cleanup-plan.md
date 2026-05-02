# Playwright Project State Refresh Cleanup Plan

## Goal
Reduce and narrow `refreshProjectStateFromBackend` usage in Playwright so E2E tests rely more on real frontend behavior and only use explicit project-state rehydration for deliberate out-of-band setup.

## Current State
- Many Playwright specs mutate backend state through `page.request.post(...)` helpers after the page is already loaded.
- Those requests are handled by the Playwright test process, not by the React app, so the frontend does not see the normal mutation response path.
- Tests currently compensate by calling `refreshProjectStateFromBackend`, which fetches latest project state and applies it to the frontend store.
- Some backend routes do broadcast realtime project-state updates, but others do not, and some frontend flows already use explicit rehydration after successful mutations.

## Non-Goals
- Do not change production behavior just to make tests easier.
- Do not remove refresh calls blindly.
- Do not turn realtime tests into poll-and-refresh tests.

## Principles
1. Prefer pre-navigation seeding over post-load backend mutation.
2. Prefer production frontend actions over raw backend test helpers.
3. Realtime tests must validate realtime delivery, not manual recovery.
4. Keep explicit rehydration only for intentional out-of-band setup.

## Work Plan

### 1. Build an inventory
- Enumerate every `refreshProjectStateFromBackend` call site in `frontend/tests/e2e/`.
- Classify each use into one of:
  - backend seeding after page load
  - page reload recovery
  - expected realtime behavior
  - unclear / mixed
- Record, per call site, the nearby mutation path (`postBackend`, helper wrapper, UI interaction, or reload).

### 2. Identify the expected synchronization contract
- For each mutation route used by Playwright setup, decide whether the intended contract is:
  - frontend-local state update
  - explicit frontend rehydrate via `get_latest_project_state`
  - websocket `UpdateFrontendProjectState`
- Document this per route before changing tests.

### 3. Replace post-load seeding with pre-navigation setup
- For tests that only need initial project shape, create the required project state before opening the page.
- Prefer project fixtures, backend bootstrap setup, or temp-project creation before navigation.
- Remove post-load `postBackend(...)` plus `refreshProjectStateFromBackend(...)` pairs when the test does not need to observe the mutation live.

### 4. Replace raw backend mutations with production frontend paths
- For behavior tests, drive the UI when practical.
- If the test needs faster setup without full UI interaction, call the same frontend action the app uses from `page.evaluate(...)` instead of using raw `page.request.post(...)`.
- Use this for flows whose production contract already includes explicit rehydration after mutation.

### 5. Make realtime tests strict
- For tests whose purpose is to validate websocket-driven updates, remove manual refresh calls.
- Wait for the pushed UI update and fail if it never arrives.
- Add or tighten backend websocket coverage for the corresponding routes so missing broadcasts are caught below Playwright as well.

### 6. Narrow the helper surface
- Rename or wrap `refreshProjectStateFromBackend` so it reads as an exceptional test-only escape hatch rather than a general synchronization primitive.
- Add a short doc comment describing when it is allowed and when it is not.
- Centralize any remaining uses through a small number of explicit helpers.

### 7. Remove refreshes in priority order
1. Delete refreshes that follow setup which can move to pre-navigation seeding.
2. Replace refreshes that can move to production frontend actions.
3. Remove refreshes from realtime assertions and convert those tests to strict push-based checks.
4. Leave only the cases that are intentionally out-of-band and cannot be expressed better without distorting the test.

### 8. Add guardrails
- Add focused Playwright coverage for a few representative realtime routes that must update the page without manual refresh.
- Add backend tests for routes expected to emit `UpdateFrontendProjectState`.
- Add a review rule or lightweight check that flags new `postBackend(...); refreshProjectStateFromBackend(...)` patterns unless justified.

## Verification
- Run targeted Playwright specs for every converted cluster of tests.
- Run relevant Go websocket / route tests for any audited broadcast behavior.
- Confirm remaining helper uses are intentional and documented.

## Acceptance Criteria
- Most current refresh call sites are removed or converted to higher-fidelity setup.
- Remaining refresh uses are clearly deliberate out-of-band setup cases.
- Realtime Playwright tests rely on pushed project-state updates.
- Backend routes that are supposed to broadcast are covered by automated tests.
- The resulting test suite is easier to reason about: setup, frontend hydration, and realtime behavior are separated.

## Suggested Execution Order
1. Inventory and route-contract audit.
2. Convert pre-navigation seeding opportunities.
3. Convert production-action opportunities.
4. Tighten realtime tests and backend broadcast coverage.
5. Rename/narrow the helper and remove straggler uses.
