# Section Benchmark Tier 1 Text Input Border Simplification Rerun

Date: `2026-03-20`

Question:

- Does replacing the dense text-param underline pseudo-element with a direct `border-bottom` preserve the look closely enough while still improving Tier 1 pan/zoom?

Implementation under test:

- Experimental text-input wrapper simplification in:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- Behavior under test:
  - replace the dense text-input wrapper `after` underline pseudo-element
  - use a direct `border-bottom` plus `focus-within:border-blue-400`
  - keep the rest of the row and input structure unchanged

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-text-input-border-simplification-rerun`
- previous accepted checkpoint for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-nested-guide-removal-rerun`

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
- Also ran same-code worktree confirmation reruns for both scenes because the first paired matrix split in opposite directions:
  - `worktree-settings-confirmation.summary.json`
  - `worktree-tier1-confirmation.summary.json`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx`
  - `6` files passed
  - `19` tests passed
- `pnpm -C frontend exec vitest run src/components/Params/ParamUIs/TextParamInput.test.tsx`
  - `1` file passed
  - `10` tests passed

First paired rerun read versus the retained nested-guide-removal confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `138.465` | `-9.772` |
| `settings` | benchmark | `RunTask` | `3235.187` | `3155.709` | `-79.478` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `23.975` | `-4.414` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `25.472` | `-1.684` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `8.690` | `-0.106` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `8.878` | `-0.030` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `823.881` | `-2.118` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `13297.560` | `+26.020` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `158.183` | `+12.226` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `160.434` | `+0.989` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `38.552` | `-1.977` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `41.431` | `-1.903` |

Worktree confirmation rerun versus the same retained nested-guide-removal baseline:

| Scene | Phase | Metric | Before | Confirmation rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `139.139` | `-9.098` |
| `settings` | benchmark | `RunTask` | `3235.187` | `3160.628` | `-74.559` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `25.250` | `-3.139` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `25.742` | `-1.414` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `8.334` | `-0.462` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `9.453` | `+0.545` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `833.867` | `+7.868` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `13599.069` | `+327.529` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `148.415` | `+2.458` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `163.082` | `+3.637` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `39.134` | `-1.395` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `45.105` | `+1.771` |

Interpretation:

- This experiment helps `settings`.
- It does not hold up on the canonical Tier 1 synthetic scene.
- The split is stable enough to reject:
  - `settings` improves on both the first paired pass and the confirmation rerun
  - `tier1Synthetic` becomes mixed on the first paired pass and regresses on the confirmation rerun
- Read:
  - simplifying the text-input underline chrome in isolation is too local
  - the benefit is real for the real `settings` scene, but it is not robust enough across the canonical Tier 1 benchmark to justify keeping this visual change at `HEAD`

Conclusion:

- Reject this text-input border simplification.
- Revert the production code back to the retained nested-guide-removal baseline.
- Preserve this report only as an append-only dead-end record.
