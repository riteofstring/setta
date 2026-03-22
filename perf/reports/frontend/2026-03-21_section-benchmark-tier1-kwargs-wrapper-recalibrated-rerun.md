# Section Benchmark Tier 1 Kwargs Wrapper Recalibrated Rerun

Date: `2026-03-21`

Question:

- After the current retained baseline drifted sharply on the present environment, does the previously rejected kwargs-wrapper collapse become acceptable when re-evaluated against the recalibrated `2026-03-21` retained baseline instead of the stale March 20 anchor?

Implementation under test:

- Experimental change under test:
  - move the kwargs strip alignment onto the outer `section-args` host
  - remove the extra intermediate wrapper around the `Args` label plus action buttons
  - keep the same action buttons, icon glyph hosts, filter field, and steady-state layout contract
- Experimental files under test:
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Section/SectionParts/kwargsControlsStyles.ts`
  - focused tests:
    - `frontend/src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts`
    - `frontend/src/components/Section/SectionParts/kwargsControlsStyles.test.ts`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-kwargs-wrapper-recalibrated-rerun`
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
- Same browser/frontend pair used for the reruns:
  - worktree browser CDP `http://127.0.0.1:9233`
  - worktree frontend `http://127.0.0.1:3011`
  - untouched `main` browser CDP `http://127.0.0.1:9309`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Focused automated verification while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Section/SectionParts/getKwargsControlsRenderModel.test.ts src/components/Section/SectionParts/kwargsControlsStyles.test.ts`
    - `2` files passed
    - `5` tests passed
- Fresh subagent CDP check while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3011/benchmark-tier1`
  - both pages loaded normally at ordinary zoom
  - no obvious kwargs-strip visual regression was visible
  - the live DOM probe no longer found the old extra kwargs wrapper markers, which matched the intended collapse

Paired benchmark totals versus the recalibrated retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | recalibrated retained baseline | `436.851` | `31132.744` | `493.197` |
| `settings` | worktree experiment | `419.238` | `30429.139` | `473.408` |
| `settings` | untouched `main` | `90.530` | `33400.580` | `577.233` |
| `tier1Synthetic` | recalibrated retained baseline | `749.086` | `14593.848` | `20.243` |
| `tier1Synthetic` | worktree experiment | `721.380` | `14293.115` | `19.180` |
| `tier1Synthetic` | untouched `main` | `14.057` | `14240.631` | `18.826` |

Authoritative worktree deltas versus the recalibrated retained baseline:

| Scene | Phase | Metric | Baseline | First rerun | Confirmation rerun | Confirmation delta |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `436.851` | `419.238` | `461.457` | `+24.606` |
| `settings` | benchmark | `RunTask` | `31132.744` | `30429.139` | `34330.932` | `+3198.188` |
| `settings` | benchmark | `UpdateLayoutTree` | `493.197` | `473.408` | `657.673` | `+164.476` |
| `settings` | overview horizontal pan slow | `Paint` | `38.267` | `38.426` | `38.962` | `+0.695` |
| `settings` | overview vertical pan slow | `Paint` | `61.247` | `57.859` | `60.018` | `-1.229` |
| `tier1Synthetic` | benchmark | `Paint` | `749.086` | `721.380` | `717.156` | `-31.930` |
| `tier1Synthetic` | benchmark | `RunTask` | `14593.848` | `14293.115` | `14204.029` | `-389.819` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `20.243` | `19.180` | `18.838` | `-1.405` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `124.567` | `119.098` | `112.037` | `-12.530` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `150.277` | `143.298` | `142.746` | `-7.531` |

Interpretation:

- The first paired matrix looked promising after recalibration:
  - both canonical scenes improved on the benchmark totals
  - `settings` modestly improved instead of repeating the earlier obvious loss
- That was not robust enough to accept immediately because the mandatory real-scene decision still needed same-code confirmation.
- The same-code worktree-only confirmation rerun broke the apparent win:
  - `settings` benchmark totals moved back above the recalibrated retained baseline on all three core metrics
  - the synthetic scene stayed better, but the real `settings` target did not hold the gain
- Strongest read:
  - the kwargs-wrapper collapse is now best described as unstable on the current environment
  - it may occasionally land slightly better than the recalibrated retained baseline, but it does not hold that win reliably enough on `settings`
  - that is not strong enough to keep as a retained Tier 1 simplification

Conclusion:

- Reject this recalibrated kwargs-wrapper-collapse experiment as a keep for `HEAD`.
- Revert the experiment after recording the docs.
- Keep the methodological result:
  - the March 21 recalibration was necessary and correct
  - but even after recalibration, the kwargs-shell seam is still not a reliable retained win
- Next direction:
  - stop spending immediate cycles on the repeated section-card/header/kwargs shell
  - reopen seam discovery on a different dense Tier 1 row/body path before making the next implementation cut
