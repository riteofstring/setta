# Interaction capture index

These are gzip-compressed Chrome Performance trace JSON files from the frozen `main` reference.
Import a `.json.gz` file into Chrome DevTools' Performance panel to inspect pointer events, main
thread work, rendering, layout, and paint. Durations include the short hold used to make an active
state reviewable; they are not benchmark durations or package performance budgets.

| Trace                                      | Scenario                                                        | Paired visual/result                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `selection-pointer-trace.json.gz`          | Pointer selection on a root leaf title/surface                  | `../screenshots/25-root-callable-selected-with-params-dark.png`                                               |
| `resize-pointer-trace.json.gz`             | Bottom-right resize activation, sustained movement, and release | `../screenshots/07-root-leaf-resized-dark.png`                                                                |
| `move-pointer-trace.json.gz`               | Ordinary root-section surface movement                          | `../screenshots/08-root-leaf-moved-dark.png`                                                                  |
| `sort-within-parent-pointer-trace.json.gz` | Completed horizontal sibling reorder                            | `../screenshots/12-sorted-within-horizontal-parent-dark.png`                                                  |
| `sustained-sort-drag-trace.json.gz`        | Sort held active to show placeholder and overlay                | `../screenshots/13-sort-drag-active-dark.png`                                                                 |
| `invalid-drop-pointer-trace.json.gz`       | Held pointer plus main-derived `INVALID` target feedback        | `../screenshots/14-invalid-drop-feedback-dark.png`                                                            |
| `cross-depth-free-move-trace.json.gz`      | Nested leaf moved into top-level freeform space                 | `../screenshots/18-cross-depth-free-move-dark.png`                                                            |
| `nested-param-drag-trace.json.gz`          | Parameter/item activation, sustained sort, and drop             | `../screenshots/20-nested-param-drag-active-dark.png`, `../screenshots/21-nested-param-drag-dropped-dark.png` |

All files passed `gzip -t`. The source app was a development build, so the interaction latency
values in `../computed/interaction-observations.json` characterize this capture only.
