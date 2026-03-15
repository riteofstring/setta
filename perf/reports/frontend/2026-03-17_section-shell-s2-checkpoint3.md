# Shared Section-Shell S2 Checkpoint 3

Date: 2026-03-17
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Continue `Phase S2` by simplifying the shared row/list filter contract so the visible-param lookup is computed once in the shared list render model instead of being recomputed through recursive `GetParamSwitch` store reads.

## Scope

Updated `frontend/src/components/Params/getFilteredRenderableParamIds.ts`:

- extracted `getFilteredRenderableParamIdLookup`
- trimmed the section param filter before deciding whether filtering is active
- kept the existing ancestor-preserving filtered path behavior and temp placeholder passthrough

Updated `frontend/src/components/Params/getParamDndListRenderModel.ts`:

- computed `visibleParamIdLookup` once in the shared render model
- exposed that lookup alongside `duplicateIndex`, `paramFilterActive`, and `tree`
- made `paramFilterActive` derive from the shared lookup instead of a separate local trim/read

Updated the recursive row/list path:

- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`

These files now thread the shared `visibleParamIdLookup` through the recursion instead of having `GetParamSwitch` subscribe to project state and re-run filtering at each branch.

Updated verification coverage:

- `frontend/src/components/Params/getFilteredRenderableParamIds.test.ts`
- `frontend/src/components/Params/getParamDndListRenderModel.test.ts`

The new assertions cover whitespace-only filters staying inactive and the tree path remaining enabled when the filter is only whitespace.

Why this checkpoint belongs to `Phase S2`:

- it simplifies the surviving shared row/list orchestration rather than a decorative shell
- it removes repeated filtering ownership from the recursive switch path without changing DnD or selection behavior
- it directly targets the `ParamDndList` / `GetParamSwitch` cluster called out as the next `Phase S2` step after checkpoint 2

## DOM Read

Locked scenes:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- representative sections:
  - `S0 Code`
  - `S0 Dict`

Live DOM audit after the checkpoint, using the same HTMLElement-only read on both branches:

| Section | Branch | Nodes | Max depth | Param rows | Filter inputs |
| --- | --- | ---: | ---: | ---: | ---: |
| `S0 Code` | `main` | 101 | 12 | 0 | 0 |
| `S0 Code` | worktree | 100 | 12 | 0 | 0 |
| `S0 Dict` | `main` | 97 | 14 | 3 | 1 |
| `S0 Dict` | worktree | 77 | 11 | 3 | 1 |

Filter-path read on the locked `S0 Dict` scene:

- typing `delta` reduced the visible row count from `3` to `2` on both branches
- clearing the filter restored the visible row count to `3` on both branches
- both branches surfaced the same visible text path under filter: `gamma` + `delta`

Key read:

- this checkpoint intentionally does not remove another idle-state wrapper in the locked scene
- the worktree keeps the flatter shared row contract from checkpoint 2 while moving filter ownership out of the recursive store-selector path
- the filtered-state DOM result remains aligned between untouched `main` and the worktree

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/getFilteredRenderableParamIds.test.ts src/components/Params/getParamDndListRenderModel.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `5` files passed, `28` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
- result: `19 passed`

Why these gates were chosen:

- direct coverage for the moved filter/render-model ownership
- retained Dict/shared-shell markup and section-sizing coverage on the same representative area
- retained browser coverage for Dict interactions and the nested-row regression from checkpoint 2

## CDP Visual Verification

Chrome DevTools screenshots were taken on the locked `S0 Code` and `S0 Dict` scenes for both branches, plus an additional `S0 Dict` screenshot pair with the filter set to `delta`.

Visual read:

- `S0 Code` header title, diagnostics pill, editor surface, and right-side actions remained aligned
- `S0 Dict` header title, arg toolbar, edge strip, pinned header, and divider line remained aligned
- the filtered `delta` state reduced to the same `gamma` / `delta` visible path on both branches with no obvious visual drift in the search box, pinned area, or nested-child presentation

## Chrome DevTools Filter Trace

Chrome DevTools `Performance` traces were recorded for the directly touched `S0 Dict` filter interaction:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/main-s0-dict-filter-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/worktree-s0-dict-filter-trace.json`

Both runs replayed the same filter sequence on the locked `S0 Dict` scene:

- start cleared
- set filter to `delta`
- wait for the filtered row set to settle
- clear the filter again

Aggregate DevTools event totals from the trace pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` |
| --- | ---: | ---: | ---: | ---: | ---: |
| `main` | 686.6 | 138.6 | 9.6 | 2.8 | 1172.6 |
| worktree | 371.3 | 112.2 | 6.1 | 1.6 | 808.6 |

DevTools summary:

- both traces surfaced `CLSCulprits` and `ForcedReflow`
- `CLS 0.00` on both traces

Interpretation:

- the worktree wins clearly on the directly touched filter/render path
- compared with untouched `main`, the worktree reduced:
  - `FunctionCall` by `315.3ms` (`45.9%`)
  - `UpdateLayoutTree` by `26.4ms` (`19.1%`)
  - `Layout` by `3.5ms` (`36.9%`)
  - `Paint` by `1.2ms` (`42.0%`)
  - `RunTask` by `363.9ms` (`31.0%`)
- this supports the architectural read that computing the visible lookup once and removing the recursive `GetParamSwitch` store selector reduces both scripting and follow-on layout work on the filter interaction path

Note on resize / pan / zoom profiling:

- this checkpoint did not change the resize, pan, or zoom handlers directly, so no new resize-path trace was recorded here
- the plan still explicitly requires Chrome DevTools `Performance` traces whenever a future checkpoint tests resize, pan, or zoom
- the last locked resize-path comparison remains checkpoint 2

## Conclusion

- `Phase S2` remains active.
- Checkpoint 3 is accepted as a shared row/list orchestration checkpoint.
- The worktree keeps visual parity on the idle and filtered representative scenes, and it produces the first clear DevTools win on the directly touched filter/render path.
- The next `Phase S2` step should move from the list-level orchestration into the surviving `ParamSwitch` / `ParamContainer` `section-param-row` contract and the input/error subtree ownership beneath it.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/main-s0-code.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/worktree-s0-code.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/main-s0-dict.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/worktree-s0-dict.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/main-s0-dict-filtered-delta.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/worktree-s0-dict-filtered-delta.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/main-s0-dict-filter-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint3/worktree-s0-dict-filter-trace.json`
