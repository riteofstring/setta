# Section Benchmark Tier 1 Leaf-Row Shell Collapse Rerun

Date: `2026-03-20`

Question:

- Does collapsing the repeated Tier 1 leaf-row name/value shell into the `TextInputCodeMirror` roots remove enough repeated row structure to keep as the next accepted checkpoint after nested-guide removal?

Implementation under test:

- Experimental change under test:
  - remove the extra name-input wrapper in `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - remove the extra text/code value wrapper in `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - thread the shell classes and label-shape marker through `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - update `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` and `frontend/index.css` so the flattened CodeMirror roots carry the wrapper semantics directly
- Intended structural effect:
  - make the name-editable label root and text/code value root direct `.section-param-row` children in dense Tier 1 rows
  - delete one repeated wrapper layer around each affected leaf-row label/value path

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-leaf-row-shell-collapse-rerun`
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

- `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Params/ParamContainer.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Params/ParamUIs/TextParamInput.test.tsx`
  - `7` files passed
  - `28` tests passed
- `pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | rg "TextInputCodeMirror\\.tsx|DummyCodeMirror\\.tsx|ParamNameInput\\.tsx|ParamUI\\.tsx"`
  - still reported the existing baseline diagnostics in these files
  - treated Vitest plus the benchmark matrix as the acceptance gate for this experiment

First paired benchmark-window totals after collapsing the leaf-row shell, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18066.150` | `8.221` | `80.647` | `3822.260` | `55.770` |
| `settings` | worktree | `18085.151` | `182.938` | `85.411` | `3681.642` | `60.417` |
| `tier1Synthetic` | untouched `main` | `23177.591` | `14.993` | `26.379` | `23041.808` | `136.295` |
| `tier1Synthetic` | worktree | `23598.609` | `1064.228` | `26.823` | `22421.685` | `131.276` |

Worktree deltas versus the retained nested-guide-removal confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `182.938` | `+34.701` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `85.411` | `+18.637` |
| `settings` | benchmark | `RunTask` | `3235.187` | `3681.642` | `+446.455` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `33.540` | `+5.151` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `31.750` | `+4.594` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `12.610` | `+3.814` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `12.352` | `+3.444` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `1064.228` | `+238.229` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `26.823` | `+8.541` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `22421.685` | `+9150.145` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `213.749` | `+67.792` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `203.954` | `+44.509` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `49.253` | `+8.724` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `58.523` | `+15.189` |

CDP structural and visual sanity:

- While the experimental code was live, the structural collapse was real on the worktree pages:
  - `benchmark-tier1` sampled name-editable leaf row:
    - the `[data-param-label-shape]` label root became a direct `.section-param-row` child
    - the `.peer/textinput` value root also became a direct `.section-param-row` child
    - the sampled row children became:
      - direct label root
      - direct value root
      - resize handle
      - connector SVG
  - `settings` sampled text/code row:
    - the `.peer/textinput` root became a direct `.section-param-row` child instead of living under the old `.section-value` wrapper
- After rejecting and reverting the experiment, headed Chrome sanity on the worktree returned to the retained baseline structure:
  - `benchmark-tier1` sampled label wrapper reverted to the old outer `.section-key...` host that owns the `data-param-label-shape`
  - `settings` sampled `.peer/textinput` reverted to living inside the `.section-value` wrapper rather than directly on the row
- No obvious broken layout or collapse showed up in the viewport compare while the experiment was live; the problem is performance, not visible correctness.

Interpretation:

- This experiment did remove exactly the wrapper layers it targeted.
- It still regressed both canonical scenes immediately and by a large margin.
- The regression is too broad to treat as run noise:
  - both `settings` and `tier1Synthetic` got worse
  - both aggregate `Paint` and aggregate `RunTask` moved in the wrong direction
  - overview pan and zoom phases also moved in the wrong direction
- Strongest read:
  - moving row-shell ownership into the CodeMirror roots changes invalidation/compositing behavior in a way that is worse than the wrapper count it saves
  - this seam is not a good next keep in its current form
  - the next Tier 1 pass should still target the repeated leaf-row/body ownership seam, but not by pushing the section/value shell classes directly onto `TextInputCodeMirror`

Conclusion:

- Reject this leaf-row shell collapse experiment.
- Revert the uncommitted code changes and keep the retained nested-guide-removal baseline at `HEAD`.
- Continue the next Tier 1 pass toward deeper repeated row/body ownership cleanup or structural reduction, but avoid another immediate attempt that collapses the entire label/value shell directly into CodeMirror roots.
