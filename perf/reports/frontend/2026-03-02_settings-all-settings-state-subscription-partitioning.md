# Settings All Settings State Subscription Partitioning

Date: 2026-03-02
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 54275c31 (with local changes during experiment)
Experimented code paths (reverted):
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`

Implementation status: **Not kept** (experiment reverted; report retained for decision history).

## Goal

Reduce non-pan interaction cost by narrowing param-tree store subscriptions and reducing broad selector work during typing/selection in `All Settings`.

## Change Summary (Experiment)

- Partitioned mixed selectors in param row rendering components.
- Moved heavy duplicate-index/tree derivation in `ParamDndList` out of `useProjectState` selectors into memoized computation tied to selected store refs.
- Split mixed row selectors in `ParamSwitch` and `ParamContainer` into narrower subscriptions.

## Measurement Setup

- Playwright harness:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- CDP scripted interaction:
  - Typing into visible section-level `Filter` inputs and clicking visible param rows.
  - Trace files:
    - `perf/artifacts/frontend/2026-03-02_phase05b_subscription-partitioning_before.trace.json`
    - `perf/artifacts/frontend/2026-03-02_phase05b_subscription-partitioning_after.trace.json`

## Baseline Reference

- Existing baseline report:
  - `perf/reports/frontend/2026-03-02_settings-all-settings-performance-baseline.md`
- Baseline typing metric:
  - `typing.avgFrameMs = 164.91`

## After (Playwright Harness Samples)

- Run A: `typing.avgFrameMs = 195.48`
- Run B: `typing.avgFrameMs = 193.38`
- Run C: `typing.avgFrameMs = 184.10`
- Run D: `typing.avgFrameMs = 168.08`
- Run E: `typing.avgFrameMs = 186.72`

Computed summary:
- Median: `186.72`
- Best: `168.08`
- Worst: `195.48`

## CDP Scripted Interaction Sample

- Before:
  - Typing avg: `508.79ms` (18 samples)
  - Row-click avg: `156.24ms` (20 samples)
- After:
  - Typing avg: `518.94ms` (18 samples)
  - Row-click avg: `209.18ms` (20 samples)

## Conclusion

- This subscription-partitioning pass was **not kept**.
- Measured outcomes were not favorable in this setup:
  - Playwright typing median worsened versus baseline (`186.72` vs `164.91`).
  - CDP scripted interaction did not improve.
- Decision:
  - Revert this implementation.
  - Keep report artifacts and measurements as decision history.
  - Continue Phase 0.5 with alternative strategies (next: lazy overlay mounting and/or different subscription boundaries).

## Verification

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx`
- Multiple Playwright baseline harness reruns (values listed above).
- CDP performance traces captured before/after (paths above).
