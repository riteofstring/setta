# Section Benchmark Tier 1 Text-Family Plain Preview Rerun

Date: `2026-03-20`

Question:

- Does replacing the inactive text-family preview path with a plain-text dummy surface remove enough repeated Tier 1 row paint/DOM cost to keep as the next accepted checkpoint after nested-guide removal?

Implementation under test:

- Experimental change under test:
  - add an `inactivePreviewMode` seam in `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - add a `plainText` inactive preview mode in `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
  - route `CodeParam`, `TextParam`, and `TextAreaParam` through that plain-text inactive preview path from `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - keep the activated real CodeMirror path unchanged
- Intended structural effect:
  - replace the inactive tokenized dummy CodeMirror subtree with a single focusable text root
  - keep the same row shell, same activation semantics, and same real editor mount path

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-text-family-plain-preview-rerun`
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
- No same-code confirmation rerun was run:
  - the first paired matrix already regressed both canonical scenes strongly enough to reject the experiment immediately

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Params/ParamUIs/TextParamInput.test.tsx`
  - `6` files passed
  - `21` tests passed
- Narrow filtered `tsc` note:
  - the repo still reports many existing baseline diagnostics under the broad `ParamUI` / `TextInputCodeMirror` filter
  - used the focused Vitest sweep plus the benchmark matrix as the acceptance gate for this experiment

First paired benchmark-window totals after enabling plain-text inactive previews, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18260.672` | `10.403` | `88.949` | `3859.774` | `56.419` |
| `settings` | worktree | `18283.895` | `182.787` | `86.767` | `4171.807` | `60.453` |
| `tier1Synthetic` | untouched `main` | `17198.792` | `17.588` | `28.595` | `24517.588` | `153.458` |
| `tier1Synthetic` | worktree | `17180.242` | `1056.290` | `28.349` | `23590.827` | `132.674` |

Worktree deltas versus the retained nested-guide-removal confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `182.787` | `+34.550` |
| `settings` | benchmark | `RunTask` | `3235.187` | `4171.807` | `+936.620` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `34.110` | `+5.721` |
| `settings` | overview horizontal pan slow | `RunTask` | `392.838` | `457.422` | `+64.584` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `32.977` | `+5.821` |
| `settings` | overview vertical pan slow | `RunTask` | `399.964` | `506.251` | `+106.287` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `12.253` | `+3.457` |
| `settings` | overview-to-detail zoom slow | `RunTask` | `150.804` | `209.256` | `+58.452` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `11.305` | `+2.397` |
| `settings` | detail-to-overview zoom slow | `RunTask` | `148.146` | `223.042` | `+74.896` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `1056.290` | `+230.291` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `23590.827` | `+10319.287` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `217.232` | `+71.275` |
| `tier1Synthetic` | overview horizontal pan slow | `RunTask` | `2360.678` | `4570.513` | `+2209.835` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `206.445` | `+47.000` |
| `tier1Synthetic` | overview vertical pan slow | `RunTask` | `2726.111` | `4586.365` | `+1860.254` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `61.227` | `+20.698` |
| `tier1Synthetic` | overview-to-detail zoom slow | `RunTask` | `571.405` | `1052.357` | `+480.952` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `51.905` | `+8.571` |
| `tier1Synthetic` | detail-to-overview zoom slow | `RunTask` | `433.607` | `603.292` | `+169.685` |

CDP structural and visual sanity while the experiment was live:

- Compared worktree `http://127.0.0.1:3012/settings` against untouched `main` `http://127.0.0.1:3087/settings` in headed Chrome.
- Structural effect was real on both live worktree benchmark pages:
  - worktree `settings`:
    - `[id$="-ParamInput"]` count: `215`
    - `[id$="-ParamInput"] .cm-line` count: `0`
    - sampled inactive value roots were direct `DIV` nodes with `childCount: 0`
  - worktree `benchmark-tier1` after broadening the experiment to the whole text family:
    - `[id$="-ParamInput"]` count: `210`
    - roots with `.cm-line`: `0`
    - flat value roots: `210`
- The visual drift was expected but not catastrophic:
  - inactive text/code previews lost syntax/token coloring
  - no obvious section collapse or broken activation surface was observed during the live sanity pass

Post-revert live sanity:

- After restoring the tracked files from `HEAD` and forcing Vite to invalidate the touched modules:
  - worktree `settings` returned to:
    - `[id$="-ParamInput"]` count: `215`
    - `[id$="-ParamInput"] .cm-line` count: `215`
  - worktree `benchmark-tier1` returned to:
    - `[id$="-ParamInput"]` count: `210`
    - `[id$="-ParamInput"] .cm-line` count: `294`

Interpretation:

- This experiment absolutely changed the intended row family:
  - the inactive text-family preview path was flattened into a direct plain-text root on both canonical scenes
  - the heavy value-side `.cm-line` path dropped to zero while the experiment was live
- Despite that large DOM-shape change, the performance result is decisively negative:
  - both canonical scenes regressed on aggregate benchmark `Paint`
  - both canonical scenes regressed on aggregate benchmark `RunTask`
  - all of the representative slow pan/zoom phases also regressed
- Read:
  - the remaining Tier 1 hot path is not helped by replacing the inactive text/code preview with a plain-text root
  - this is now another rejected member of the `TextInputCodeMirror` / `DummyCodeMirror` preview-simplification family
  - further immediate effort in this exact inactive-preview simplification lane is not justified without a materially different render-mode strategy

Conclusion:

- Reject this text-family plain-preview experiment.
- Revert the code changes and keep the retained nested-guide-removal baseline at `HEAD`.
- Continue the next Tier 1 pass outside the immediate text-family inactive-preview simplification lane:
  - deeper shared row/body ownership cleanup
  - repeated non-preview row/body structure
  - or a different render-mode strategy that changes more than just the blurred text/code preview substrate
