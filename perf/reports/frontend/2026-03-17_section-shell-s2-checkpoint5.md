# Shared Section-Shell S2 Checkpoint 5

Date: 2026-03-17
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Continue `Phase S2` by moving the recursive child handoff out of `ParamContainer` so it only owns the row boundary it actually renders, then narrow the `ParamContainer` memo boundary to avoid deep row-subtree comparison work on the touched filter path.

## Scope

Updated `frontend/src/components/Params/ParamContainer.tsx`:

- removed recursive child ownership from `ParamContainer`
- dropped forwarded row-tree props it did not use directly
- added a targeted `areParamContainerPropsEqual` comparator so the row boundary no longer deep-compares the forwarded child element

Updated `frontend/src/components/Params/ParamSwitch.tsx`:

- moved `useParamDndChildrenForParent(...)` into `RealParamSwitch`
- made `RealParamSwitch` own the recursive `<GetParamSwitch />` handoff for child rows
- kept the accepted shared `ParamRowShell` path intact for both real and temp rows

Added `frontend/src/components/Params/ParamContainer.test.tsx`:

- asserted `ParamContainer` now stays a single row/article boundary when rendered directly
- guarded against re-introducing nested recursion into the row-only component

Why this checkpoint belongs to `Phase S2`:

- it deepens the shared row/tree architecture instead of removing a decorative wrapper
- it moves recursion ownership upward to the existing row-switch boundary instead of leaving it one layer deeper
- it narrows the `ParamContainer` interface by removing large recursive props that were only being forwarded

## DOM Read

Locked scenes:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- representative section:
  - `S0 Dict`

For this checkpoint, both branches replayed the same touched filter interaction on the locked `S0 Dict` scene:

- start on `delta`
- replace the filter with `gamma`
- wait for the visible row set to settle

Live DOM audit on the settled `gamma` state, using the same section-root read on both branches:

| Branch | Nodes | Max depth | Visible rows | Filter value |
| --- | ---: | ---: | --- | --- |
| `main` | 68 | 9 | `["gamma"]` | `gamma` |
| worktree | 58 | 7 | `["gamma"]` | `gamma` |

Key read:

- the worktree keeps a flatter locked `S0 Dict` subtree after the row-only `ParamContainer` split
- both branches converge to the same visible filtered result on the representative control
- this checkpoint does not change the outer section shell; it narrows the recursive row-tree boundary inside the shared params path

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Params/ParamRowShell.test.tsx src/components/Params/getFilteredRenderableParamIds.test.ts src/components/Params/getParamDndListRenderModel.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `7` files passed, `31` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
- result: `19 passed`

Why these gates were chosen:

- direct boundary coverage for the new row-only `ParamContainer`
- retained the accepted filter-model guardrails from checkpoints 3 and 4
- retained the Dict/shared-shell and nested-row browser regressions on the same representative area

## CDP Visual Verification

Chrome DevTools was used to compare the locked `S0 Dict` scene on both branches on the settled `gamma` filtered state after replaying the matched `delta -> gamma` interaction.

Visual read:

- the filter field, arg toolbar, pinned area, and visible `gamma` row remained aligned between untouched `main` and the worktree
- moving the recursive child handoff out of `ParamContainer` did not introduce visible spacing drift or row-boundary changes
- the worktree preserved the already accepted flatter structure without changing the filtered visual result

## Chrome DevTools Filter Trace

Chrome DevTools `Performance` traces were recorded for the directly touched `S0 Dict` filter interaction:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint5/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint5/worktree-s0-dict-filter-gamma-trace.json`

Chrome DevTools screenshot pair for the settled filtered state:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint5/main-s0-dict-gamma.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint5/worktree-s0-dict-gamma.png`

Both runs replayed the same matched filter sequence on the locked `S0 Dict` scene:

- start on `delta`
- replace the filter with `gamma`
- wait for the visible row set to settle

Aggregate DevTools event totals from the trace pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | 910.778 | 42.344 | 5.068 | 3.245 | 1674.083 | 1918.567 | 240.367 | 6.070 | 5.980 |
| worktree | 833.940 | 35.895 | 4.531 | 2.975 | 1410.200 | 1689.448 | 265.114 | 5.524 | 5.153 |

DevTools summary:

- `main` INP: `188ms`
- worktree INP: `169ms`
- `CLS 0.00` on both traces

Interpretation:

- the worktree wins again on the directly touched matched filter path
- compared with untouched `main`, the worktree reduced:
  - `FunctionCall` by `76.838ms` (`8.4%`)
  - `UpdateLayoutTree` by `6.449ms` (`15.2%`)
  - `Layout` by `0.537ms` (`10.6%`)
  - `Paint` by `0.270ms` (`8.3%`)
  - `RunTask` by `263.883ms` (`15.8%`)
  - `EventDispatch` by `229.119ms` (`11.9%`)
  - `Commit` by `0.827ms` (`13.8%`)
- `TimerFire` was slightly higher on the worktree (`265.114ms` vs `240.367ms`), but it did not outweigh the improvement across the main scripting/layout path
- this supports the architectural read that making `ParamContainer` row-only removes unnecessary recursive prop and comparison work from the touched filter update

Note on resize / pan / zoom profiling:

- this checkpoint did not change the resize, pan, or zoom paths directly
- the plan still explicitly requires Chrome DevTools `Performance` traces whenever a future checkpoint tests resize, pan, or zoom

## Conclusion

- `Phase S2` remains active.
- Checkpoint 5 is accepted as a row-only `ParamContainer` / recursion-handoff checkpoint.
- The worktree keeps parity on the representative filtered scene and improves the directly touched DevTools filter path versus untouched `main`.
- The next `Phase S2` step should move above `ParamContainer` into the surviving row-tree ownership split across `ParamSwitch`, `GetParamSwitch`, and `ParamDndList`, especially the remaining `requiredParamIdsToPaths` and `visibleParamIdLookup` threading.

