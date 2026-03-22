# Section Benchmark Tier 1 Preview Locality Rerun

Date: `2026-03-25`

Question:

- Does constraining Tier 1 image-preview warming to a small local neighborhood materially improve the canonical `settings` and `tier1Synthetic` motion benchmarks enough to keep the next hybrid-rendering step?

Implementation under test:

- Probe commit under benchmark:
  - `8b0f6280e` `Constrain Tier 1 preview warming to a local neighborhood`
- Product behavior under test:
  - keep the faithful SnapDOM image-preview path
  - limit preview warming to a small center-biased neighborhood
  - evict preview-ready caches once sections fall out of that neighborhood
  - keep the old simplified placeholder subtree removed
- Experimental files under test:
  - `frontend/src/components/Section/Container/SectionBodyGate.tsx`
  - `frontend/src/components/Section/Container/sectionBodyModePolicy.ts`
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionPreview.tsx`
  - `frontend/tests/e2e/settings/settings-pan-zoom-preview.spec.ts`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-25_section-benchmark-tier1-preview-locality-rerun`
- prior queued-image checkpoint for direct comparison:
  - `perf/reports/frontend/2026-03-25_section-benchmark-tier1-image-preview-queue-rerun.md`
- recalibrated retained baseline for comparison:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-retained-baseline-rerun`

Method:

- Same reusable benchmark runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same canonical scene pair:
  - `settings` on the authoritative `All Settings` view
  - `tier1Synthetic`
- Same paired browser/frontend targets:
  - worktree browser CDP `http://127.0.0.1:9233`
  - worktree frontend `http://127.0.0.1:3011`
  - untouched `main` browser CDP `http://127.0.0.1:9309`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Reinstalled canonical scenes immediately before the rerun:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root ../setta/setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root ../setta/setta_files_dev`
- Focused automated verification on the locality probe before the benchmark write-up:
  - `pnpm -C frontend exec vitest run src/components/Section/Container/sectionBodyModePolicy.test.ts src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionPreview.test.tsx`
    - `3` files passed
    - `18` tests passed
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-pan-zoom-preview.spec.ts`
    - `1` test passed in about `21.7s`
  - filtered `tsc` on `SectionBodyGate`, `Tier1DenseParamSectionPreview`, `sectionBodyModePolicy`, and `settings-pan-zoom-preview` returned no matching diagnostics
- Fresh CDP-only visual sanity pass on the probe:
  - `/settings` `All Settings` and `/benchmark-tier1`
  - no old simplified placeholder fallback observed
  - sampled motion state on `/benchmark-tier1` showed only a small visible preview set rather than a broad canvas-wide overlay buildup

Paired benchmark totals versus untouched `main`:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | untouched `main` | `105.944` | `41939.727` | `690.096` |
| `settings` | worktree locality probe | `576.737` | `44650.901` | `755.065` |
| `tier1Synthetic` | untouched `main` | `19.531` | `17558.466` | `26.025` |
| `tier1Synthetic` | worktree locality probe | `1049.454` | `18378.127` | `272.441` |

Authoritative worktree deltas versus untouched `main`:

| Scene | Phase | Metric | Untouched `main` | Worktree | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `105.944` | `576.737` | `+470.793` |
| `settings` | benchmark | `RunTask` | `41939.727` | `44650.901` | `+2711.174` |
| `settings` | benchmark | `UpdateLayoutTree` | `690.096` | `755.065` | `+64.969` |
| `settings` | overview horizontal pan slow | `Paint` | `0.000` | `50.665` | `+50.665` |
| `settings` | overview vertical pan slow | `Paint` | `0.000` | `78.800` | `+78.800` |
| `settings` | overview-to-detail zoom slow | `Paint` | `7.251` | `19.570` | `+12.319` |
| `settings` | detail-to-overview zoom slow | `Paint` | `6.677` | `28.621` | `+21.944` |
| `tier1Synthetic` | benchmark | `Paint` | `19.531` | `1049.454` | `+1029.923` |
| `tier1Synthetic` | benchmark | `RunTask` | `17558.466` | `18378.127` | `+819.661` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `26.025` | `272.441` | `+246.416` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `0.000` | `160.134` | `+160.134` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `0.000` | `204.116` | `+204.116` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `4.700` | `48.837` | `+44.137` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `4.076` | `70.892` | `+66.816` |

