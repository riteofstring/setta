# Backend Correctness Hardening Plan

## Purpose

Shift this branch from backend optimization-first to correctness-first by:

1. Systematically analyzing backend architecture for correctness issues.
2. Building realistic tests that reproduce production behavior.
3. Applying principled fixes at architectural seams, not one-off scenario patches.

## Scope

- `backend/setta/project_state/**`
- Backend route handlers and mutation flows.
- History/undo/redo architecture.
- Patch transport and websocket/state synchronization semantics.
- Deferred/background refresh paths.
- Persistence/autosave/revision interactions.
- Existing backend tests in `tests/**` and new coverage needed for correctness.

## Non-Goals

- New optimization work not directly required for correctness.
- Frontend redesign or non-correctness UX changes.
- Test-only production behavior changes.

## Working Principles

1. Canonical source of truth first: backend canonical state defines correctness.
2. Invariant-driven: changes must preserve explicit state and protocol invariants.
3. Realistic tests: prefer real fixtures and real manager flows; avoid mock/fake/dummy classes.
4. Deterministic behavior: no correctness depending on timing races or heuristic matching.
5. No silent fallback heuristics for correctness gaps; either implement robustly or fail clearly.
6. Fix root causes in shared architecture paths, not route-specific patchwork.

## Correctness Invariant Model

Define and enforce these invariants before broad fix work:

1. Revision monotonicity:
   - Every material backend mutation increments revision exactly once.
   - Broadcast revision windows must match actual mutation boundaries.
2. History determinism:
   - Undo/redo replay is deterministic for all mutation sequences.
   - Replaying a history entry applies the complete mutation scope that entry represents.
3. Transport consistency:
   - Targeted patch transport and full snapshot transport produce equivalent frontend state.
   - Out-of-order or stale revisions force deterministic resync behavior.
4. Deferred convergence:
   - Stage-A + deferred stage-B paths converge to the same canonical final state as fully synchronous execution.
5. Referential integrity:
   - Section/code-obj/variant/impl references remain valid after all structural mutations and history replay.
6. Persistence consistency:
   - Autosave/manual save snapshots are internally consistent with revisioned state and history boundaries.

## Workstream 1: Architecture Correctness Analysis

### 1.1 Build Mutation Surface Map

Inventory all mutation entry points and classify by:

- Structural mutations.
- Data/config-only mutations.
- UI-only metadata mutations.
- Deferred/background mutations.
- History-affecting vs non-history-affecting paths.

Deliverable:
- A mutation map document (route -> mutator -> history impact -> broadcast path -> deferred follow-ups).

### 1.2 Audit Critical State Transitions

Perform code-level audit for:

- History entry creation, merge, and replay metadata.
- Dirty revision registration paths.
- Patch scope registration and any bypass paths.
- Background task mutations that can run after initial route completion.
- Queue partitioning/ordering assumptions and cross-partition effects.

Deliverable:
- Issue register with invariant violations and concrete reproduction paths.

### 1.3 Runtime Trace and Log Analysis

Use `backend.log` + `frontend.log` and targeted debug traces to identify:

- Divergence between expected vs actual undo/redo states.
- Revision or patch scope mismatches.
- Missing or duplicated patch emissions during mixed undo/redo + deferred activity.

Deliverable:
- Repro matrix linking each issue to exact operation sequence and observed divergence.

## Workstream 2: Realistic Test Program

### 2.1 Test Design Rules

1. Use real settings/project-manager fixtures and real project-state structures.
2. Do not use mock/fake/dummy classes for core state transitions.
3. Tests must not depend on existing `setta_files`; use temporary directories.
4. Any git write/history command must run only in disposable temporary repos.
5. Skips must be narrow and documented; avoid broad environment-skip wrappers.

### 2.2 Coverage Buckets

1. Deterministic replay tests:
   - Long mixed sequences of edits, deferred tasks, undo, redo, and repeated replay loops.
2. Invariant tests:
   - Revision monotonicity, referential integrity, and transport equivalence checks.
3. Regression replay tests:
   - Encode real bug traces from logs into executable tests.
4. Stress/state-machine tests:
   - Seeded operation generators over realistic mutation APIs with final-state assertions.
5. Transport correctness tests:
   - Validate targeted patch streams converge to same state as snapshot baseline.

### 2.3 Required Initial Test Additions

1. Undo/redo architecture tests for deferred mutation scopes beyond a single route.
2. Callable + codegen prefix/suffix + refetch mixed-sequence tests with repeated replay loops.
3. Dirty-revision and in-place metadata mutation replay tests.
4. Cross-route interaction tests (layout/meta + structural + callable edits + undo/redo).

## Workstream 3: Principled Fix Workflow

For each discovered issue:

1. Capture failing invariant and minimal repro.
2. Add/extend failing test first where feasible.
3. Implement architecture-level fix at shared mutation/history/transport boundary.
4. Re-run focused + broad backend suites.
5. Add regression test linked to issue.
6. Document behavior contract in code comments where subtle.

Fix acceptance checklist:

1. Root cause addressed (not only symptom path).
2. New/updated tests fail before and pass after.
3. No new heuristic fallback for correctness.
4. No regression in existing undo/redo, deferred refresh, or transport semantics.

## Execution Phases

### Phase 0: Baseline and Guardrails

1. Write invariant model doc and mutation surface map.
2. Set required correctness gate commands.
3. Freeze additional optimization work until Phase 1-2 baseline is green.

### Phase 1: Discovery

1. Complete architecture audit + log-driven issue register.
2. Prioritize issues by user-visible data loss/divergence risk.

### Phase 2: Reproduction and Tests

1. Land realistic failing tests for top-priority issues.
2. Build mixed-sequence replay test suite for history/deferred/transport interactions.

### Phase 3: Fixes

1. Land principled fixes in prioritized order.
2. Keep each fix coupled with regression coverage.

### Phase 4: Stabilization

1. Run broad backend suites repeatedly.
2. Burn down flaky/non-deterministic behavior.
3. Validate no unresolved high-severity correctness issues remain in issue register.

## Verification Gates

Run with activated env for Python tooling:

```bash
source activate.sh && pytest tests/project_state -q
source activate.sh && ./scripts/run_backend_tests.sh
```

For each issue fix, run focused reproducer tests first, then full backend suite.

## Success Criteria

1. All high-severity correctness issues in the register have reproducible tests and merged fixes.
2. Undo/redo replay remains deterministic across long mixed-operation sequences.
3. Deferred/background mutation paths converge without state drift.
4. Patch transport and snapshot transport are behaviorally equivalent in tested flows.
5. Backend correctness suite is consistently green before optimization work resumes.
