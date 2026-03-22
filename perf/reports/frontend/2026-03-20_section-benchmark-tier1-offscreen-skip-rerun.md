# Section Benchmark Tier 1 Offscreen Skip Rerun

Date: `2026-03-20`

Question:

- If inactive Tier 1 dense-param bodies resolve to `skip` instead of `preview` when they are fully outside the visible pane during viewport motion, does the standardized paired benchmark improve enough to keep that pane-aware visibility shortcut?

Implementation under test:

- Experimental pane-aware visibility gating in:
  - `frontend/src/components/Section/Container/SectionBodyGate.tsx`
  - `frontend/src/components/Section/Container/sectionBodyModePolicy.ts`
- Deliberate behavior under test:
  - keep the earlier narrow Tier 1 preview rollout
  - additionally resolve fully offscreen inactive Tier 1 canvas bodies to `skip` during viewport motion
  - leave settled viewport behavior unchanged so offscreen sections return to the live path when motion ends

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-offscreen-skip-rerun`
- previous accepted preview checkpoint for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-preview-rerun`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` targeting `backendArgs`
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

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionBodyModePolicy.test.ts src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/BrowserArea.test.tsx`
  - `9` files passed
  - `43` tests passed
- `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "sectionBodyModePolicy|SectionBodyGate|SectionContainerCoreResizabe"`
  - no matching diagnostics

Benchmark-window totals for the pane-aware offscreen-skip iteration, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18057.566` | `9.302` | `87.023` | `3993.348` | `57.089` |
| `settings` | worktree | `18049.059` | `187.483` | `80.568` | `4323.789` | `62.836` |
| `tier1Synthetic` | untouched `main` | `23174.513` | `16.291` | `28.168` | `23754.262` | `141.099` |
| `tier1Synthetic` | worktree | `22483.011` | `1698.292` | `27.460` | `24404.046` | `145.171` |

Worktree deltas versus the immediately previous preview checkpoint:

| Scene | Phase | Metric | Before | After | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `191.084` | `187.483` | `-3.601` |
| `settings` | benchmark | `UpdateLayoutTree` | `90.445` | `80.568` | `-9.877` |
| `settings` | benchmark | `RunTask` | `4259.584` | `4323.789` | `+64.205` |
| `settings` | overview horizontal pan slow | `Paint` | `37.061` | `35.532` | `-1.529` |
| `settings` | overview vertical pan slow | `Paint` | `36.854` | `35.092` | `-1.762` |
| `settings` | overview-to-detail zoom slow | `Paint` | `11.182` | `12.171` | `+0.989` |
| `settings` | detail-to-overview zoom slow | `Paint` | `13.405` | `12.201` | `-1.204` |
| `tier1Synthetic` | benchmark | `Paint` | `1611.081` | `1698.292` | `+87.211` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `26.511` | `27.460` | `+0.949` |
| `tier1Synthetic` | benchmark | `RunTask` | `23785.273` | `24404.046` | `+618.773` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `381.501` | `388.392` | `+6.891` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `332.993` | `345.837` | `+12.844` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `60.975` | `65.446` | `+4.471` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `73.311` | `83.552` | `+10.241` |

Interpretation:

- this visibility shortcut helps the real `settings` route modestly
- it does not help the canonical Tier 1 synthetic scene, and the aggregate synthetic result gets materially worse
- read:
  - using pane-aware `skip` alone is not the right next Tier 1 move
  - it probably saves some wasted body work on the real `settings` canvas, but the mount/unmount or representation churn it introduces hurts the dense canonical synthetic scene more than it helps
  - the next retained Tier 1 slice should either:
    - reduce the live body cost directly
    - or improve the preview/warm representation itself instead of adding another body-mode shortcut

Conclusion:

- Reject this pane-aware offscreen-skip iteration.
- Keep the earlier narrower preview checkpoint at `HEAD`.
- Preserve this report as an append-only dead-end record and continue from the previous preview baseline instead of carrying this regression forward.
