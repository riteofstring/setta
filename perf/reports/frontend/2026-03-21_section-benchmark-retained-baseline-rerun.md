# Section Benchmark Retained Baseline Rerun

Date: `2026-03-21`

Question:

- Does the current retained `HEAD` baseline still match the March 20 retained benchmark anchor closely enough to keep using that older anchor for accept/reject decisions?

Implementation under test:

- Code under test:
  - current `HEAD` on `frontend-performance-11-hybrid-rendering`
  - no active Tier 1 experiment code applied
  - this should correspond to the retained nested-guide-removal baseline after the recent rejected experiments were reverted

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-retained-baseline-rerun`
- previous retained anchor:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-nested-guide-removal-rerun`

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
- Reinstalled `tier1Synthetic` into both state roots immediately before the rerun:
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root setta_files_dev`
  - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root ../setta/setta_files_dev`

Current retained `HEAD` versus the March 20 retained anchor:

| Scene | Branch | Metric | 2026-03-20 retained | 2026-03-21 rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | worktree | `Paint` | `148.237` | `436.851` | `+288.614` |
| `settings` | worktree | `RunTask` | `3235.187` | `31132.744` | `+27897.557` |
| `settings` | worktree | `UpdateLayoutTree` | `66.774` | `493.197` | `+426.423` |
| `settings` | worktree | overview horizontal pan slow `Paint` | `28.389` | `38.267` | `+9.878` |
| `settings` | worktree | overview vertical pan slow `Paint` | `27.156` | `61.247` | `+34.091` |
| `tier1Synthetic` | worktree | `Paint` | `825.999` | `749.086` | `-76.913` |
| `tier1Synthetic` | worktree | `RunTask` | `13271.540` | `14593.848` | `+1322.308` |
| `tier1Synthetic` | worktree | `UpdateLayoutTree` | `18.282` | `20.243` | `+1.961` |
| `tier1Synthetic` | worktree | overview horizontal pan slow `Paint` | `145.957` | `124.567` | `-21.390` |
| `tier1Synthetic` | worktree | overview vertical pan slow `Paint` | `159.445` | `150.277` | `-9.168` |

Untouched `main` also drifted on `settings`:

| Scene | Branch | Metric | 2026-03-20 retained | 2026-03-21 rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | untouched `main` | `Paint` | `6.931` | `83.902` | `+76.971` |
| `settings` | untouched `main` | `RunTask` | `3252.071` | `32607.980` | `+29355.909` |
| `settings` | untouched `main` | `UpdateLayoutTree` | `68.596` | `530.262` | `+461.666` |
| `tier1Synthetic` | untouched `main` | `Paint` | `13.387` | `14.035` | `+0.648` |

Interpretation:

- The March 20 retained anchor is no longer stable enough to use directly for accept/reject decisions on the current environment.
- The drift is not a tiny fluctuation:
  - the current retained `HEAD` worktree `settings` numbers are now in the same rough band as the last two March 21 experiments that were rejected against the stale anchor
  - untouched `main` `settings` also drifted sharply on the current environment, which confirms this is not just one bad worktree trace
- Consequence:
  - the March 21 kwargs-wrapper and lazy-tooltip “reject” decisions are no longer authoritative relative to the older March 20 anchor
  - their reports remain valid as recorded measurements, but the keep/reject interpretation has to be recalibrated against the new current retained baseline

Conclusion:

- Do not keep using the March 20 retained anchor as the only decision baseline.
- Treat the current `2026-03-21` retained rerun as the new environment-local reference point until a cleaner reset or rerun re-establishes a tighter anchor.
- Re-evaluate the strongest recent experiments against this recalibrated baseline before discarding them permanently.
