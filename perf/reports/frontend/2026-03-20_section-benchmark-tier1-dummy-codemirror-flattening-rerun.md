# Section Benchmark Tier 1 DummyCodeMirror Flattening Rerun

Date: `2026-03-20`

Question:

- Does flattening inactive `DummyCodeMirror` preview DOM remove enough repeated Tier 1 paint/DOM cost to keep as the next accepted checkpoint after nested-guide removal?

Implementation under test:

- Experimental change under test:
  - flatten `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` so inactive previews stop rendering per-line `.cm-line` wrappers
  - render parser-highlighted output as a flat token stream instead of rebuilding per-line `RangeSetBuilder` / `Decoration` output
  - keep `TextInputCodeMirror` behavior the same apart from the typed activation-state plumbing needed by the experiment
- Intended structural effect:
  - preserve inactive preview text, highlighting, and focus behavior
  - remove one repeated wrapper layer from every inactive dummy code/text input

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-dummy-codemirror-flattening-rerun`
- retained baseline for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-nested-guide-removal-rerun`

Method:

- Same canonical scenes and same CDP replay flow as the earlier checkpoints:
  - `settings` targeting `backendArgs`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same live ports at the time of the paired rerun:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - CDP `http://127.0.0.1:9309`
- Ran same-code worktree confirmation reruns for both scenes and stored those summaries in the same artifact root:
  - `worktree-settings-confirmation.summary.json`
  - `worktree-tier1-confirmation.summary.json`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`
  - `2` files passed
  - `7` tests passed
- `pnpm -C frontend exec vitest run src/components/Params/paramRowClassNames.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Params/ParamUIs/TextParamInput.test.tsx`
  - `7` files passed
  - `29` tests passed
- `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "DummyCodeMirror\\.tsx|TextInputCodeMirror\\.tsx"`
  - no matching diagnostics while the experimental code was live

First paired benchmark-window totals after flattening DummyCodeMirror previews, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18050.178` | `7.036` | `68.589` | `3180.035` | `50.834` |
| `settings` | worktree | `18018.074` | `149.024` | `66.520` | `3200.209` | `56.162` |
| `tier1Synthetic` | untouched `main` | `17231.744` | `13.540` | `20.514` | `15172.968` | `120.300` |
| `tier1Synthetic` | worktree | `17100.739` | `792.474` | `18.655` | `13130.617` | `103.195` |

Worktree deltas versus the retained nested-guide-removal confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `149.024` | `+0.787` |
| `settings` | benchmark | `RunTask` | `3235.187` | `3200.209` | `-34.978` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `27.589` | `-0.800` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `27.768` | `+0.612` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `9.685` | `+0.889` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `9.161` | `+0.253` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `792.474` | `-33.525` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `13130.617` | `-140.923` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `140.663` | `-5.294` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `150.767` | `-8.678` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `37.549` | `-2.980` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `45.729` | `+2.395` |

Worktree confirmation rerun versus the same retained nested-guide-removal baseline:

| Scene | Phase | Metric | Before | Confirmation rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `153.234` | `+4.997` |
| `settings` | benchmark | `RunTask` | `3235.187` | `3297.211` | `+62.024` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `26.261` | `-2.128` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `29.577` | `+2.421` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `9.280` | `+0.484` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `11.261` | `+2.353` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `804.049` | `-21.950` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `13365.574` | `+94.034` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `145.404` | `-0.553` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `155.224` | `-4.221` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `39.062` | `-1.467` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `44.206` | `+0.872` |

CDP structural and visual sanity:

- Compared worktree `http://127.0.0.1:3012/settings` against untouched `main` `http://127.0.0.1:3087/settings` in headed Chrome.
- Structural effect is real on the live `settings` page:
  - untouched `main`:
    - `[id$="-ParamInput"]` count: `215`
    - `.cm-line` count: `215`
  - worktree experiment:
    - `[id$="-ParamInput"]` count: `215`
    - `.cm-line` count: `0`
- Representative sampled inactive preview geometry stayed close:
  - untouched `main` sample:
    - text: `300`
    - width: `106.774`
    - height: `8.611`
  - worktree experiment sample:
    - text: `300`
    - width: `109.271`
    - height: `8.537`
- Viewport screenshots did not show an obvious broken layout or collapse on the worktree settings page.

Interpretation:

- This experiment did remove repeated preview DOM exactly where intended.
- The first paired rerun looked promising enough to justify confirmation:
  - `tier1Synthetic` improved materially
  - `settings` looked close enough to the retained baseline that it could have been noise
- The same-code confirmation rerun resolves the ambiguity in the wrong direction for acceptance:
  - `settings` aggregate `Paint` regresses by `4.997ms`
  - `settings` aggregate `RunTask` regresses by `62.024ms`
  - `settings` detail-to-overview zoom `Paint` regresses by `2.353ms`
  - `tier1Synthetic` still improves on aggregate `Paint`, but not strongly enough to outweigh the failed `settings` confirmation
- Read:
  - flattening inactive DummyCodeMirror markup alone is a real DOM simplification
  - but this seam is not a reliable next keep for the canonical real-project benchmark
  - the remaining hot path is still better explained by broader repeated row/body paint or layout cost than by `.cm-line` wrappers alone

Conclusion:

- Reject this DummyCodeMirror flattening experiment.
- Revert the uncommitted code changes and keep the retained nested-guide-removal baseline at `HEAD`.
- Continue the next Tier 1 pass in the same class as the accepted checkpoints:
  - repeated dense-row chrome simplification
  - deeper shared param-row/body DOM reduction
  - shared ownership cleanup around the repeated Tier 1 body stack
