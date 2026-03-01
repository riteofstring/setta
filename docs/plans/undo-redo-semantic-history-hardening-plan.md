# Undo/Redo Semantic History Hardening Plan

## Purpose

Fix persistent undo/redo correctness failures by hardening the architecture that
creates history entries, not by patching individual routes.

This plan targets the full bug class:

1. Invisible/no-op history entries that consume undo/redo steps.
2. Duplicate frontend writes creating duplicate backend history commits.
3. One user intent being split into multiple unrelated history entries.
4. Undo/redo replay missing expected state (for example callable selection).

## Why This Is A Systemic Issue

Recent logs show the issue is not isolated to `setCallable`:

- `frontend.log` shows duplicate callable submits for the same Enter action
  (`SectionSearch.onEnter` and `setCallable.request` appear twice in sequence).
- `backend.log` shows two `set_callable` handlers for the same payload; the
  second path reports `project_code.set_callable skip already selected`.
- `set_gen_code_prefix` is called repeatedly during typing (`i`, `imp`, ...,
  `import math`), each call broadcasting project-config patch revisions.
- Undo/redo handlers repeatedly return 200 while some handlers complete with no
  meaningful state change.

This pattern indicates architectural gaps in history commit semantics:

- history entries are created before proving mutation changed canonical state;
- duplicate writes are not idempotently collapsed at the semantic operation layer;
- frontend intent boundaries are inconsistent across routes/components.

## Non-Goals

- Reverting backend performance optimizations (patch transport, deferred refresh,
  queue coalescing).
- Route-specific bandages that only fix `setCallable`.
- Heuristic keyword-based dedupe.

## Correctness Invariants (Must Hold For Every Write Route)

1. A history entry is committed only if canonical state changed.
2. Repeating the same semantic operation (same op id + payload) is idempotent.
3. Undo/redo steps correspond to user-visible semantic actions.
4. Undo then redo is a deterministic round-trip for scoped state.
5. Deferred/background refresh work never creates user-visible undo slots.

## Architecture Changes

## 1) Introduce A Canonical History Mutation Transaction

Add a shared mutation transaction API in backend manager/history layers:

- `begin_history_transaction(...)`
- mutate candidate state
- `commit_if_changed(...)`

Rules:

- No direct route calls to `add_new_history_entry` without this transaction path.
- Change detection is scoped and deterministic (project-config/section/code-obj
  scope already exists; reuse that metadata instead of heuristic diffs).
- If no effective state change: discard transaction, no new entry token.

Outcome:

- Duplicate/no-op writes stop consuming undo/redo slots globally.

## 2) Add Semantic Idempotency At Operation Layer

Use `frontendOpId` as canonical idempotency key for all mutating routes:

- Require/populate `frontendOpId` for routes currently missing it (notably
  callable submit path).
- Cache recent successful operation ids per project-config and short time window.
- If duplicate op id + semantically equivalent payload arrives:
  - return prior result shape,
  - do not add history entry,
  - do not rebroadcast redundant patches.

Outcome:

- Re-entrancy and double-submit become harmless.

## 3) Normalize Frontend Intent Boundaries

Frontend must route mutating actions through a consistent operation dispatcher
that always creates `frontendOpId` and defines commit mode:

- `onCommit` actions (Enter/blur/explicit apply)
- debounced text updates (coalesced into a single semantic intent window)
- continuous drag/viewport updates (already coalesced)

For callable search specifically:

- dedupe same-value Enter submits while a matching request is in-flight;
- prevent duplicate key handler execution from creating duplicate requests.

Outcome:

- One user intent maps to one semantic operation contract.

## 4) Preserve Existing Optimizations

Keep:

- targeted patch transport,
- deferred refresh scheduling,
- queue coalescing for high-frequency routes.

Hardening requirement:

- correctness changes cannot regress patch scope/transport strategy.
- add regression checks asserting optimized patch paths remain in use.

## Debug Instrumentation Plan

Current logs were useful but insufficient to fully explain history-token motion.
Add structured logs behind debug flag:

1. `history_transaction.start|commit|discard`
   - route, frontendOpId, coalesce key, scope, pre/post token, pre/post revision.
2. `history_noop_discard`
   - why discarded (duplicate op id, unchanged canonical state).
3. `operation_idempotency.hit`
   - op id, route, payload fingerprint.
