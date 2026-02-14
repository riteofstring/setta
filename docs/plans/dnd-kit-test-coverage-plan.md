# DnD Kit Test Coverage Expansion Plan

## Goal
Add broad, behavior-focused test coverage for section and param drag-and-drop flows powered by dnd-kit.

## Current Gaps
- Direct coverage for `frontend/src/forks/dnd-kit` is minimal (`useDropType` has a single unit test).
- Core adapter logic (`collisionCompare`, `sorting`, `rect`, `dragEventMapping`) is mostly untested.
- Child mapping state transitions (`dndChildren`, `paramDndChildren`, `paramDndState`) lack dedicated tests.
- Existing section DnD Playwright coverage relies heavily on backend move endpoints instead of real UI drag gestures.

## Scope
- In scope:
  - Unit tests for dnd-kit adapter utilities and dnd state helpers.
  - Integration tests that exercise multi-module dnd behavior through shared stores.
  - Playwright tests that perform real user drag gestures for section nesting/reordering.
- Out of scope:
  - Rewriting dnd architecture.
  - Non-dnd UI behavior.

## Test Matrix
1. Unit: adapter utility coverage
- `adapter/collisionCompare.ts`
  - best-collision selection, sortable prioritization, child-over-parent promotion, fallback resolution.
- `adapter/sorting.ts`
  - index math (`computeNewIndex`), sorting strategies, disabled normalization, result resolution.
- `adapter/rect.ts`
  - bounding rect conversion and object coercion guards.
- `adapter/dragEventMapping.ts`
  - start/move event mapping, active rect resolution order, collision promotion behavior.

2. Unit: dnd state/children coverage
- `dndChildren.ts`
  - add/remove/update child maps and temp placeholder replacement.
- `paramDndChildren.ts`
  - add/update temp replacement plus list-key parent/child remapping.
- `paramDndState.ts`
  - dnd id encode/decode + temp id semantics.
- `sortingOverState.ts`
  - set/get/clear/reset semantics.
- `useDropType.ts`
  - invalid/valid behavior drop conditions (frozen parent, code parent rules, descendant guard, root acceptance).

3. Integration: multi-store dnd interactions
- `adapter/dragEventMapping` + param dnd state/children
  - param collisions are promoted using list-key-aware parent/child mapping from shared stores.
- `useDropType` + `dndChildren`
  - over-id resolution uses live parent/child store mapping when collisions include parent + child candidates.

4. Playwright: real UI drag behavior
- Add a section DnD UI spec to validate:
  - drag top-level sections into Group containers (Alt drag gesture).
  - reorder nested children via drag.
  - drag nested child back to pane as top-level.
- Assert via backend project state polling (`parentSectionMap`, children order, top-level layout presence).

## Implementation Order
1. Add low-level unit tests for adapter and state helper modules.
2. Add integration tests for cross-module collision + over-id behavior.
3. Add Playwright UI drag tests for section nesting/reorder/detach.
4. Run targeted Vitest and Playwright suites and iterate until green.

## Verification Commands
- `pnpm -C frontend exec vitest run src/forks/dnd-kit/**/*.test.ts`
- `pnpm -C frontend exec vitest run src/forks/dnd-kit/**/*.integration.test.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/sections/section-children-dnd-ui.spec.ts`

## Acceptance Criteria
- New tests cover major dnd-kit section/param decision paths and helper logic.
- UI drag behavior is validated through real pointer interactions (not backend-only moves).
- New tests pass in targeted runs.
