# Section Benchmark Tier 1 Preview Rerun 2

Date: `2026-03-20`

Question:

- If the Tier 1 preview path becomes more aggressive during motion and the preview substrate is reduced to an almost-single SVG surface, does the standardized paired benchmark improve enough to keep that stronger preview iteration?

Implementation under test:

- Experimental stronger motion-time Tier 1 preview iteration in:
  - `frontend/src/components/Section/Container/sectionBodyModePolicy.ts`
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionPreview.tsx`
  - `frontend/src/components/Section/Container/SectionBodyGate.test.tsx`
- Two deliberate changes were combined:
  - more aggressive preview eligibility for inactive Tier 1 canvas sections during motion
  - a simpler SVG-based preview substrate instead of the earlier multi-node preview DOM

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-preview-rerun-2`
- previous checkpoint for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-preview-rerun`
- earlier body-host checkpoint for broader comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-body-host-rerun`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` targeting `backendArgs`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionBodyModePolicy.test.ts src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/BrowserArea.test.tsx`
  - `9` files passed
  - `40` tests passed

Benchmark-window totals for the experimental stronger preview iteration, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | worktree | `18048.894` | `185.469` | `84.184` | `3945.649` | `62.367` |
| `tier1Synthetic` | worktree | `22197.958` | `1631.419` | `27.033` | `23842.679` | `146.601` |

Worktree deltas versus the immediately previous preview checkpoint:

| Scene | Phase | Metric | Before | After | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `191.084` | `185.469` | `-5.615` |
| `settings` | benchmark | `RunTask` | `4259.584` | `3945.649` | `-313.935` |
| `settings` | overview horizontal pan slow | `Paint` | `37.061` | `35.509` | `-1.552` |
| `settings` | overview vertical pan slow | `Paint` | `36.854` | `35.134` | `-1.720` |
| `settings` | detail-to-overview zoom slow | `Paint` | `13.405` | `11.754` | `-1.651` |
| `tier1Synthetic` | benchmark | `Paint` | `1611.081` | `1631.419` | `+20.338` |
| `tier1Synthetic` | benchmark | `RunTask` | `23785.273` | `23842.679` | `+57.406` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `381.501` | `373.073` | `-8.428` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `332.993` | `343.561` | `+10.568` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `60.975` | `64.029` | `+3.054` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `73.311` | `82.540` | `+9.229` |

Interpretation:

- this iteration helps the real `settings` route modestly
- it does not help the canonical Tier 1 synthetic benchmark enough, and the aggregate Tier 1 result gets worse
- read:
  - the stronger motion-time preview gating is not a keep
  - the SVG substrate alone does not rescue it
  - this branch should not stay on this experimental preview variant at `HEAD`

Conclusion:

- Reject this stronger preview iteration.
- Keep the earlier narrower preview checkpoint at `HEAD`.
- Preserve this report as an append-only dead-end record and continue from the previous preview baseline instead of carrying this regression forward.