4. `undo_redo.navigation`
   - requested steps, traversed entry tokens, resulting token/revision.
5. Frontend action source logs
   - event origin (`keydown`, `blur`, `debounce flush`), op id, payload.
6. Extend endpoint debug list to include `/setParamEnteredValue`.

Additional logs/files that help immediately for this issue:

- `frontend.log` with code-update + keymap debug enabled (`code-updates-debug`,
  `codemirror-keymap-debug`).
- `backend.log` with the transaction/idempotency events above.
- websocket patch emission log slice (revisions + completed op ids) during the
  same run.

## Test Plan (Extensive, Multi-Layer)

## A) Backend Unit Tests

Add/extend tests for history primitives and transaction semantics:

- `tests/project_state/test_history_coalescing.py`
  - unchanged mutation does not create entry token.
  - coalesced transaction with unchanged final state does not advance undo depth.
- new `tests/project_state/test_history_transactions.py`
  - `commit_if_changed` commit/discard behavior.
  - duplicate operation id idempotency behavior.
  - invariant: no-op transaction keeps undo/redo boundaries unchanged.

## B) Backend Integration Tests (Real Manager, No Mocks)

Add/extend manager-level tests covering realistic route sequences:

- new `tests/project_state/test_undo_redo_semantic_intents.py`
  - exact repro class:
    - set gen prefix to `import math`
    - create callable section
    - set callable `math.sqrt`
    - set param `123`
    - assert expected undo count and redo round-trip states.
  - duplicate submit of same callable/op id does not add history entry.
  - duplicate submit with different op id but unchanged canonical state still
    does not add history entry.
  - deferred callable auto-refetch path does not consume undo slots.
- extend `tests/project_state/test_set_callable_undo_redo_stress.py`
  - assert semantic-state checkpoints, not only “does not raise”.
- extend `tests/project_state/test_gen_code_prefix_suffix_deferred_refresh.py`
  - assert text-edit coalescing preserves semantic undo boundaries.

## C) Frontend Unit/Integration Tests (Vitest)

Add/extend frontend state/action tests:

- `frontend/src/state/actions/undo.test.ts`
  - queue behavior with in-flight duplicate/no-op backend responses.
  - verify no phantom step inflation from repeated keypress events.
- new `frontend/src/components/Section/SectionParts/Search.test.tsx`
  - Enter key should emit one semantic callable submit for one intent.
  - same callable submit while in-flight is deduped.
- new `frontend/src/state/actions/codeUpdates.undoHistory.test.ts`
  - debounced gen-prefix edits map to expected semantic commit boundaries.

## D) Playwright End-to-End Tests

Add/extend E2E to validate user-visible behavior and regression-proof the bug
class:

- extend `frontend/tests/e2e/sections/section-undo-redo.spec.ts`
  - include the exact user scenario from this report.
  - verify:
    - expected undo count to revert callable/param/prefix edits,
    - redo returns to `math.sqrt` + `123`,
    - no extra “no visible effect” undo slots.
  - include duplicate Enter stress to ensure idempotent behavior.
- add cross-route semantic history flow:
  - mixed prefix edit + callable set + param edit + undo/redo + refresh/reload.

Assertions should validate both UI state and backend state snapshot.

## Execution Phases

1. Instrumentation + trace capture for current failure.
2. Implement history transaction API + no-op commit discard.
3. Implement operation idempotency by `frontendOpId`.
4. Align frontend callable and text-edit mutation dispatch to semantic op model.
5. Land backend unit/integration tests.
6. Land frontend Vitest and Playwright coverage.
7. Run full verification gates.

## Verification Gates

```bash
source activate.sh && ./scripts/run_backend_tests.sh
pnpm -C frontend exec vitest run frontend/src/state/actions/undo.test.ts frontend/src/components/Section/SectionParts/Search.test.tsx
./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-undo-redo.spec.ts
pnpm -C frontend gcf
```

## Definition Of Done

1. No-op/duplicate writes no longer create undo/redo history entries.
2. Reported repro scenario passes deterministically in Playwright.
3. Backend integration tests enforce semantic undo/redo boundaries across route
   families (not only callable).
4. Frontend unit/integration tests enforce single-intent submit semantics.
5. Existing performance optimizations remain active and covered by regression
   assertions.
