# Shared Section-Shell S2 Checkpoint 7

Date: 2026-03-17
Area: frontend
Branch/Commit: `frontend-performance-11` @ `beaa9fdd6`
Related plan: `docs/plans/worktrees/setta.frontend-performance-11/section-performance-plan.md`

## Goal

Complete the last justified `Phase S2` row-tree pass by removing the extra `GetParamSwitch` recursion boundary, then re-run the locked `S0 Dict` `delta -> gamma` filter gate to decide whether the row-tree cluster is now structurally exhausted.

## Scope

Updated `frontend/src/components/Params/ParamDndList.tsx`:

- inlined the top-level row rendering path
- kept the DnD-provider seam, but removed the extra `GetParamSwitch` list adapter

Updated `frontend/src/components/Params/ParamSwitch.tsx`:

- inlined child recursion rendering directly into `ParamSwitch`
- kept the existing nested-parent gating so only ids that still own child recursion keep `requiredParamIdsToPaths`, `nestedParentParamIdLookup`, and `visibleParamIdLookup`

Updated `frontend/src/components/Params/getFilteredRenderableParamIds.ts`:

- added pure helpers for visible-id filtering and nested recursion-state gating
- kept the filter semantics unchanged

Updated tests:

- `frontend/src/components/Params/getFilteredRenderableParamIds.test.ts`

Removed:

- `frontend/src/components/Params/GetParamSwitch.tsx`

Why this still belongs to `Phase S2`:

- it completes the row/list ownership simplification identified by the fresh structural read
- it does not start the broader shared resize/container work
- it removes the remaining `ParamSwitch -> GetParamSwitch -> ParamSwitch` bounce without reopening the earlier rejected checkpoint-6 regression

## DOM Read

Representative scenes used for the acceptance gate:

- untouched `main`: `http://127.0.0.1:3087/dark_swimming`
- worktree: `http://127.0.0.1:3011/tide_pike`
- representative section:
  - `S0 Dict`

Both branches replayed the same touched filter interaction:

- start on `delta`
- replace the filter with `gamma`
- wait for the visible row set to settle

Focused representative state after the replay:

- both branches settled on the single visible `gamma` row
- both branches kept filter value `gamma`
- focused section subtree read from Chrome DevTools:
  - `main`: `75` nodes, max depth `11`
  - worktree: `65` nodes, max depth `9`

Interpretation:

- removing `GetParamSwitch` did not change the visible filtered result
- the worktree keeps a flatter focused representative subtree even after the section is centered and selected for the visual read

## Automated Verification

Vitest:

- `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Params/ParamRowShell.test.tsx src/components/Params/getFilteredRenderableParamIds.test.ts src/components/Params/getParamDndListRenderModel.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/state/hooks/sectionSizes.integration.test.tsx`
- result: `7` files passed, `34` tests passed

Playwright:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/edge-input-args-selection.spec.ts frontend/tests/e2e/params/params-section-scroll.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
- result: `19 passed`

Why these gates were kept:

- direct helper coverage for the new recursion-state helpers
- retained the representative row/list/shared-shell browser regressions already carrying the `S0 Dict` acceptance path

## CDP Visual Verification

Chrome DevTools was used on the locked `S0 Dict` scene on both branches on both:

- the `delta` pre-trace state
- the settled `gamma` post-trace state

Centered viewport screenshots used for the visual read:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/main-page-gamma-centered.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/worktree-page-gamma-centered-selected.png`

Visual read:

- the section header chrome, filter field, pinned area, input/output strip, and visible `gamma` row stayed aligned between untouched `main` and the worktree
- the worktree preserved the same focused/selected shell state after centering the section into view
- no row-spacing drift or nested-row presentation change appeared after removing `GetParamSwitch`

Note:

- node-cropped screenshots of the off-canvas `main` section were unreliable before centering, so the final visual read uses the centered viewport captures above

## Chrome DevTools Filter Trace

Chrome DevTools `Performance` traces were recorded for the directly touched `S0 Dict` filter interaction:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/worktree-s0-dict-filter-gamma-trace.json`

The event totals below were read from the target page renderer process identified by each trace's `TracingStartedInBrowser` metadata.

Target-renderer DevTools event totals from the checkpoint-7 pair, in milliseconds:

| Branch | `FunctionCall` | `UpdateLayoutTree` | `Layout` | `Paint` | `RunTask` | `EventDispatch` | `TimerFire` | `FireAnimationFrame` | `Commit` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `main` | 926.541 | 35.234 | 4.257 | 2.690 | 1079.022 | 2058.674 | 153.933 | 4.840 | 5.744 |
| worktree | 888.455 | 33.421 | 4.091 | 3.437 | 973.752 | 1994.093 | 157.504 | 4.783 | 5.419 |

DevTools summary:

- `main` INP: `189ms`
- worktree INP: `190ms`
- `CLS 0.00` on both traces

Interpretation:

- the worktree now wins on most of the heavier renderer categories directly touched by this filter path:
  - `FunctionCall`
  - `UpdateLayoutTree`
  - `Layout`
  - `RunTask`
  - `EventDispatch`
  - `FireAnimationFrame`
  - `Commit`
- the worktree remains slightly higher on:
  - `Paint`
  - `TimerFire`
- INP is effectively flat on this pair (`189ms` vs `190ms`)
- inference from the trace pair:
  - removing the extra `GetParamSwitch` recursion boundary did not introduce new scripting overhead
  - this checkpoint leaves the row-tree cluster in a better place structurally and no worse on the user-visible interaction read

## Conclusion

- `Phase S2` checkpoint 7 is accepted.
- The last justified row-tree seam is now removed:
  - `ParamDndList` owns the top-level list rendering handoff
  - `ParamSwitch` owns child recursion directly
  - the extra `GetParamSwitch` adapter is gone
- The focused representative subtree remains flatter than untouched `main`, automated coverage stays green, visual parity holds on the centered `S0 Dict` scene, and the fresh target-renderer trace no longer gives a reason to keep working the row-tree cluster.
- `Phase S2` should now be treated as structurally exhausted.
- The next serious step belongs to `Phase S3`, with `CustomResizable` / shared resize-session ownership as the strongest next boundary.

## Raw Artifacts (local-only)

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/main-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/worktree-s0-dict-filter-gamma-trace.json`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/main-page-gamma-centered.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s2-checkpoint7/worktree-page-gamma-centered-selected.png`
