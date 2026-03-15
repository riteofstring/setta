# Shared Section-Shell S2 Checkpoint 6 Rerun 2

Date: 2026-03-17
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Re-run `Phase S2` checkpoint 6 after removing the extra per-`GetParamSwitch` nested-parent store selector so the row-tree handoff above the row-only `ParamContainer` can be judged on the locked `S0 Dict` filter path without the earlier target-renderer regression.

## Scope

Updated `frontend/src/components/Params/getFilteredRenderableParamIds.ts`:

- added a path-derived `nestedParentParamIdLookup`
- kept the existing `visibleParamIdLookup` filter model intact

Updated `frontend/src/components/Params/getParamDndListRenderModel.ts`:

- threaded `nestedParentParamIdLookup` through the shared list render model beside `visibleParamIdLookup`

Updated `frontend/src/components/Params/ParamDndList.tsx`:

- passed the path-derived parent lookup into the recursive row-switch path

Updated `frontend/src/components/Params/GetParamSwitch.tsx`:

- removed the extra `useProjectState(...)` nested-parent selector loop
- used the path-derived parent lookup to decide when `requiredParamIdsToPaths` and `visibleParamIdLookup` should continue into child recursion

Updated `frontend/src/components/Params/ParamSwitch.tsx`:

- threaded the path-derived parent lookup only through the nested-parent recursion path
- kept the row-only `ParamContainer` boundary from checkpoint 5 intact

Updated tests:

- `frontend/src/components/Params/getParamDndListRenderModel.test.ts`
- retained the focused row/list/shared-shell gate from the earlier checkpoint-6 attempt

Why this rerun still belongs to `Phase S2`:

- it stays inside the shared row/list ownership split
- it does not reopen the wrapper-only shell work from `Phase S1`
- it specifically targets the renderer cost introduced by the earlier checkpoint-6 candidate without undoing the accepted row-only `ParamContainer` split

## DOM Read

Representative scenes used for the acceptance rerun:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`
- representative section:
  - `S0 Dict`

Both branches replayed the same touched filter interaction:

- start on `delta`
- replace the filter with `gamma`
- wait for the visible row set to settle

The rerun preserved the same filtered visual shape as the earlier checkpoint-6 candidate:

- both branches settled on the single visible `gamma` row
- the filter value was `gamma` on both branches after the replay
- the checkpoint-6 fix changes selector work, not DOM shape, so the flatter worktree representative subtree from the earlier checkpoint-6 read is still the relevant structural baseline:
  - `main`: `68` nodes, max depth `9`
  - worktree: `58` nodes, max depth `7`

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Params/ParamRowShell.test.tsx src/components/Params/getFilteredRenderableParamIds.test.ts src/components/Params/getParamDndListRenderModel.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `7` files passed, `32` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
- result: `19 passed`

Why these gates were kept:

- direct row/list helper coverage for the new parent-lookup path
- retained the row-only `ParamContainer`, shared-shell, and nested-row/browser regressions already carrying the representative area

## CDP Visual Verification

Chrome DevTools was used to compare the locked `S0 Dict` scene on both branches on both:

- the `delta` pre-trace state
- the settled `gamma` post-trace state

Visual read:

- the filter field, arg toolbar, pinned area, and visible `gamma` row remained aligned between untouched `main` and the worktree
- the path-derived parent lookup did not introduce row-spacing drift or nested-row presentation changes
- the worktree kept the flatter representative DOM while preserving the same visible filtered result

## Chrome DevTools Filter Trace

Chrome DevTools `Performance` traces were recorded for the directly touched `S0 Dict` filter interaction:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/worktree-s0-dict-filter-gamma-trace.json`

Chrome DevTools screenshot pairs:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/main-s0-dict-delta.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/worktree-s0-dict-delta.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/main-s0-dict-gamma.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/worktree-s0-dict-gamma.png`

Both runs replayed the same matched filter sequence on the representative `S0 Dict` scene:

- start on `delta`
- replace the filter with `gamma`
- wait for the visible row set to settle

The event totals below were read from the target page renderer process identified by each trace's `TracingStartedInBrowser` metadata, matching the robust method used in the rejected checkpoint-6 report.

Target-renderer DevTools event totals from the rerun pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | 996.166 | 38.788 | 6.610 | 4.009 | 1109.632 | 2248.554 | 142.815 | 5.996 | 5.653 |
| worktree | 1166.831 | 36.619 | 5.515 | 3.679 | 1291.994 | 2136.752 | 278.399 | 6.341 | 8.118 |

DevTools summary:

- `main` INP: `204ms`
- worktree INP: `190ms`
- `CLS 0.00` on both traces

Comparison with the rejected checkpoint-6 attempt:

- worktree `FunctionCall`: `1450.094ms -> 1166.831ms`
- worktree `RunTask`: `1795.674ms -> 1291.994ms`
- worktree `Commit`: `30.717ms -> 8.118ms`
- worktree INP: `206ms -> 190ms`

Interpretation:

- the earlier checkpoint-6 regression is no longer present
- compared with untouched `main`, this rerun is mixed rather than a clean sweep:
  - worktree wins on:
    - `INP`
    - `UpdateLayoutTree`
    - `Layout`
    - `Paint`
    - `EventDispatch`
  - worktree remains higher on:
    - `FunctionCall`
    - `RunTask`
    - `TimerFire`
    - `Commit`
- inference from the trace pair:
  - the removed `GetParamSwitch` nested-parent selector was the main reason the previous checkpoint-6 attempt became an obvious target-renderer regression
  - the residual scripting overhead is still worth watching, but the rerun no longer justifies rejecting the checkpoint on performance grounds

## Conclusion

- `Phase S2` remains active.
- Checkpoint 6 is accepted on this rerun.
- The row-tree ownership contract stays simpler than untouched `main`, visual parity holds on the representative control, and the directly touched filter path no longer repeats the earlier rejected renderer regression.
- The next step should be a fresh `Phase S2` structural read before deciding whether another row-tree pass is justified or whether the next serious work belongs to `Phase S3`.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/worktree-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/main-s0-dict-delta.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/worktree-s0-dict-delta.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/main-s0-dict-gamma.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6-rerun2/worktree-s0-dict-gamma.png`
