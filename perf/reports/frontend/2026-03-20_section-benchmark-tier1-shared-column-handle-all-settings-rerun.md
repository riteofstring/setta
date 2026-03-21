# Section Benchmark Tier 1 Shared Column Handle All Settings Rerun

Date: `2026-03-20`

Question:

- Does replacing per-row Tier 1 param column resize handles with shared area-level overlays buy a real win once the `settings` benchmark is run on the authoritative `All Settings` view instead of the default `Core` view?

Implementation under test:

- Added a shared overlay resize-handle component:
  - `frontend/src/components/Params/ParamColumnResizeHandle.tsx`
- Rewired the dense param stack so Tier 1 areas render shared overlays instead of per-row handles:
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Params/ParamSwitch.tsx`
  - `frontend/src/components/Params/ParamContainer.tsx`
- Added focused coverage for the new overlay and the recursive `showResizeHandle={false}` propagation:
  - `frontend/src/components/Params/ParamColumnResizeHandle.test.tsx`
  - `frontend/src/components/Params/GroupContainer.test.tsx`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-shared-column-handle-all-settings-rerun`
- harness standardization checkpoint that makes this rerun authoritative:
  - `87375e854`
  - `Standardize settings benchmark on the all-settings view`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` on the authoritative `All Settings` view, targeting `groupSectionDefault`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same live ports at the time of the rerun:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - CDP `http://127.0.0.1:9309`
- Because the earlier `settings` samples were taken on the wrong view mode, I also captured a same-harness retained-baseline control on the worktree by temporarily stashing only the in-flight shared-handle files and rerunning:
  - `baseline-worktree-settings.summary.json`
  - `baseline-worktree-tier1.summary.json`
- The earlier default-view `/settings` results in:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-shared-column-handle-rerun`
  - are preserved only as historical diagnostics and are superseded by this `All Settings` rerun.

Relevant automated verification:

- focused benchmark harness tests:
  - `node --test perf/scripts/runSectionBenchmarkViaCdp.test.js perf/scripts/sectionBenchmarkScenes.test.js perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.test.js`
    - `12` tests passed
- focused Param/section seam tests after restoring the experiment:
  - `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.test.tsx src/components/Params/ResizeHandle.test.tsx src/components/Params/ParamColumnResizeHandle.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx`
    - `4` files passed
    - `15` tests passed
- filtered `tsc` check:
  - `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "ParamColumnResizeHandle|ParamDndList|ParamSwitch|ParamContainer|GroupContainer"`
  - result:
    - still shows the same long-standing baseline diagnostics in these seams
    - no new `ParamColumnResizeHandle`-specific error line appeared

Authoritative benchmark-window totals after landing shared area-level handles, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `21939.872` | `65.840` | `85.291` | `26765.327` | `49.342` |
| `settings` | worktree | `21967.561` | `413.960` | `279.220` | `27834.499` | `235.006` |
| `tier1Synthetic` | untouched `main` | `16995.733` | `14.898` | `18.733` | `14633.640` | `112.941` |
| `tier1Synthetic` | worktree | `16965.096` | `747.929` | `16.623` | `14454.825` | `113.078` |

Worktree deltas versus the same-harness retained baseline:

| Scene | Phase | Metric | Baseline | Experiment | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `520.746` | `413.960` | `-106.786` |
| `settings` | benchmark | `RunTask` | `30027.733` | `27834.499` | `-2193.234` |
| `settings` | overview horizontal pan slow | `Paint` | `49.606` | `37.915` | `-11.691` |
| `settings` | overview horizontal pan slow | `RunTask` | `3770.899` | `3146.168` | `-624.731` |
| `settings` | overview vertical pan slow | `Paint` | `76.053` | `58.302` | `-17.751` |
| `settings` | overview vertical pan slow | `RunTask` | `3759.840` | `3700.484` | `-59.356` |
| `tier1Synthetic` | benchmark | `Paint` | `918.136` | `747.929` | `-170.207` |
| `tier1Synthetic` | benchmark | `RunTask` | `13776.586` | `14454.825` | `+678.239` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `155.469` | `129.172` | `-26.297` |
| `tier1Synthetic` | overview horizontal pan slow | `RunTask` | `2364.313` | `2878.914` | `+514.601` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `197.840` | `147.883` | `-49.957` |
| `tier1Synthetic` | overview vertical pan slow | `RunTask` | `2707.730` | `2582.572` | `-125.158` |

Live DOM / geometry sanity on the authoritative `All Settings` worktree page:

- sampled on `http://127.0.0.1:3012/settings` in headed DevTools after restoring the experiment
- measured:
  - `760` rendered param rows
  - `45` shared column overlays
  - `274` nested rows
- sampled nested-row geometry:
  - overlay center to label right edge:
    - approximately `-0.35px`
  - input left edge to overlay center:
    - approximately `+1.55px`
- read:
  - the shared overlay seam is still landing on the real nested label/value split closely enough to treat the earlier theoretical nested-alignment concern as non-blocking for this checkpoint

Interpretation:

- This is a keep.
- Under the authoritative `All Settings` harness, the shared area-level handle model improves the real `settings` target clearly enough that the earlier default-view diagnostics should not drive the decision anymore.
- `settings` is better on both aggregate hot metrics and the representative slow overview pans:
  - aggregate `Paint` improves by `106.786ms`
  - aggregate `RunTask` improves by `2193.234ms`
  - slow overview horizontal-pan `Paint` improves by `11.691ms`
  - slow overview vertical-pan `Paint` improves by `17.751ms`
- `tier1Synthetic` also improves on the main target metric:
  - aggregate `Paint` improves by `170.207ms`
  - both slow overview pan paint phases improve materially
  - there is still a mixed `RunTask` story, especially on slow horizontal pan, so this is not the last word on row-body ownership
- Read:
  - per-row resize-handle duplication was still a real piece of the repeated Tier 1 motion cost
  - collapsing that repetition down to one overlay per param area is a meaningful live-body reduction, not just a cosmetic DOM shuffle
  - the branch is still far behind untouched `main` on absolute paint totals, so this is an accepted step, not a solved endpoint

CDP visual sanity:

- Compared live `settings` pages on:
  - worktree `http://127.0.0.1:3012/settings`
  - untouched `main` `http://127.0.0.1:3087/settings`
- Verified the authoritative view switch to `All Settings` on both branches.
- Verified the live worktree page still exposes the expected dense settings section inventory including:
  - `groupSectionDefault`
  - `callableSectionDefault`
  - `dictSectionDefault`
  - `listRootSectionDefault`
  - `globalVariablesSectionDefault`
- Verified the shared-overlay experiment on the worktree page:
  - nested rows still render
  - the page remains navigable
  - sampled nested seam geometry stays aligned closely enough to keep the checkpoint

Conclusion:

- Keep the shared area-level Tier 1 column-handle model at `HEAD`.
- Treat it as the next accepted Phase 5 row/body seam reduction after the retained nested-guide-removal baseline.
- The next Tier 1 slice should stay on repeated live row/body structure rather than returning immediately to the rejected inactive-preview lane:
  - reduce more repeated label/value shell work
  - or simplify another shared dense-row ownership seam
  - while continuing to measure against authoritative `All Settings` plus `tier1Synthetic`.
