# Backend Correctness Hardening Plan (Post-Optimization)

## Purpose

Shift this branch from backend performance work to backend correctness work by:

1. Systematically finding correctness issues in the backend architecture.
2. Writing realistic tests that reproduce those issues.
3. Applying principled fixes with strong regression coverage.

## Context

Recent optimization work changed important behavior across write paths, transport,
and refresh timing (for example revisioned patch transport and deferred refresh).
Those changes can preserve performance while still introducing subtle correctness
problems (state divergence, stale convergence, ordering bugs, undo/persist drift).

## Goals

1. Build a concrete, prioritized backlog of backend correctness defects.
2. Ensure every defect is reproducible with a realistic automated test.
3. Land deterministic fixes in canonical backend layers (no heuristics).
4. Raise confidence by requiring targeted and full backend test gates.

## Non-Goals

- New performance features or speculative optimizations.
- Frontend redesign work.
- Backward-compatibility shims for behavior we now consider incorrect.

## Correctness Principles

1. Single source of truth: fix the canonical backend state path, not symptoms.
2. Deterministic ordering: state, revisions, and broadcasts must be coherent.
3. Test-first for defects: failing test first, then fix, then regression gate.
4. Realistic execution: use real managers/state flows and temp directories.
5. No heuristic fallback by default: if robust handling is unavailable, document
   options and tradeoffs explicitly before implementation.

## Risk Map (Where To Look First)

| Area | Likely Failure Modes | Primary Targets |
| --- | --- | --- |
| Write commit + deferred refresh | Stage-A commit diverges from stage-B refreshed state; stale generated artifacts/diagnostics | `backend/setta/project_state`, `backend/setta/routers`, `backend/setta/listeners` |
| Revisioned websocket transport | Out-of-order patch apply, replay/dup handling, bad resync behavior | `backend/setta/websockets`, `backend/setta/types/websocket.py` |
| History/undo + save/load | Undo drift, save snapshot inconsistency, load mismatch | `backend/setta/project_state/history.py`, `backend/setta/project_state/jsonSource` |
| Queueing/serialization semantics | Lost update, cross-config interference, ordering races | `backend/setta/project_state/*manager*`, `backend/setta/server_state.py`, route handlers |
| Broadcast suppression/caching | Legitimate state changes skipped from broadcasts | `backend/setta/listeners`, validation broadcast paths in `backend/setta/project_state` |
| Type/shape assumptions | Wrong impl type at runtime causing silent corruption or wrong mutation | state accessors and type-guarded getters in `backend/setta/project_state` |

## Phase 0: Baseline + Invariant Catalog

1. Run backend suite and capture failing/fragile areas as baseline.
2. Document core invariants for optimized paths:
   - revision monotonicity and resync rules
   - eventual convergence after deferred refresh
   - undo/redo reversibility
   - save/load round-trip identity for canonical state
   - deterministic ordering for conflicting writes
3. Build route-to-mutation-to-broadcast-to-persist map for high-risk endpoints.

Exit criteria:
- Baseline results recorded.
- Invariant list exists and is reviewable.
- High-risk routes are explicitly mapped.

## Phase 1: Correctness Investigation (Architecture + Runtime)

1. Review high-risk backend modules for invariant violations and unsafe ordering.
2. Validate behavior under realistic scenarios:
   - rapid write bursts to same config
   - overlapping writes across different configs
   - reconnect/resync after missed websocket revisions
   - undo/redo during deferred refresh windows
   - save/load while queued writes are in flight
3. Create a prioritized defect list with severity (`P0`/`P1`/`P2`) and reproducible
   steps.

Exit criteria:
- Prioritized defect backlog exists with reproducible scenarios.
- At least one automated test target identified per defect.

## Phase 2: Realistic Test Buildout (Before Fixes)

For each defect, add a failing test that matches production behavior:

1. Unit-level invariants for pure state transitions where applicable.
2. Integration tests using real project manager fixtures and temp directories.
3. Protocol tests for websocket patch ordering, replay, and resync.
4. Persistence tests for save/load/undo identity and crash-adjacent boundaries.
5. Concurrency tests for queue ordering and write serialization semantics.

Constraints:
- No mock/fake/dummy classes or cast tricks.
- No reliance on existing `setta_files`.
- Any git write/history command in tests must run in disposable temp repos only.

Exit criteria:
- Every tracked defect has a failing automated test.
- Tests are deterministic and commented with the expected invariant.

## Phase 3: Principled Fixes (Defect Loop)

For each defect:

1. Confirm failing test reproduces the issue.
2. Implement a minimal, principled fix in canonical backend logic.
3. Avoid heuristic keyword checks or silent fallback behavior.
4. Re-run defect-specific tests, then relevant package-level tests.
5. Ensure no behavior regression in related invariants.

Exit criteria:
- Defect test passes because of the fix.
- Related invariants remain green.
- No unresolved `P0`/`P1` correctness defect remains in scope.

## Phase 4: Regression Hardening

1. Expand coverage around fixed defect classes to prevent near-neighbor regressions.
2. Add stress cases for large state and burst writes where correctness can degrade.
3. Re-run full backend suite to validate branch-level stability.

Exit criteria:
- Full backend suite passes.
- New tests cover each fixed defect class and at least one adjacent case.

## Phase 5: Completion Review

1. Produce a short findings/fixes summary:
   - defect
   - impacted invariant
   - test(s) added
   - fix location
2. Confirm that correctness work can continue without reopening known defects.

Exit criteria:
- Findings/fixes summary complete.
- Definition of done satisfied.

## Test Matrix (Minimum Coverage)

| Category | What Must Be Proven | Suggested Test Areas |
| --- | --- | --- |
| State invariants | Canonical state remains valid after each write path | `tests/project_state`, `tests/server_state` |
| Route semantics | API responses and state mutations are coherent | `tests/routers`, `tests/api` |
| Websocket correctness | Patch ordering, replay handling, resync behavior | `tests/websockets`, `tests/listeners` |
| Undo/history correctness | Reversibility and ordering under realistic edits | `tests/project_state/history*` |
| Save/load durability | Round-trip correctness and consistency during writes | `tests/project_state/jsonSource` |
| Queue/concurrency | Deterministic ordering and no lost updates | `tests/project_state`, `tests/server_state` |

## Commands (Operational Cadence)

```bash
# Backend full gate (required at baseline and completion)
source activate.sh && ./scripts/run_backend_tests.sh

# Focused correctness runs while iterating
source activate.sh && pytest tests/project_state tests/websockets tests/routers tests/server_state
```

## Definition Of Done

1. High-risk backend architecture areas have been audited against explicit
   invariants.
2. Each identified correctness issue has a realistic reproducer test.
3. Each fix is principled, deterministic, and validated by automated tests.
4. Full backend suite passes after fixes.
5. No unresolved in-scope `P0`/`P1` correctness issues remain.
