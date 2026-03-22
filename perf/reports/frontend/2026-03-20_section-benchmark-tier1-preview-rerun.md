# Section Benchmark Tier 1 Preview Rerun

Date: `2026-03-20`

Question:

- After making `preview` a real resolved body mode for Tier 1 top-level canvas sections during viewport motion, does the standardized paired benchmark show a meaningful paint improvement?

Implementation under test:

- Made `preview` a real resolved mode for the first narrow rollout in:
  - `frontend/src/components/Section/Container/sectionBodyModePolicy.ts`
  - `frontend/src/components/Section/Container/SectionBodyGate.tsx`
- Added the first actual Tier 1 body surrogate:
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionPreview.tsx`
- Narrowed the first rollout deliberately:
  - Tier 1 dense-param families only
  - top-level canvas bodies only
  - motion-time preview only
  - windows stay live
  - Tier 2 code sections stay live

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-preview-rerun`
- previous checkpoint for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-body-host-rerun`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` targeting `backendArgs`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same live ports:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - CDP `http://127.0.0.1:9309`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionBodyModePolicy.test.ts src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/BrowserArea.test.tsx`
  - `9` files passed
  - `39` tests passed
- `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "sectionBodyModePolicy|SectionBodyGate|SectionContainerCoreResizabe|SectionWindowSurface|Tier1DenseParamSectionPreview"`
  - no matching diagnostics

Benchmark-window totals after landing the first real Tier 1 preview path, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18102.523` | `9.941` | `87.622` | `3932.936` | `55.209` |
| `settings` | worktree | `18133.387` | `191.084` | `90.445` | `4259.584` | `63.287` |
| `tier1Synthetic` | untouched `main` | `23232.781` | `13.900` | `26.245` | `23037.323` | `138.353` |
| `tier1Synthetic` | worktree | `22249.695` | `1611.081` | `26.511` | `23785.273` | `145.915` |

Worktree deltas versus the prior body-host checkpoint:

| Scene | Phase | Metric | Before | After | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `191.708` | `191.084` | `-0.624` |
| `settings` | benchmark | `UpdateLayoutTree` | `84.169` | `90.445` | `+6.276` |
| `settings` | overview horizontal pan slow | `Paint` | `35.846` | `37.061` | `+1.215` |
| `settings` | overview vertical pan slow | `Paint` | `35.513` | `36.854` | `+1.341` |
| `settings` | overview-to-detail zoom slow | `Paint` | `11.703` | `11.182` | `-0.521` |
| `settings` | detail-to-overview zoom slow | `Paint` | `13.766` | `13.405` | `-0.361` |
| `tier1Synthetic` | benchmark | `Paint` | `1622.944` | `1611.081` | `-11.863` |
| `tier1Synthetic` | benchmark | `RunTask` | `24125.292` | `23785.273` | `-340.019` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `358.991` | `381.501` | `+22.510` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `348.334` | `332.993` | `-15.341` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `65.677` | `60.975` | `-4.702` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `78.198` | `73.311` | `-4.887` |

Interpretation:

- this is the first checkpoint where `preview` is actually real, but the gain is too small and too mixed to call it a performance success
- `settings` is effectively flat:
  - full-window `Paint` drops by only `0.624ms`
  - the slow overview pans get slightly worse on paint
  - the zoom phases get slightly better
- `tier1Synthetic` improves modestly in aggregate:
  - full-window `Paint` drops by `11.863ms`
  - `RunTask` drops by `340.019ms`
  - but the slow horizontal overview pan regresses by `22.510ms` paint
- read:
  - the preview path is functioning
  - the current preview surrogate and gating policy are not aggressive enough to materially change the user-visible motion path
  - simply swapping a small lightweight DOM preview for a subset of Tier 1 sections during motion does not yet buy the class of win we need

CDP visual sanity:

- DevTools opened successfully on:
  - `http://127.0.0.1:3012/settings`
- The worktree settings page still loaded and remained navigable after the preview-path wiring.
- This was a sanity pass only; the preview mode is motion-time only, so this checkpoint still needs a richer visual parity pass if the preview path is widened or made persistent at low zoom.

Conclusion:

- Keep the first real preview path as a narrow experimental step.
- Do not treat it as the answer.
- The next preview iteration needs a stronger change:
  - better pane-aware projection or visibility gating
  - a lighter or more faithful preview substrate
  - broader but still controlled Tier 1 eligibility if traces justify it
