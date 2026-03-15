# Shared Section-Shell S2 Checkpoint 6

Date: 2026-03-17
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Continue `Phase S2` by tightening the surviving row-tree ownership split above the now row-only `ParamContainer`, especially the remaining `visibleParamIdLookup` and `requiredParamIdsToPaths` threading across `GetParamSwitch`, `ParamSwitch`, and `ParamDndList`.

## Scope

Updated `frontend/src/components/Params/GetParamSwitch.tsx`:

- filtered visible row ids with `visibleParamIdLookup`
- constrained `requiredParamIdsToPaths` and `visibleParamIdLookup` handoff to the nested-parent path
- kept the recursive row handoff above `ParamContainer`

Updated `frontend/src/components/Params/ParamSwitch.tsx`:

- kept child recursion ownership at the `ParamSwitch` layer
- continued using the targeted `areParamSwitchPropsEqual` comparator instead of deep `_.isEqual`

Updated `frontend/src/components/Params/ParamDndList.tsx`:

- threaded `visibleParamIdLookup` from the list render model into `GetParamSwitch`

Updated `frontend/src/components/Params/ParamContainer.tsx`:

- kept the row-only boundary intact beneath the checkpoint-5 split

Updated tests:

- `frontend/src/components/Params/ParamContainer.test.tsx`
- `frontend/src/components/Params/GroupContainer.test.tsx`

Why this checkpoint belongs to `Phase S2`:

- it continues simplifying the shared row-tree ownership contract instead of removing a decorative wrapper
- it narrows where recursive visibility and required-path data are threaded in the shared params path
- it keeps the accepted row-only `ParamContainer` boundary while testing whether the remaining handoff can be tightened without a perf regression

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

Live DOM audit on the settled `gamma` state:

| Branch | Nodes | Max depth | Visible rows | Filter value |
| --- | ---: | ---: | --- | --- |
| `main` | 68 | 9 | `["gamma"]` | `gamma` |
| worktree | 58 | 7 | `["gamma"]` | `gamma` |

Key read:

- the worktree still keeps a flatter locked `S0 Dict` subtree than untouched `main`
- both branches converge to the same visible filtered result on the representative control
- this checkpoint does not buy another DOM-count reduction beyond checkpoint 5; it only changes the row-tree ownership contract above that flatter subtree

## Automated Verification

Focused automated verification for the checkpoint-6 candidate was already green before the earlier DevTools transport block and remained the automation gate for this acceptance rerun:

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Params/ParamRowShell.test.tsx src/components/Params/getFilteredRenderableParamIds.test.ts src/components/Params/getParamDndListRenderModel.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `7` files passed, `32` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
- result: `19 passed`

Why these gates were kept:

- direct coverage for the row-only `ParamContainer` boundary plus the nested/filter canaries touched by the checkpoint-6 prop-threading changes
- retained the Dict/shared-shell and nested-row browser regressions on the same representative area

## CDP Visual Verification

Chrome DevTools was used to compare the locked `S0 Dict` scene on both branches on the settled `gamma` filtered state after replaying the matched `delta -> gamma` interaction.

Visual read:

- the filter field, arg toolbar, pinned area, and visible `gamma` row remained aligned between untouched `main` and the worktree
- the checkpoint-6 ownership changes did not introduce visible spacing drift or row-boundary changes
- the screenshots stayed visually equivalent even though the candidate changed the surviving row-tree prop handoff above `ParamContainer`

## Chrome DevTools Filter Trace

Chrome DevTools `Performance` traces were recorded for the directly touched `S0 Dict` filter interaction:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/worktree-s0-dict-filter-gamma-trace.json`

Chrome DevTools screenshot pair for the settled filtered state:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/main-s0-dict-gamma.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/worktree-s0-dict-gamma.png`

Both runs replayed the same matched filter sequence on the representative `S0 Dict` scene:

- start on `delta`
- replace the filter with `gamma`
- wait for the visible row set to settle

Note on trace aggregation:

- this trace pair was captured while other live pages were also open in the same browser session
- to avoid attributing unrelated background renderer work from those other pages to this checkpoint, the totals below were read from the target page renderer process identified by each trace's `TracingStartedInBrowser` metadata instead of a raw all-thread sum

Target-renderer DevTools event totals from the trace pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | 751.304 | 32.251 | 3.353 | 2.612 | 992.252 | 2070.834 | 2.245 | 4.573 | 7.842 |
| worktree | 1450.094 | 35.813 | 3.909 | 2.554 | 1795.674 | 1916.897 | 11.022 | 4.575 | 30.717 |

DevTools summary:

- `main` INP: `562ms`
- worktree INP: `206ms`
- `CLS 0.00` on both traces

Interpretation:

- this is a mixed result, not a clean win
- the worktree improved the reported INP and kept parity, but the touched renderer path became materially heavier overall
- compared with untouched `main`, the worktree increased:
  - `FunctionCall` by `698.790ms` (`93.0%`)
  - `UpdateLayoutTree` by `3.562ms` (`11.0%`)
  - `Layout` by `0.556ms` (`16.6%`)
  - `RunTask` by `803.422ms` (`81.0%`)
  - `TimerFire` by `8.777ms` (`391.0%`)
  - `Commit` by `22.875ms` (`291.7%`)
- the worktree did reduce:
  - `EventDispatch` by `153.937ms` (`7.4%`)
  - `Paint` by `0.058ms` (`2.2%`)
- because this checkpoint changes code but does not reduce DOM further, the heavier renderer totals outweigh the visual-parity-only outcome for acceptance

Note on resize / pan / zoom profiling:

- this checkpoint did not change the resize, pan, or zoom paths directly
- the plan still explicitly requires Chrome DevTools `Performance` traces whenever a future checkpoint tests resize, pan, or zoom

## Conclusion

- `Phase S2` remains active.
- Checkpoint 6 is not accepted in its current form.
- The candidate keeps visual parity and the same flatter representative DOM, but the robust target-renderer trace read regressed on the directly touched filter path versus untouched `main`.
- The next `Phase S2` step should reduce the added renderer work around `visibleParamIdLookup`, `requiredParamIdsToPaths`, and the surviving row-tree handoff across `GetParamSwitch`, `ParamSwitch`, and `ParamDndList`, then rerun the same `S0 Dict` acceptance gate.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/worktree-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/main-s0-dict-gamma.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint6/worktree-s0-dict-gamma.png`
