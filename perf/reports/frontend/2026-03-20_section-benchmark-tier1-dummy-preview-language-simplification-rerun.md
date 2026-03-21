# Section Benchmark Tier 1 Dummy Preview Language Simplification Rerun

Date: `2026-03-20`

Question:

- Does removing inactive syntax highlighting from dense Tier 1 name/text dummy previews remove enough repeated preview subtree cost to keep as the next accepted checkpoint after the rejected leaf-row shell collapse?

Implementation under test:

- Experimental change under test:
  - add a preview-only dummy-language override in `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - pass `dummyLanguage={null}` from `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - disable dummy-preview syntax highlighting for `TextParam` and `TextAreaParam` in `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - keep the real activated CodeMirror language path unchanged
- Intended structural effect:
  - preserve the active editor path exactly
  - reduce inactive preview token/span output for repeated dense Tier 1 name and text rows

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-dummy-preview-language-simplification-rerun`
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
- Did not run same-code confirmation reruns because the first paired matrix already regressed both canonical scenes strongly enough to fail the keep threshold.

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Params/ParamUIs/TextParamInput.test.tsx`
  - `5` files passed
  - `19` tests passed
- `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "TextInputCodeMirror\\.tsx|ParamNameInput\\.tsx|ParamUI\\.tsx"`
  - still reported the same existing baseline diagnostics in these files
  - treated Vitest plus the benchmark matrix as the acceptance gate for this experiment

First paired benchmark-window totals after simplifying dummy preview languages, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18058.572` | `8.017` | `87.313` | `3846.552` | `57.715` |
| `settings` | worktree | `18164.778` | `177.597` | `84.751` | `3646.766` | `59.351` |
| `tier1Synthetic` | untouched `main` | `22915.844` | `16.300` | `29.118` | `22779.471` | `136.203` |
| `tier1Synthetic` | worktree | `23481.480` | `1020.548` | `29.570` | `22593.447` | `132.243` |

Worktree deltas versus the retained nested-guide-removal confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `177.597` | `+29.360` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `84.751` | `+17.977` |
| `settings` | benchmark | `RunTask` | `3235.187` | `3646.766` | `+411.579` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `33.660` | `+5.271` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `33.251` | `+6.095` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `11.020` | `+2.224` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `11.233` | `+2.325` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `1020.548` | `+194.549` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `29.570` | `+11.288` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `22593.447` | `+9321.907` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `217.881` | `+71.924` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `200.714` | `+41.269` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `45.128` | `+4.599` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `51.804` | `+8.470` |

CDP structural and visual sanity:

- On live worktree `benchmark-tier1` while the experiment was active:
  - sampled `ParamNameInput` preview span count dropped from `1` to `0`
  - sampled text-input preview span count stayed at `1`
  - the experiment therefore really did remove the name-preview syntax highlight token wrapper
- On live worktree `settings` while the experiment was active:
  - the heaviest sampled row still had `55` descendants and `50` spans
  - the worktree page still showed `283` spans under `.section-param-row`
  - this indicates the experiment barely touched the real `settings` hotspot rows
- After rejecting and reverting the experiment:
  - live worktree `benchmark-tier1` returned to the retained baseline with sampled `ParamNameInput` preview span count back at `1`
- No obvious broken layout or collapse showed up while the experiment was live; the failure is performance, not visible correctness.

Interpretation:

- This experiment removed real preview syntax-highlight structure, but only in a narrow slice of the dense row stack.
- The benchmark failure is broad enough that there is no case for keeping it:
  - both canonical scenes regressed immediately
  - both aggregate `Paint` and aggregate `RunTask` moved strongly in the wrong direction
- The live DOM read explains why this was a poor target:
  - `benchmark-tier1` name previews changed
  - `settings` barely changed because its heaviest rows are still code-param or non-text-control paths
- Strongest read:
  - dummy-preview-only syntax simplification is not the next keep
  - the next worthwhile target needs to hit the heavier repeated row families that still dominate `settings`
  - likely candidates now sit in the code-param preview path or in repeated non-CodeMirror row surfaces, not in another narrow dummy-preview-only change

Conclusion:

- Reject this dummy preview language simplification experiment.
- Revert the uncommitted code changes and keep the retained nested-guide-removal baseline at `HEAD`.
- Continue the next Tier 1 pass away from narrow inactive-preview-only tweaks that do not materially change the real `settings` hot path.