Worktree deltas versus the recalibrated retained baseline:

| Scene | Phase | Metric | Recalibrated baseline | Locality rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `436.851` | `576.737` | `+139.886` |
| `settings` | benchmark | `RunTask` | `31132.744` | `44650.901` | `+13518.157` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.197` | `755.065` | `+261.868` |
| `settings` | overview horizontal pan slow | `Paint` | `38.267` | `50.665` | `+12.398` |
| `settings` | overview vertical pan slow | `Paint` | `61.247` | `78.800` | `+17.553` |
| `settings` | overview-to-detail zoom slow | `Paint` | `16.371` | `19.570` | `+3.199` |
| `settings` | detail-to-overview zoom slow | `Paint` | `27.138` | `28.621` | `+1.483` |
| `tier1Synthetic` | benchmark | `Paint` | `749.086` | `1049.454` | `+300.368` |
| `tier1Synthetic` | benchmark | `RunTask` | `14593.848` | `18378.127` | `+3784.279` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.243` | `272.441` | `+252.198` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `124.567` | `160.134` | `+35.567` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `150.277` | `204.116` | `+53.839` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `36.859` | `48.837` | `+11.978` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `41.282` | `70.892` | `+29.610` |

Worktree deltas versus the previous queued-image checkpoint:

| Scene | Phase | Metric | Queued-image rerun | Locality rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `434.401` | `576.737` | `+142.336` |
| `settings` | benchmark | `RunTask` | `29680.224` | `44650.901` | `+14970.677` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.593` | `755.065` | `+261.472` |
| `settings` | overview horizontal pan slow | `Paint` | `42.497` | `50.665` | `+8.168` |
| `settings` | overview vertical pan slow | `Paint` | `57.981` | `78.800` | `+20.819` |
| `settings` | overview-to-detail zoom slow | `Paint` | `17.843` | `19.570` | `+1.727` |
| `settings` | detail-to-overview zoom slow | `Paint` | `22.539` | `28.621` | `+6.082` |
| `tier1Synthetic` | benchmark | `Paint` | `762.591` | `1049.454` | `+286.863` |
| `tier1Synthetic` | benchmark | `RunTask` | `14109.314` | `18378.127` | `+4268.813` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.719` | `272.441` | `+251.722` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `125.234` | `160.134` | `+34.900` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `153.553` | `204.116` | `+50.563` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `37.403` | `48.837` | `+11.434` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `39.140` | `70.892` | `+31.752` |

Interpretation:

- The locality cap preserved the fidelity constraint:
  - no return of the old simplified placeholder path
  - CDP sanity checks saw only a small local preview set
- But performance regressed sharply instead of improving.
- Relative to untouched `main`, both canonical scenes are still deeply paint-regressed and now also clearly worse on `RunTask` and `UpdateLayoutTree`.
- Relative to the recalibrated retained baseline, the locality probe is strictly worse across every key phase that matters for this plan.
- Relative to the immediate queued-image checkpoint, the locality probe also regressed materially:
  - `settings` benchmark `Paint` got `142.336ms` worse
  - `tier1Synthetic` benchmark `Paint` got `286.863ms` worse
  - both scenes added large `RunTask` and `UpdateLayoutTree` cost
- Best current read:
  - aggressively evicting preview caches when sections fall out of the warm neighborhood likely introduces fresh capture churn and extra relayout/repaint work
  - the visible overlay count became smaller, but the churn cost more than it saved

Conclusion:

- Reject this preview-locality probe.
- Do not treat the locality-capped implementation as a keep for the hybrid-rendering plan.
- Revert the probe and return the branch to the prior faithful queued-image checkpoint while recording the evidence.
- Next Tier 1 step should avoid repeated preview eviction/re-capture churn:
  - either keep a stable warm pool instead of clearing ready surfaces aggressively
  - or separate capture-retention policy from overlay-visibility policy so locality does not force full cache turnover during motion
