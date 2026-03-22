# Section Benchmark Tier 1 Paint Containment Rerun

Date: `2026-03-20`

Question:

- Does extending the accepted Tier 1 row containment from `layout` to `layout paint` reduce repeated row paint enough to keep as the next accepted checkpoint after nested-guide removal?

Implementation under test:

- Experimental change under test:
  - change the existing accepted row containment in `frontend/index.css` from:
    - `contain: layout`
  - to:
    - `contain: layout paint`
  - on the same repeated Tier 1 row surfaces:
    - `.section-param-row`
    - `.section-param-row > .section-key.param-row-label`
    - `.section-param-row > .section-key-value.param-row-label`
    - `.section-param-row > .section-value`
- Intended structural effect:
  - keep the same row contract and DOM
  - add paint isolation to the already accepted layout-containment boundary

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-paint-containment-rerun`
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

- `pnpm -C frontend exec vitest run src/components/Params/ParamRowShell.test.tsx src/components/Params/paramRowClassNames.test.ts src/components/Params/GroupContainer.test.tsx src/components/Section/Layouts/Tier1DenseParamSectionBody.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Container/SectionBodyGate.test.tsx src/components/Section/Container/sectionBodyModePolicy.test.ts`
  - `9` files passed
  - `34` tests passed

First paired benchmark-window totals after enabling paint containment, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18062.127` | `7.613` | `79.953` | `4084.794` | `55.307` |
| `settings` | worktree | `18452.575` | `374.874` | `79.648` | `4170.026` | `71.044` |
| `tier1Synthetic` | untouched `main` | `17217.925` | `16.296` | `22.031` | `15289.131` | `135.270` |
| `tier1Synthetic` | worktree | `17278.765` | `918.066` | `27.561` | `23110.536` | `158.223` |

Worktree deltas versus the retained nested-guide-removal confirmation baseline:

| Scene | Phase | Metric | Before | First paired rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `374.874` | `+226.637` |
| `settings` | benchmark | `RunTask` | `3235.187` | `4170.026` | `+934.839` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `79.648` | `+12.874` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `66.030` | `+37.641` |
| `settings` | overview horizontal pan slow | `RunTask` | `392.838` | `554.270` | `+161.432` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `65.762` | `+38.606` |
| `settings` | overview vertical pan slow | `RunTask` | `399.964` | `606.777` | `+206.813` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `17.327` | `+8.531` |
| `settings` | overview-to-detail zoom slow | `RunTask` | `150.804` | `187.291` | `+36.487` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `14.515` | `+5.607` |
| `settings` | detail-to-overview zoom slow | `RunTask` | `148.146` | `157.170` | `+9.024` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `918.066` | `+92.067` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `23110.536` | `+9838.996` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `27.561` | `+9.279` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `175.067` | `+29.110` |
| `tier1Synthetic` | overview horizontal pan slow | `RunTask` | `2360.678` | `4641.549` | `+2280.871` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `191.595` | `+32.150` |
| `tier1Synthetic` | overview vertical pan slow | `RunTask` | `2726.111` | `4928.287` | `+2202.176` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `47.360` | `+6.831` |
| `tier1Synthetic` | overview-to-detail zoom slow | `RunTask` | `571.405` | `997.298` | `+425.893` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `44.914` | `+1.580` |
| `tier1Synthetic` | detail-to-overview zoom slow | `RunTask` | `433.607` | `626.307` | `+192.700` |

CDP structural and visual sanity while the experiment was live:

- Live worktree `settings` stayed booted and navigable in headed Chrome.
- The `Settings` page still rendered the expected overview and dense settings cards during the experiment.
- No obvious section collapse was observed in the quick CDP sanity pass, but the metrics were already bad enough that deeper visual validation was not justified before reverting.

Post-revert live sanity:

- After reverting `frontend/index.css`, the worktree `settings` page returned to the retained baseline:
  - `.react-flow__viewport` present:
    - `true`
  - `[id$="-ParamInput"]` count:
    - `215`
  - `[id$="-ParamInput"] .cm-line` count:
    - `215`

Interpretation:

- Paint containment is not helping this row stack.
- It is materially worse on both canonical scenes:
  - `settings` gets much worse on `Paint`, `RunTask`, and `UpdateLayoutTree`
  - `tier1Synthetic` also gets worse on all of those metrics
- Read:
  - adding `paint` containment at this boundary likely increases the amount of isolated paint work instead of reducing it
  - this is now another rejected lane in the shared row containment family
  - keep the accepted `layout` containment only

Conclusion:

- Reject this paint-containment experiment.
- Revert the CSS change and keep the retained nested-guide-removal baseline at `HEAD`.
- Continue the next Tier 1 pass outside the immediate row-containment family:
  - different row/body ownership cleanup
  - or another repeated non-preview structure change
  - but not a broader `contain: paint` rollout on the same row shells
