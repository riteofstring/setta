# Shared Section-Shell S2 Checkpoint 4

Date: 2026-03-17
Area: frontend
Branch/Commit: frontend-performance-11
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Continue `Phase S2` by unifying the shared temp placeholder and real row shell, then narrow the `ParamSwitch` memo contract so the shared row path does less recursive comparison work during filter updates.

## Scope

Added `frontend/src/components/Params/ParamRowShell.tsx`:

- extracted the shared `<article>` row shell now used by both the live row path and the temp placeholder path
- kept the existing row class contract in one place instead of duplicating the shell between `ParamContainer` and `TempParamSwitch`

Updated `frontend/src/components/Params/ParamContainer.tsx`:

- moved the real row `<article>` shell to `ParamRowShell`
- kept the existing child recursion and row body ownership inside the row shell

Updated `frontend/src/components/Params/ParamSwitch.tsx`:

- moved `TempParamSwitch` onto the shared `ParamRowShell`
- replaced the old deep `_.isEqual` memo comparator with a targeted `areParamSwitchPropsEqual` comparator matching the real recursive prop contract

Added `frontend/src/components/Params/ParamRowShell.test.tsx`:

- asserted the shared shell preserves the expected row/article contract
- guarded the extracted shell shape before the next `ParamContainer` pass

Why this checkpoint belongs to `Phase S2`:

- it simplifies the surviving shared row primitive beneath the accepted list/filter orchestration changes
- it removes duplicated shell ownership between the temp and live row paths without changing behavior
- it narrows the recursive memo boundary on the directly touched row-switch path instead of reopening the rejected render-context split

## DOM Read

Locked scenes:

- untouched `main`: `http://127.0.0.1:3087/falling_wood`
- worktree: `http://127.0.0.1:3011/kite_hiding`
- representative section:
  - `S0 Dict`

For this checkpoint, the locked `S0 Dict` scene had already advanced beyond the earlier baseline filter state, so both branches were first matched on the same `delta` filter state and then read again after replaying the touched `delta -> gamma` interaction.

Live DOM audit on the matched `gamma` state, using the same HTMLElement-only read on both branches:

| Branch | Nodes | Max depth | Visible rows | Filter value |
| --- | ---: | ---: | --- | --- |
| `main` | 74 | 11 | `["gamma"]` | `gamma` |
| worktree | 64 | 9 | `["gamma"]` | `gamma` |

Key read:

- the worktree keeps a flatter row subtree than untouched `main` on the matched filtered representative scene
- both branches converge to the same visible row text path after the traced filter update
- the checkpoint intentionally targeted row-shell sharing and memo work, not another wrapper-only idle-state removal

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/ParamRowShell.test.tsx src/components/Params/getFilteredRenderableParamIds.test.ts src/components/Params/getParamDndListRenderModel.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `6` files passed, `30` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
- result: `19 passed`

Why these gates were chosen:

- direct unit coverage for the extracted shared row shell
- retained the accepted filter-model guardrails from checkpoint 3
- retained the Dict/shared-shell and nested-row browser regressions on the same representative area

## CDP Visual Verification

Chrome DevTools was used to compare the locked `S0 Dict` scene on both branches before and after replaying the matched `delta -> gamma` filter interaction.

Visual read:

- the filter field, arg toolbar, pinned area, and visible `gamma` row stayed aligned between untouched `main` and the worktree
- the shared row shell extraction did not introduce new wrappers, spacing drift, or obvious row-boundary changes
- the matched filtered state remained visually equivalent across both branches while preserving the already accepted flattened worktree structure

## Chrome DevTools Filter Trace

Chrome DevTools `Performance` traces were recorded for the directly touched `S0 Dict` filter interaction:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint4/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint4/worktree-s0-dict-filter-gamma-trace.json`

Both runs replayed the same matched filter sequence on the locked `S0 Dict` scene:

- start on `delta`
- replace the filter with `gamma`
- wait for the visible row set to settle

Aggregate DevTools event totals from the trace pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | 1555.528 | 50.422 | 5.989 | 4.337 | 2260.241 | 2025.802 | 693.646 | 9.927 | 5.698 |
| worktree | 880.282 | 38.889 | 5.011 | 3.519 | 1430.448 | 1891.168 | 1.924 | 6.769 | 4.875 |

DevTools summary:

- `main` INP: `213ms`
- worktree INP: `178ms`
- `CLS 0.00` on both traces

Interpretation:

- the worktree wins clearly on the directly touched matched filter path
- compared with untouched `main`, the worktree reduced:
  - `FunctionCall` by `675.246ms` (`43.4%`)
  - `UpdateLayoutTree` by `11.533ms` (`22.9%`)
  - `Layout` by `0.978ms` (`16.3%`)
  - `Paint` by `0.818ms` (`18.9%`)
  - `RunTask` by `829.793ms` (`36.7%`)
  - `Commit` by `0.823ms` (`14.4%`)
- this supports the architectural read that sharing the row shell and narrowing the `ParamSwitch` memo boundary reduces both recursive comparison work and follow-on layout work on the touched filter update

Note on resize / pan / zoom profiling:

- this checkpoint did not change the resize, pan, or zoom paths directly
- the plan still explicitly requires Chrome DevTools `Performance` traces whenever a future checkpoint tests resize, pan, or zoom

## Conclusion

- `Phase S2` remains active.
- Checkpoint 4 is accepted as a shared row-shell and memo-boundary checkpoint.
- The worktree keeps parity on the matched filtered representative scene and improves the directly touched DevTools filter path versus untouched `main`.
- The next `Phase S2` step should move below the shared `ParamRowShell` into the surviving `ParamContainer` subtree contract, especially the memo boundary, nested-child recursion handoff, and the large child-recursion props still threaded into each row.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint4/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint4/worktree-s0-dict-filter-gamma-trace.json`
