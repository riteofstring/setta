# Section Benchmark Tier 1 Image Preview Queue Rerun

Date: `2026-03-25`

Question:

- Does replacing the unacceptable Tier 1 placeholder preview with faithful SnapDOM overlays, plus serializing preview capture work, materially improve the canonical `settings` and `tier1Synthetic` motion benchmarks enough to count as a keep for the hybrid-rendering plan?

Implementation under test:

- Correctness fix already committed:
  - `21668877e` `Replace Tier 1 placeholder previews with cached SnapDOM overlays`
- Follow-up runtime correction under benchmark:
  - `afbfe7d1f` `Serialize Tier 1 preview capture work and cover it in Playwright`
- Product behavior under test:
  - keep the live Tier 1 body mounted
  - never swap to the old simplified bars/chips placeholder subtree
  - seed exact SnapDOM image previews after motion settles
  - serialize preview capture work instead of starting all SnapDOM jobs at once
- Experimental files under test:
  - `frontend/src/components/Section/Layouts/Tier1DenseParamSectionPreview.tsx`
  - `frontend/src/components/Section/Container/SectionBodyGate.tsx`
  - `frontend/tests/e2e/settings/settings-pan-zoom-preview.spec.ts`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-25_section-benchmark-tier1-image-preview-queue-rerun`
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
- Same browser/frontend pair used for the rerun:
  - worktree browser CDP `http://127.0.0.1:9233`
  - worktree frontend `http://127.0.0.1:3011`
  - untouched `main` browser CDP `http://127.0.0.1:9309`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Reinstalled canonical scenes immediately before the rerun:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py settings --state-root ../setta/setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root ../setta/setta_files_dev`
- Focused automated verification on the queued path before the benchmark write-up:
  - `pnpm -C frontend exec vitest run src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionPreview.test.tsx`
    - `2` files passed
    - `8` tests passed
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-pan-zoom-preview.spec.ts`
    - `1` test passed in about `24.3s`
  - filtered `tsc` on `Tier1DenseParamSectionPreview`, `SectionBodyGate`, and `settings-pan-zoom-preview` returned no matching diagnostics

Paired benchmark totals versus untouched `main`:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | untouched `main` | `83.025` | `34120.770` | `525.004` |
| `settings` | worktree queued-image path | `434.401` | `29680.224` | `493.593` |
| `tier1Synthetic` | untouched `main` | `16.993` | `15099.165` | `19.599` |
| `tier1Synthetic` | worktree queued-image path | `762.591` | `14109.314` | `20.719` |

Authoritative worktree deltas versus untouched `main`:

| Scene | Phase | Metric | Untouched `main` | Worktree | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `83.025` | `434.401` | `+351.376` |
| `settings` | benchmark | `RunTask` | `34120.770` | `29680.224` | `-4440.546` |
| `settings` | benchmark | `UpdateLayoutTree` | `525.004` | `493.593` | `-31.411` |
| `settings` | overview horizontal pan slow | `Paint` | `0.000` | `42.497` | `+42.497` |
| `settings` | overview vertical pan slow | `Paint` | `0.000` | `57.981` | `+57.981` |
| `settings` | overview-to-detail zoom slow | `Paint` | `5.592` | `17.843` | `+12.251` |
| `settings` | detail-to-overview zoom slow | `Paint` | `5.872` | `22.539` | `+16.667` |
| `tier1Synthetic` | benchmark | `Paint` | `16.993` | `762.591` | `+745.598` |
| `tier1Synthetic` | benchmark | `RunTask` | `15099.165` | `14109.314` | `-989.851` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `19.599` | `20.719` | `+1.120` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `0.000` | `125.234` | `+125.234` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `0.000` | `153.553` | `+153.553` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `4.247` | `37.403` | `+33.156` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `3.317` | `39.140` | `+35.823` |

Worktree deltas versus the recalibrated retained baseline:

| Scene | Phase | Metric | Recalibrated baseline | Queued-image rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `436.851` | `434.401` | `-2.450` |
| `settings` | benchmark | `RunTask` | `31132.744` | `29680.224` | `-1452.520` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.197` | `493.593` | `+0.396` |
| `settings` | overview horizontal pan slow | `Paint` | `38.267` | `42.497` | `+4.230` |
| `settings` | overview vertical pan slow | `Paint` | `61.247` | `57.981` | `-3.266` |
| `settings` | overview-to-detail zoom slow | `Paint` | `16.371` | `17.843` | `+1.472` |
| `settings` | detail-to-overview zoom slow | `Paint` | `27.138` | `22.539` | `-4.599` |
| `tier1Synthetic` | benchmark | `Paint` | `749.086` | `762.591` | `+13.505` |
| `tier1Synthetic` | benchmark | `RunTask` | `14593.848` | `14109.314` | `-484.534` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.243` | `20.719` | `+0.476` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `124.567` | `125.234` | `+0.667` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `150.277` | `153.553` | `+3.276` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `36.859` | `37.403` | `+0.544` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `41.282` | `39.140` | `-2.142` |

Interpretation:

- The queued image-preview path fixes the unacceptable visual behavior, but it does not materially solve the benchmarked paint problem.
- Relative to untouched `main`, both canonical scenes remain overwhelmingly paint-regressed:
  - `settings` full-window `Paint` is still `+351.376ms`
  - `tier1Synthetic` full-window `Paint` is still `+745.598ms`
  - the slow overview pans remain the clearest failure points on both scenes
- Relative to the recalibrated retained baseline, the queued-image path is effectively flat:
  - `settings` full-window `Paint` improves by only `2.450ms`
  - `tier1Synthetic` full-window `Paint` gets `13.505ms` worse
  - the main measurable win is lower `RunTask`, not a real collapse in the motion-paint budget
- Direct live probing from the same work session explains the mixed result:
  - serializing captures reduced the initial all-at-once `pending` burst after the first pan
  - but the benchmark still spends large paint time drawing the exact image overlays during later motion
  - that means the correctness fix is worth keeping, but it is not the performance completion point for the hybrid-rendering plan

Conclusion:

- Keep the faithful image-preview path and the queued capture correction as product-correctness fixes.
- Reject this queued-image checkpoint as the performance-complete Tier 1 solution for the hybrid-rendering plan.
- The next Tier 1 move should target capture locality and preview scope rather than fidelity mechanics:
  - reduce how many sections can become preview-ready at once
  - bias toward a small warm neighborhood instead of letting the whole overview canvas accumulate ready image surfaces
  - re-run the same paired matrix after that narrowing before calling Tier 1 complete
