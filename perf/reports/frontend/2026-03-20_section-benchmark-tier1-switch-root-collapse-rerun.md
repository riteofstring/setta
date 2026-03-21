# Section Benchmark Tier 1 Switch Root Collapse Rerun

Date: `2026-03-20`

Question:

- Does collapsing the repeated `SwitchInput` outer wrapper so the `section-value` grid-child classes live directly on `Switch.Root` help the real `settings` target enough to keep as the next Tier 1 non-code experiment?

Implementation under test:

- Experimental change under test:
  - remove the extra outer `<div>` from:
    - `frontend/src/components/Params/ParamUIs/SwitchInput.tsx`
  - move `outerDivClassName` directly onto `Switch.Root`
  - add focused regression coverage for the new root-owned layout contract in:
    - `frontend/src/components/Params/ParamUIs/SwitchInput.test.tsx`
- Intended structural effect:
  - delete one repeated wrapper from the most common non-code control family on the live `settings` page
  - keep the change local to non-code switch rows instead of revisiting the rejected code-value grid-contract lane

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-switch-root-collapse-rerun`
- retained baseline for comparison:
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
- Fixture readiness note:
  - after the `ai.sh` restart, `tier1Synthetic` had to be reinstalled into both state roots before the synthetic route was benchmark-ready:
    - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root setta_files_dev`
    - `source activate.sh && python perf/scripts/installSectionBenchmarkScene.py tier1Synthetic --state-root ../setta/setta_files_dev`
- Focused validation while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Params/ParamContainer.test.tsx`
    - `5` files passed
    - `7` tests passed

Live-target motivation:

- Fresh subagent inspection of the live worktree `settings` page showed that the dominant repeated non-code control family is switches:
  - `131` switch controls total
  - repeated rows such as `Is Frozen`, `Is Minimized`, and `Position And Size Locked` each appeared `25` times
- That made the switch wrapper a reasonable first probe inside the non-code lane even though the final decision still has to be made by the benchmark pair.

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.237` | `3235.187` | `66.774` |
| `settings` | worktree experiment | `409.236` | `31002.992` | `480.580` |
| `settings` | untouched `main` | `64.641` | `26379.463` | `283.877` |
| `tier1Synthetic` | retained baseline | `825.999` | `13271.540` | `18.282` |
| `tier1Synthetic` | worktree experiment | `718.041` | `14286.408` | `19.341` |
| `tier1Synthetic` | untouched `main` | `15.521` | `13994.838` | `18.699` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `409.236` | `+260.999` |
| `settings` | benchmark | `RunTask` | `3235.187` | `31002.992` | `+27767.805` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `480.580` | `+413.806` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `35.019` | `+6.630` |
| `settings` | overview horizontal pan slow | `RunTask` | `392.838` | `3125.060` | `+2732.222` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `54.958` | `+27.802` |
| `settings` | overview vertical pan slow | `RunTask` | `399.964` | `3272.425` | `+2872.461` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `14.932` | `+6.136` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `22.853` | `+13.945` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `718.041` | `-107.958` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `14286.408` | `+1014.868` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `19.341` | `+1.059` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `122.132` | `-23.825` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `143.127` | `-16.318` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `35.192` | `-5.337` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `38.414` | `-4.920` |

Interpretation:

- This is another asymmetric result that fails the plan’s acceptance rule:
  - the synthetic Tier 1 scene benefits on paint
  - the mandatory real `settings` target gets dramatically worse
- The `settings` regression is too large to treat as noise:
  - aggregate `Paint`, `RunTask`, and `UpdateLayoutTree` all blow up on the first paired rerun
  - every representative slow pan/zoom paint phase also regresses
- No same-code confirmation rerun was justified because the real-project target is already decisively worse.
- Strongest read:
  - the live `settings` page really is dominated by non-code switch/dropdown-style rows
  - but directly collapsing the switch wrapper into `Switch.Root` is the wrong seam
  - the next worthwhile non-code pass should stay at the Dict/plain-label row contract or shared value-host level, not at a single widget’s root element

Conclusion:

- Reject this Tier 1 switch-root collapse as a keep for `HEAD`.
- Revert the in-flight code changes after recording the docs.
- Keep the directional finding:
  - the next high-value non-code experiment should target Dict-heavy plain-label leaf rows with switch/dropdown value bodies, but through a shared row/value seam rather than a direct `Switch.Root` wrapper collapse.
