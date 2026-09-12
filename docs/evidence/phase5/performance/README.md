# Phase 5 large-document performance profile

This bundle baselines and remeasures the extracted package's production canvas at the Phase 5
large-document milestone. It is performance evidence only: it neither replaces the accepted visual
baselines nor claims developer approval of a new visual state.

## Harness

`pnpm run performance:profile` builds `@setta/workspace` and the playground, serves the production
playground, launches an isolated headless Chrome profile, and drives the query-only
`?performance-profile` route through the Chrome DevTools Protocol. The route uses only the normal
registered `leaf` renderer and public package composition (`WorkspaceCanvas`, `WorkspaceControls`,
the minimap, and `WorkspaceTooltip`). Its deterministic document contains:

- 256 fixed-size top-level leaves in a 16 by 16 grid;
- a 4,295 by 2,642 workspace-unit extent;
- one named, initially visible drag target; and
- 20 initially visible sections at the fixed 1,492 by 696 CSS-pixel, DPR 1 profile viewport.

Each of three passes records a fresh production render, a 96-move empty-pane pan, and a 96-move
top-level section drag. The in-page probe records pointer-handler spans, target mutations,
animation-frame gaps, long tasks, and page-scroll drift; CDP supplies script, task, style, and layout
metrics. The runner fails on browser warnings/errors, fixture or canvas-geometry drift, missing
sustained mutations, missing nodes, or host-page scrolling. Timing values are machine-local
evidence, not portable CI thresholds. Each raw result carries the base commit, Chrome/Node/machine
context, fixture contract, and hashes of both production artifacts and profile inputs.

The probe mechanism was considered individually from `workspace-blank-slate`'s interaction and
culling profilers and reimplemented around this package's actual DOM and zero-new-dependency CDP
runner. None of that branch's workspace engine, culling architecture, visual fixture, Playwright
stack, or thresholds was adopted.

## Baseline and change

Frozen main's `NodeRenderer` maps every node-internals id to a mounted `NodeWrapper`; it has no
viewport-culling owner. The extraction preserved that behavior. The baseline therefore uses the
committed implementation at `05eb8033b`, which also preserves main's `_.cloneDeep` of the complete
node-internals map on every drag-position, temporary-z-order, and ResizeObserver publication. It
was built and measured from a disposable detached worktree with the final harness overlaid; the
worktree was removed immediately after capture.

The remeasurement changes only node-internals publication: it shallow-copies the map, publishes a
new record for each moved or remeasured node, and changes temporary-z-order record identities only
where the computed value changes. It retains the reference's published drag-position object and
the same full-map Zustand publication, canonical drag-end commit, z-order values, DOM, and rendered
geometry. Focused identity/value regressions freeze those boundaries.

## Results

Both captures used Chrome 151.0.7922.110, Node 25.2.1, macOS arm64, eight logical CPUs, and three
passes. Values below are the raw summaries; `median` is across the three passes and `max` is the
worst pass.

| Measurement                                 | Inherited baseline | Optimized | Result                                      |
| ------------------------------------------- | -----------------: | --------: | ------------------------------------------- |
| Initial node-ready, median                  |           216.6 ms |  216.9 ms | unchanged                                   |
| Initial settled, median                     |           237.9 ms |  237.3 ms | unchanged                                   |
| Initial long task, max                      |           182.0 ms |  167.0 ms | no regression claim; cold mount remains     |
| Mounted / visible / mounted offscreen nodes |     256 / 20 / 236 | identical | exact frozen-main all-mounted behavior      |
| Empty-pane pan script, median               |           235.9 ms |  234.9 ms | unchanged                                   |
| Empty-pane pan sustained frame gap, max     |            16.8 ms |   17.0 ms | unchanged; no long tasks                    |
| Drag activation frame gap, max              |             9.3 ms |    9.2 ms | unchanged                                   |
| Drag sustained frame gap, max               |             9.3 ms |    9.4 ms | unchanged; no long tasks                    |
| Drag script, median                         |           138.9 ms |  103.5 ms | 25.5% less script work                      |
| Drag task time, median                      |           328.1 ms |  285.6 ms | 13.0% less task time                        |
| First drag-target mutation, median          |             8.5 ms |   12.4 ms | both within one 60 Hz frame; no speed claim |

The profile establishes a specific, repeatable optimization target and shows that the narrow
publication change removes material sustained-drag scripting without shifting the render or pan
workload. It does not justify adding viewport culling: all 256 reference-parity nodes become ready
in about 217 ms, and the fully mounted document sustains both measured gestures without long tasks
or repeatable skipped frames. Adding culling would introduce new focus, measurement, selection,
minimap, and hit-testing behavior without a measured interaction defect.

Raw traces:

- [`baseline-production-profile.json`](./baseline-production-profile.json)
- [`optimized-production-profile.json`](./optimized-production-profile.json)

The frozen reference remained clean at `043d3b2e9`. No dependency changed.
