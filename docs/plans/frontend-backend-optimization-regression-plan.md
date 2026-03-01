# Frontend Compatibility Plan For Backend Performance Optimizations

## Purpose

Ensure frontend behavior remains correct while backend performance work continues
on patch transport, deferred refresh, scoped history/state mutation, and related
write-path changes, and require full backend + frontend suites to pass before
any additional optimization work proceeds.

## Context

Recent backend optimizations changed how state updates reach the frontend:

- More routes now emit revisioned patch messages instead of full snapshots.
- More write paths ACK in stage-A and defer heavy refresh work to stage-B.
- Some broadcasts are now gated when content is unchanged.
- History/state-copy behavior has been tightened for specific mutation scopes.

These shifts can introduce frontend regressions even when backend tests pass.

## Goals

1. Catch frontend correctness regressions quickly after backend optimization commits.
2. Verify websocket patch/revision handling remains deterministic.
3. Confirm critical user workflows still work end-to-end.
4. Require full backend and full frontend suites to pass before optimization resumes.
5. Establish a repeatable gate we can run before each optimization tranche.

## Non-Goals

- New backend performance changes.
- Frontend redesign or feature expansion.
- Replacing existing full frontend test coverage with a smaller subset.

## Success Criteria

1. No regression in project-state synchronization for supported patch types.
2. No stale UI after deferred stage-B refresh completion.
3. No regressions in undo/redo, watch-code, format-code, section/param editing, or view-mode flows.
4. Full backend suite passes on the current branch before continuing optimization work.
5. Full frontend suite passes on the current branch before continuing optimization work.
6. A stable command sequence exists for quick, medium, and full confidence levels.

## Risk Matrix

| Risk Area | Failure Mode | Verification |
| --- | --- | --- |
| Patch revision handling | Patch dropped/applied out of order, bad fallback behavior | `websocketReceive` unit tests + targeted E2E |
| Deferred refresh behavior | UI remains stale after stage-A ACK | watch-code/format-code/params E2E flows |
| Broadcast gating | frontend misses meaningful updates when backend suppresses unchanged payloads | name-validation + section/param state tests |
| History/undo interactions | undo/redo drift after scoped history changes | undo unit tests + workflow E2E |
| Structural patch conversion | section tree/layout inconsistency | section move/children/view-mode E2E |

## Verification Phases

## Phase 0: Full-Suite Unblock Gate (mandatory before more optimization)

Optimization work is paused until both suites pass on the current branch.

```bash
source activate.sh && ./scripts/run_backend_tests.sh
./t.sh --f
```

Exit condition:
- Backend pytest suite passes.
- Frontend Vitest + Playwright suite passes.
- If either fails, fix regressions first, then re-run Phase 0.

## Phase 1: Fast Protocol Gate (per optimization commit)

Run focused frontend unit tests for websocket patch handling and core state actions.

```bash
pnpm -C frontend exec vitest run \
  src/state/actions/websocketReceive.test.ts \
  src/state/actions/sectionInfos.test.ts \
  src/state/actions/formatCode.test.ts \
  src/state/actions/undo.test.ts \
  src/state/actions/viewModes.test.ts \
  src/state/actions/sections/moveSections.test.ts \
  src/state/actions/sections/createSections.test.ts
```

Exit condition:
- All tests pass with no new failures.

## Phase 2: Critical Workflow E2E Gate (daily or before batching backend changes)

Run high-value Playwright specs covering routes heavily touched by backend optimizations.

```bash
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts \
  frontend/tests/e2e/params/callable-params.spec.ts \
  frontend/tests/e2e/params/dict-kwargs.spec.ts \
  frontend/tests/e2e/editor/format-code.spec.ts \
  frontend/tests/e2e/sections/section-children-dnd.spec.ts \
  frontend/tests/e2e/settings/view-mode-url-sync.spec.ts
```

Exit condition:
- All selected specs pass.
- No new intermittent websocket sync issues observed in retries.

## Phase 3: Full Frontend Regression Gate (pre-merge / pre-release)

Run the full frontend+Playwright suite.

```bash
./t.sh --f
```

Exit condition:
- Full frontend gate passes.

## Phase 4: Compatibility Hardening Additions

Add or extend tests where coverage is currently thin for optimization-sensitive behavior:

1. `websocketReceive.test.ts`: mixed patch-type ordering and rapid multi-message bursts.
2. `websocketReceive.test.ts`: duplicate/replayed patch message behavior across revisions.
3. New E2E: undo/redo after deferred-refresh routes that now ACK early.
4. New E2E: watch-code structural update flow validating eventual stage-B convergence.
5. New E2E: name-validation panel behavior under unchanged-broadcast suppression.

Exit condition:
- New tests exist and pass in CI.

## Phase 5: Triage And Rollback Rules

When regressions appear:

1. Classify failure: protocol ordering, stale convergence, or workflow-specific.
2. Reproduce with Phase 1 tests first, then Phase 2 E2E.
3. If correctness is broken and not immediately fixable, temporarily route affected backend path to previous safe transport/refresh behavior, then re-run gates.

## Operating Cadence

1. Before any new optimization work: run Phase 0 and require green.
2. After each backend optimization commit: run Phase 1.
3. At least daily while optimization work is active: run Phase 2.
4. Before merge/release cut: run Phase 3.
5. During this cycle: land Phase 4 additions to reduce future risk.

## Definition Of Done

This plan is considered complete when:

1. Phase 0 is integrated as a hard prerequisite for further optimization work.
2. Phases 1-3 are integrated into team workflow/CI and passing.
3. Phase 4 coverage additions are implemented.
4. Frontend regression rate from backend optimization changes is reduced to near-zero in subsequent tranches.
