# Settings All Settings Pan/Zoom Benchmark

Date: 2026-03-07
Area: frontend
Branch/Commit: frontend-performance-9 @ 17ed8d97c
Related plan: `docs/plans/settings-all-settings-pan-zoom-analysis-plan.md`

## Goal

Measure how much of `All Settings` pan/zoom cost comes from section chrome versus the nested settings param tree.

## Code Paths

- `frontend/src/components/Pages/Project/settingsAllSettingsBenchmark.tsx`
- `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Section/Layouts/DictArea.tsx`
- `frontend/src/components/Section/Layouts/SettingsAllSettingsBenchmarkDictArea.tsx`

## Scenario

- Entry point: `http://127.0.0.1:3009/settings?settingsBenchmarkStage=<stage>`
- Project/view: Settings project, `All Settings`
- Browser + OS: Chrome DevTools MCP, macOS
- Viewport: `1440x1200`
- Fixed viewport transform used for every measured stage:
  - `x = 779.9`
  - `y = -55.7`
  - `zoom = 0.1`

## Measurement Method

For each stage:

1. Navigate to `/settings?settingsBenchmarkStage=<stage>`.
2. Activate `All Settings`.
3. Reapply the fixed viewport transform.
4. Record a DevTools Performance trace during a deterministic sequence:
   - 36 pan frames down/right
   - 36 pan frames up/left
   - 18 zoom-in frames
   - 18 zoom-out frames
5. Collect page-side frame metrics from `requestAnimationFrame` timestamps and record DOM complexity for the live `.react-flow` subtree.

## Iterations

### `frame-only`

- DOM nodes in `.react-flow`: `393`
- Top-level section nodes: `42`
- Param containers: `0`
- Static benchmark rows: `0`
- Average frame time: `8.33ms`
- Approx FPS: `120.10`
- Max frame time: `9.30ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/frame-only-trace.json`
- Observation: The empty section shells keep the same top-level node count but drop the canvas subtree to a very small DOM footprint. Pan/zoom is effectively unconstrained at this stage.

### `header-only`

- DOM nodes in `.react-flow`: `939`
- Top-level section nodes: `42`
- Param containers: `0`
- Static benchmark rows: `0`
- Average frame time: `8.33ms`
- Approx FPS: `120.07`
- Max frame time: `9.40ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/header-only-trace.json`
- Observation: Restoring section headers more than doubles DOM size versus `frame-only`, but the benchmark remains effectively capped by display refresh rather than the canvas content.

### `section-body-shell`

- DOM nodes in `.react-flow`: `1569`
- Top-level section nodes: `42`
- Param containers: `0`
- Static benchmark rows: `0`
- Benchmark shell elements: `168`
- Average frame time: `10.01ms`
- Approx FPS: `99.85`
- Max frame time: `17.70ms`
- Slow frames:
  - `>16.7ms`: `9`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/section-body-shell-trace.json`
- Observation: Restoring the lightweight dict-area shells is the first step that clearly lowers pan/zoom headroom. The canvas is still fast, but section body chrome alone is enough to push some frames over the 16.7ms budget.

### `static-param-list`

- DOM nodes in `.react-flow`: `3773`
- Top-level section nodes: `42`
- Param containers: `0`
- Static benchmark rows: `697`
- Average frame time: `14.53ms`
- Approx FPS: `68.84`
- Max frame time: `258.80ms`
- Slow frames:
  - `>16.7ms`: `24`
  - `>33.3ms`: `2`
  - `>50ms`: `1`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/static-param-list-trace.json`
- Observation: Reintroducing row count without real widgets causes the first major drop. Most of the gap between the stripped shells and the full view appears as soon as the DOM contains hundreds of visible row nodes.
- Steady-state rerun after a `500ms` settle:
  - Average frame time: `11.39ms`
  - Approx FPS: `87.78`
  - Max frame time: `33.30ms`
  - Note: the initial `258.8ms` spike came from residual layout work immediately after the stage switch, not the steady-state pan/zoom loop itself.

### `full`

- DOM nodes in `.react-flow`: `8627`
- Top-level section nodes: `42`
- Param containers: `697`
- Static benchmark rows: `0`
- Average frame time: `26.60ms`
- Approx FPS: `37.59`
- Max frame time: `41.60ms`
- Slow frames:
  - `>16.7ms`: `108`
  - `>33.3ms`: `12`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-trace.json`
- Observation: Restoring the real param widgets and the full interactive section body nearly doubles frame time versus the static row benchmark and drops the canvas into obvious jank territory.
- Steady-state rerun after a `500ms` settle:
  - Average frame time: `23.16ms`
  - Approx FPS: `43.17`
  - Max frame time: `41.60ms`
  - Slow frames `>33.3ms`: `1`

## Conclusion

- The top-level React Flow shell is not the limiting factor. With only frames or headers, pan/zoom stays at roughly `120 FPS`.
- Section body chrome is measurable but not dominant. Moving from `header-only` to `section-body-shell` cuts the benchmark from roughly `120 FPS` to roughly `100 FPS`.
- Row count is the first large cliff. Reintroducing `697` lightweight rows drops the benchmark into the `69-88 FPS` range depending on whether stage-switch layout work is still settling.
- The real widget layer is the largest remaining cost. Restoring live param containers/widgets drops the benchmark again to roughly `38-43 FPS`, with many frames over the `16.7ms` budget and regular frames over `33ms`.
- Working hypothesis for follow-up optimization:
  - prioritize reducing live param-row/widget DOM and paint cost before tuning top-level section chrome
  - consider row virtualization / progressive activation for the Settings view
  - treat header/section-shell tweaks as secondary, because they do not explain the large regression from `static-param-list` to `full`

## Raw Artifacts (local-only)

- `perf/artifacts/frontend/settings-all-settings/`

## Automated Perf Tests

- Playwright: `frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`
- Result: passed locally via `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`

## Addendum: Granular Param Stack Breakdown

Date: 2026-03-07
Baseline reference: same Settings `All Settings` scenario, viewport, fixed transform, and pan/zoom loop as the initial report above.
Run mode: steady-state only, after a `500ms` post-navigation settle.

Additional code paths under test:

- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

New benchmark stages:

- `param-container-shell`
  - real `ParamGroupContainer` / `GetParamSwitch` / `ParamSwitch` / `ParamContainer`
  - lightweight labels
  - lightweight value placeholder instead of `ParamInput`
- `param-input-shell`
  - real `ParamInput` + `ParamUI` state/router layer
  - lightweight widget placeholder instead of live controls
- `non-text-widgets`
  - real non-text widgets restored
  - `CodeParam` / `TextParam` / `TextAreaParam` still replaced with placeholders

### `static-param-list` anchor rerun

- DOM nodes in `.react-flow`: `3773`
- Static benchmark rows: `697`
- Average frame time: `11.06ms`
- Approx FPS: `90.45`
- Max frame time: `42.50ms`
- Slow frames:
  - `>16.7ms`: `17`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/static-param-list-granular-trace.json`

### `param-container-shell`

- DOM nodes in `.react-flow`: `6406`
- Param containers: `697`
- Lightweight benchmark labels: `697`
- Lightweight value shells: `627`
- Average frame time: `19.21ms`
- Approx FPS: `52.05`
- Max frame time: `59.10ms`
- Slow frames:
  - `>16.7ms`: `38`
  - `>33.3ms`: `28`
  - `>50ms`: `5`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-container-shell-granular-trace.json`
- Observation: This is the biggest new cliff. Replacing the synthetic row list with the real param-tree shell drops the benchmark by about `38 FPS` before `ParamInput` or live widget controls are restored.

### `param-input-shell`

- DOM nodes in `.react-flow`: `6406`
- Param containers: `697`
- Lightweight benchmark labels: `697`
- Param UI shells: `627`
- Average frame time: `19.40ms`
- Approx FPS: `51.55`
- Max frame time: `66.50ms`
- Slow frames:
  - `>16.7ms`: `34`
  - `>33.3ms`: `30`
  - `>50ms`: `8`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-input-shell-granular-trace.json`
- Observation: Restoring `ParamInput` and the `ParamUI` selector/router layer barely changes steady-state pan/zoom. The cost delta from `param-container-shell` is effectively noise.

### `non-text-widgets`

- DOM nodes in `.react-flow`: `7112`
- Param containers: `697`
- Lightweight benchmark labels: `697`
- Text-family widget placeholders still active: `426`
- Implied live non-text widget rows: `201`
- Average frame time: `20.61ms`
- Approx FPS: `48.53`
- Max frame time: `51.10ms`
- Slow frames:
  - `>16.7ms`: `57`
  - `>33.3ms`: `18`
  - `>50ms`: `2`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/non-text-widgets-granular-trace.json`
- Observation: Restoring the non-text control family costs some budget, but it is still a secondary effect relative to the row shell itself.

### `full` granular rerun

- DOM nodes in `.react-flow`: `8627`
- Param containers: `697`
- Text input dummy mounts: `426`
- Average frame time: `22.30ms`
- Approx FPS: `44.84`
- Max frame time: `33.20ms`
- Slow frames:
  - `>16.7ms`: `94`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-granular-trace.json`
- Observation: The remaining drop from `non-text-widgets` to `full` comes mostly from restoring the `426` text/code/text-area widget rows and their heavier text-input rendering path.

### Granular Conclusion

- Dominant cost bucket `#1`: the real param row shell, not `ParamInput`.
  - The move from `static-param-list` to `param-container-shell` is the largest single regression in this addendum.
  - That bucket includes `ParamGroupContainer`, `GetParamSwitch`, `ParamSwitch`, `ParamContainer`, sortable wiring, tooltip wiring, resize handles, and the real nested grid structure.
- Dominant cost bucket `#2`: the text-family widgets.
  - Restoring `CodeParam` / `TextParam` / `TextAreaParam` rows accounts for most of the remaining drop between `non-text-widgets` and `full`.
  - Those rows number `426`, so this is the largest live-widget family in the benchmark.
- Minor cost bucket: `ParamInput` plumbing.
  - The `param-container-shell` to `param-input-shell` delta is negligible in steady-state pan/zoom, so optimizing debounced writes or `ParamInput` hook logic alone is unlikely to move the benchmark much.
- Secondary cost bucket: non-text live widgets.
  - They do matter, but they are not the main explanation for the overall slowdown.

Most likely next breakdown if we want to go one level deeper:

- split the row-shell bucket into:
  - sortable / DnD hook overhead
  - tooltip + resize + error affordance overhead
  - pure nested grid / DOM structure overhead

## Addendum: Row Shell Internals

Date: 2026-03-07
Baseline reference: same Settings `All Settings` scenario, viewport, fixed transform, and steady-state pan/zoom loop.
Goal: split the `static-param-list` -> `param-container-shell` cliff into pure row structure, row chrome, and sortable wiring.

New benchmark stages:

- `param-structure-shell`
  - real recursive `ParamSwitch` / `ParamContainer` tree
  - lightweight labels and value placeholders
  - no resize handle
  - no tooltip/error chrome
  - no `useSortable` row wiring
- `param-chrome-shell`
  - `param-structure-shell` plus resize handle + tooltip/error chrome
  - still no `useSortable`
- `param-container-shell`
  - `param-chrome-shell` plus `useSortable` row wiring

### `static-param-list` anchor rerun

- DOM nodes in `.react-flow`: `3773`
- Static benchmark rows: `697`
- Average frame time: `10.80ms`
- Approx FPS: `92.58`
- Max frame time: `41.90ms`
- Slow frames:
  - `>16.7ms`: `16`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/static-param-list-row-shell-trace.json`

### `param-structure-shell`

- DOM nodes in `.react-flow`: `4525`
- Param containers: `697`
- Lightweight benchmark labels: `697`
- Lightweight value shells: `627`
- Resize handles: `0`
- Static benchmark row-mode markers: `697`
- Average frame time: `18.21ms`
- Approx FPS: `54.91`
- Max frame time: `58.40ms`
- Slow frames:
  - `>16.7ms`: `33`
  - `>33.3ms`: `27`
  - `>50ms`: `5`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-trace.json`
- Observation: This is almost the entire regression. Moving from a flat static row list to the real nested param-row structure costs about `37.7 FPS` while only adding about `752` DOM nodes, which points at layout/paint complexity rather than raw node count alone.

### `param-chrome-shell`

- DOM nodes in `.react-flow`: `6406`
- Param containers: `697`
- Lightweight benchmark labels: `697`
- Lightweight value shells: `627`
- Resize handles: `627`
- Static benchmark row-mode markers: `697`
- Average frame time: `18.28ms`
- Approx FPS: `54.69`
- Max frame time: `59.20ms`
- Slow frames:
  - `>16.7ms`: `33`
  - `>33.3ms`: `27`
  - `>50ms`: `3`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-chrome-shell-trace.json`
- Observation: Adding the row chrome layer contributes almost nothing in steady-state pan/zoom, even though it adds about `1881` DOM nodes and `627` resize handles.

### `param-container-shell` row-shell rerun

- DOM nodes in `.react-flow`: `6406`
- Param containers: `697`
- Lightweight benchmark labels: `697`
- Lightweight value shells: `627`
- Resize handles: `627`
- Sortable benchmark row-mode markers: `697`
- Average frame time: `18.30ms`
- Approx FPS: `54.65`
- Max frame time: `59.50ms`
- Slow frames:
  - `>16.7ms`: `33`
  - `>33.3ms`: `29`
  - `>50ms`: `3`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-container-shell-row-breakdown-trace.json`
- Observation: Restoring `useSortable` row wiring is also effectively noise for pan/zoom.

### Row-Shell Conclusion

- The dominant row-shell cost is the real nested param-row structure itself.
  - The single biggest drop is `static-param-list` -> `param-structure-shell`.
  - That implicates the actual `ParamSwitch` / `ParamContainer` layout tree, nested grids/subgrids, and recursive container structure.
- Resize/tooltips/error chrome are not the main issue.
  - `param-structure-shell` and `param-chrome-shell` perform almost identically despite a large DOM increase.
- Sortable hook wiring is not the main issue.
  - `param-chrome-shell` and `param-container-shell` are effectively the same in steady-state pan/zoom.

Updated working hypothesis:

- Primary optimization target:
  - simplify the real param row/container layout structure and reduce nested grid/subgrid complexity
- Secondary optimization target:
  - reduce or defer the text-family widget cost identified in the prior addendum
- Low-priority targets for pan/zoom specifically:
  - tooltip handlers
  - resize handles
  - idle sortable row wiring

## Addendum: Group Container vs Flat Row vs Subgrid

Date: 2026-03-07
Baseline reference: same Settings `All Settings` target and the same `~0.1` zoom region used earlier.

Method note:

- This addendum uses a render-isolation replay to split the remaining row-shell cost more precisely.
- After stage activation and a `500ms` settle, it replays the pan/zoom sequence by mutating the live `.react-flow__viewport` transform directly while capturing `requestAnimationFrame` deltas and a DevTools trace.
- Use these numbers for comparison within this addendum. They are not directly comparable to the earlier absolute FPS values, which came from prior benchmark passes.

Goal: split the remaining `static-param-list` -> `param-structure-shell` cost into:

- real `ParamGroupContainer` scaffolding
- recursive real param-row composition with a flatter flex layout
- the extra cost of the current nested grid/subgrid row layout

New benchmark stages:

- `group-container-static-list`
  - real `ParamGroupContainer` / pinned-unpinned shells
  - static benchmark rows rendered inside the real group container
- `param-flat-shell`
  - real recursive `ParamSwitch` / `ParamContainer` tree
  - lightweight labels + lightweight value shells
  - flatter flex layout instead of the current grid/subgrid layout
- `param-structure-shell`
  - same recursive real tree
  - current nested grid/subgrid row layout

### `static-param-list` anchor rerun

- DOM nodes in `.react-flow`: `3773`
- Static benchmark rows: `697`
- Average frame time: `8.79ms`
- Approx FPS: `113.76`
- Max frame time: `17.40ms`
- Slow frames:
  - `>16.7ms`: `3`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/static-param-list-group-container-breakdown-trace.json`

### `group-container-static-list`

- DOM nodes in `.react-flow`: `3939`
- Real group-container markers: `42`
- Static benchmark rows: `697`
- Group-container static row wrappers: `41`
- Average frame time: `8.28ms`
- Approx FPS: `120.71`
- Max frame time: `9.40ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/group-container-static-list-trace.json`
- Observation: The real pinned/unpinned `ParamGroupContainer` scaffolding is effectively free in this render-isolation pass. Swapping the synthetic body for the real group container barely changes the result.

### `param-flat-shell`

- DOM nodes in `.react-flow`: `5845`
- Real group-container markers: `42`
- Param containers: `697`
- Flat benchmark rows: `697`
- Flat child wrappers: `66`
- Lightweight labels: `697`
- Lightweight value shells: `627`
- Average frame time: `10.38ms`
- Approx FPS: `96.33`
- Max frame time: `41.50ms`
- Slow frames:
  - `>16.7ms`: `9`
  - `>33.3ms`: `2`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-flat-shell-trace.json`
- Observation: Restoring the recursive real param-row shell, even with a simpler flex layout, is the biggest remaining cliff in this pass. That points at the per-row `ParamSwitch` / `ParamContainer` composition itself as a major cost bucket.

### `param-structure-shell` render-isolation rerun

- DOM nodes in `.react-flow`: `4525`
- Real group-container markers: `42`
- Param containers: `697`
- Lightweight labels: `697`
- Lightweight value shells: `627`
- Static row-mode markers: `697`
- Average frame time: `11.08ms`
- Approx FPS: `90.29`
- Max frame time: `50.20ms`
- Slow frames:
  - `>16.7ms`: `12`
  - `>33.3ms`: `7`
  - `>50ms`: `1`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-subgrid-comparison-trace.json`
- Observation: Moving from the flatter recursive shell to the current nested grid/subgrid shell costs another `~6 FPS` and increases the slow-frame tail, even though it removes roughly `1320` DOM nodes. That strongly suggests layout strategy is more important than raw node count here.

### Group Container/Subgrid Conclusion

- `ParamGroupContainer` scaffolding is not the culprit.
  - `static-param-list` and `group-container-static-list` are effectively the same.
- The recursive real param-row shell is the main remaining row-structure cost.
  - `group-container-static-list` -> `param-flat-shell` is the large drop.
- The current grid/subgrid layout is a smaller but real secondary penalty.
  - `param-flat-shell` -> `param-structure-shell` still drops another `~6 FPS`.
  - It is slower despite fewer DOM nodes, so simple DOM-count reduction is not enough.

Updated strongest suspects inside the row-shell bucket:

- `ParamSwitch` / `ParamContainer` recursive row composition
- the current `grid-cols-subgrid` / nested grid layout path inside `ParamContainer`

Lower-priority suspects after this pass:

- top-level `ParamGroupContainer` pinned/unpinned shells
- outer scroll wrappers alone

## Addendum: Explicit Simple Grid vs Flex vs Current Layout

Date: 2026-03-07
Baseline reference: same Settings `All Settings` target, viewport `1440x1200`, and fixed `~0.1` zoom region.

Method note:

- This addendum keeps the same render-isolation replay style as the prior row-layout addendum.
- In this headed session, the replay behaved like a `~60-70 FPS` capped environment rather than the earlier higher-refresh runs.
- Use these numbers for comparison within this addendum only.

Goal: isolate whether the remaining layout penalty is:

- the recursive real row shell itself
- the flatter benchmark flex row layout
- or the current section utility / named-grid row layout path

New benchmark stage:

- `param-simple-grid-shell`
  - real recursive `ParamSwitch` / `ParamContainer` tree
  - same lightweight labels + lightweight value shells as the prior row-shell stages
  - explicit two-column grid row layout
  - bypasses the current `section-key-value` / `section-lg-value` / `section-args-nested*` layout-class path

### `param-flat-shell` rerun

- DOM nodes in `.react-flow`: `5845`
- Real group-container markers: `42`
- Param containers: `697`
- Flat benchmark rows: `697`
- Flat child wrappers: `66`
- Lightweight labels: `697`
- Lightweight value shells: `627`
- Average frame time: `16.27ms`
- Approx FPS: `61.47`
- Max frame time: `50.10ms`
- Slow frames:
  - `>16.7ms`: `33`
  - `>33.3ms`: `15`
  - `>50ms`: `1`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-flat-shell-simple-grid-followup-trace.json`

### `param-simple-grid-shell`

- DOM nodes in `.react-flow`: `5845`
- Real group-container markers: `42`
- Param containers: `697`
- Simple-grid benchmark rows: `697`
- Simple-grid child wrappers: `66`
- Lightweight labels: `697`
- Lightweight value shells: `627`
- Average frame time: `14.87ms`
- Approx FPS: `67.26`
- Max frame time: `25.10ms`
- Slow frames:
  - `>16.7ms`: `42`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-simple-grid-shell-trace.json`
- Observation: This is the best row-layout result in the current session. With the same recursive tree and the same DOM count as `param-flat-shell`, the explicit two-column grid improves average FPS by about `5.8` and removes the long-frame tail over `33ms`.

### `param-structure-shell` rerun

- DOM nodes in `.react-flow`: `4525`
- Real group-container markers: `42`
- Param containers: `697`
- Lightweight labels: `697`
- Lightweight value shells: `627`
- Static row-mode markers: `697`
- Average frame time: `19.86ms`
- Approx FPS: `50.36`
- Max frame time: `58.40ms`
- Slow frames:
  - `>16.7ms`: `32`
  - `>33.3ms`: `31`
  - `>50ms`: `9`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-simple-grid-followup-trace.json`
- Observation: The current production row-layout path is still clearly the slowest of the three, even though it removes about `1320` DOM nodes versus the other two benchmark layouts. That further strengthens the conclusion that the bottleneck is layout strategy, not raw node count.

### Layout Path Conclusion

- The current row-layout implementation is now the clearest hotspot inside the row-shell bucket.
  - `param-simple-grid-shell` and `param-structure-shell` keep the same recursive real tree, but the current production layout is about `16.9 FPS` slower in this pass.
- The issue is broader than recursion alone.
  - `param-simple-grid-shell` keeps recursion and still performs materially better than both the flatter flex shell and the current production layout.
- The strongest remaining suspect is the current section utility / named-grid row layout path inside `ParamContainer`.
  - That includes the `section-key-value`, `section-lg-value`, and `section-args-nested*` layout classes, plus the surrounding nested grid/subgrid structure they rely on.

Recommended next implementation target:

- replace the current production `ParamContainer` row layout with a flatter explicit-column layout closer to `param-simple-grid-shell`, then remeasure against this same benchmark

## Addendum: Production ParamContainer Layout Refactor

Date: 2026-03-07

Implementation summary:

- Replaced the live `ParamContainer` row shell with a simpler explicit two-column grid that matches the successful benchmark direction much more closely.
- Kept the real child tree, DnD hooks, tooltips, resize handles, and real widget path intact, but moved the chrome/input layout into a small local value-cell grid instead of a row-wide named-grid/subgrid structure.
- Replaced the row-level nested child wrapper grid with a lighter child column wrapper and left rail.
- Fixed child-row rendering to key off `renderChildren.length > 0` instead of only rendering when a temporary DnD child was present, so the post-refactor runs stayed comparable to the original `697`-row benchmark baseline.

Reference points:

- Best simple-grid control in this benchmark branch:
  - `param-simple-grid-shell`: `68.33 FPS`
  - DOM nodes: `5845`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-simple-grid-shell-after-production-refactor-trace.json`
- Pre-refactor production references:
  - `param-structure-shell`: `50.36 FPS`
  - `param-container-shell`: `54.65 FPS`
  - `full`: `44.84 FPS`

### `param-structure-shell` after production refactor

- DOM nodes in `.react-flow`: `6426`
- Real group-container markers: `42`
- Param containers: `697`
- Lightweight labels: `697`
- Lightweight value shells: `627`
- Static row-mode markers: `697`
- Average frame time: `14.97ms`
- Approx FPS: `66.81`
- Max frame time: `25.00ms`
- Slow frames:
  - `>16.7ms`: `39`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-after-production-refactor-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-after-production-refactor.png`
- Result vs pre-refactor production reference: `+16.45 FPS`
- Observation: the production structure shell is now effectively at the simple-grid control level while keeping the real recursive tree intact.

### `param-container-shell` after production refactor

- DOM nodes in `.react-flow`: `9643`
- Real group-container markers: `42`
- Param containers: `697`
- Lightweight labels: `697`
- Lightweight value shells: `627`
- Sortable row-mode markers: `697`
- Average frame time: `15.12ms`
- Approx FPS: `66.14`
- Max frame time: `25.70ms`
- Slow frames:
  - `>16.7ms`: `42`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-container-shell-after-production-refactor-trace.json`
- Result vs pre-refactor production reference: `+11.49 FPS`
- Observation: restoring real sortable wiring and chrome no longer causes the earlier row-shell collapse. The dominant layout penalty inside the row shell is largely gone.

### `full` after production refactor

- DOM nodes in `.react-flow`: `12409`
- Real group-container markers: `42`
- Param containers: `697`
- Sortable row-mode markers: `697`
- Average frame time: `19.44ms`
- Approx FPS: `51.43`
- Max frame time: `41.60ms`
- Slow frames:
  - `>16.7ms`: `68`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-after-production-refactor-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/full-after-production-refactor.png`
- Result vs pre-refactor production reference: `+6.59 FPS`
- Observation: the full page benefits materially even though the final DOM is larger than the original full-stage baseline. That confirms the old bottleneck was layout strategy, not node count.

### Refactor Conclusion

- The production `ParamContainer` row-layout hotspot is now pinpointed and addressed.
  - The refactored production structure shell moved from `50.36 FPS` to `66.81 FPS`.
  - The refactored production sortable/container shell moved from `54.65 FPS` to `66.14 FPS`.
- The new live row shell is effectively at parity with the simple-grid control.
  - `param-simple-grid-shell`: `68.33 FPS`
  - production `param-structure-shell` after refactor: `66.81 FPS`
- The biggest previously identified drop has been removed.
  - The old production layout path inside `ParamContainer` was the dominant row-shell cliff.
  - After replacing it, the remaining gap to the full page is much more likely to come from the real widget layer, especially the text/code/text-area family already identified in the earlier addenda.

Recommended next performance target:

- focus the next optimization pass on the text/code/text-area widget family now that the production row-layout path is no longer the main limiter

## Correction: production layout refactor reverted after visual regression

- Date: `2026-03-07`
- The production `ParamContainer` row-layout refactor from the previous addendum was reverted from branch head after CDP before/after comparison showed a severe visual regression in the real `All Settings` view.
- The regression was not subtle. The refactored layout collapsed many param rows into narrow vertical strips because child param controls still depended on the original named `key/value` grid contract (`.section-key`, `.section-value`, `.section-key-value`), which the experiment had removed.
- Before/after screenshot artifacts:
  - `perf/artifacts/frontend/settings-all-settings/layout-regression/before-refactor-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/layout-regression/after-refactor-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/layout-regression/repaired-visible.png`
- Branch-head status after repair:
  - production rendering is back on the original row-layout contract
  - the `renderChildren.length > 0` child-row visibility fix remains
  - benchmark-only isolation stages remain available for future work
- Interpretation guidance:
  - keep the previous addendum as a useful experimental data point about layout cost
  - do not treat its post-refactor production FPS numbers as representative of the current branch head

## Addendum: contract-preserving nested-rail cleanup

- Date: `2026-03-07`
- Goal: test whether a behavior-preserving cleanup inside the original `ParamContainer` grid contract can recover any pan/zoom performance without changing row layout semantics.
- Change under test:
  - replace the decorative nested-child rail `<div>` with a `before:` pseudo-element on the existing nested-child wrapper
  - keep the original named `key/value` grid contract and all row structure intact
- Measurement note:
  - this addendum uses a browser-side D3 zoom transform loop (`ZoomPane`'s `d3Selection.call(d3Zoom.transform, ...)`) because the earlier `__REACT_FLOW_DEVTOOLS__` store path was not available on the current page instance
  - compare results only within this addendum

### `param-structure-shell` A/B

- Baseline (`div` rail):
  - DOM nodes in `.react-flow`: `4974`
  - Param containers: `697`
  - Average frame time: `14.24ms`
  - Approx FPS: `70.20`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-div-rail-trace.json`
- Candidate (`before:` pseudo-element rail):
  - DOM nodes in `.react-flow`: `4904`
  - Param containers: `697`
  - Average frame time: `13.98ms`
  - Approx FPS: `71.51`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-pseudo-rail-d3-trace.json`
- Result: `+1.30 FPS` with `-70` DOM nodes

### `full` A/B

- Baseline (`div` rail):
  - DOM nodes in `.react-flow`: `9703`
  - Param containers: `697`
  - Average frame time: `21.23ms`
  - Approx FPS: `47.10`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-contract-div-rail-trace.json`
- Candidate (`before:` pseudo-element rail):
  - DOM nodes in `.react-flow`: `9633`
  - Param containers: `697`
  - Average frame time: `20.70ms`
  - Approx FPS: `48.31`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-contract-pseudo-rail-trace.json`
- Result: `+1.21 FPS` with `-70` DOM nodes

### Addendum conclusion

- This is a small but consistent win, not a major breakthrough.
- The nested-child rail cleanup is worth keeping because it preserves behavior, reduces DOM, and improved both comparable A/B runs.
- It does not materially change the main roadmap:
  - the dominant hotspot is still the production `ParamContainer` row-layout path
  - the next major optimization target after safe row-layout work is still the text/code/text-area widget family

## Addendum: rejected local row-grid rewrite

- Date: `2026-03-07`
- Goal: test whether replacing the row-level `grid-cols-subgrid` wrappers with local named `key / center-gutter / value` grids could preserve visuals while reducing pan/zoom cost.
- Change under test:
  - keep the existing child contract (`section-key`, `section-value`, `section-center`)
  - replace the outer row wrappers in `ParamContainer` and the benchmark placeholder row in `ParamSwitch` with local explicit named-grid templates
- Measurement note:
  - this addendum uses a single-run A/B replay against the live `ZoomPane` D3 objects recovered from the React fiber tree
  - compare results only within this addendum

### Visual check

- Candidate row widths stayed healthy:
  - sample min normalized row width: `514.00px`
  - narrow sampled rows (`<250px`): `0`
- Screenshot artifacts:
  - candidate: `perf/artifacts/frontend/settings-all-settings/layout-regression/row-contract-rewrite-visible.png`
  - reverted branch head: `perf/artifacts/frontend/settings-all-settings/layout-regression/row-contract-rewrite-reverted-visible.png`

### `param-structure-shell` A/B

- Baseline (current branch-head row layout):
  - page DOM nodes: `4904`
  - `.react-flow` DOM nodes: `4456`
  - Param containers: `697`
  - Average frame time: `42.68ms`
  - Approx FPS: `23.43`
  - Max frame time: `58.50ms`
  - Slow frames:
    - `>16.7ms`: `36`
    - `>33.3ms`: `35`
    - `>50ms`: `12`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-row-contract-baseline-trace.json`
- Candidate (local named-grid row wrapper):
  - page DOM nodes: `4904`
  - `.react-flow` DOM nodes: `4456`
  - Param containers: `697`
  - Average frame time: `43.10ms`
  - Approx FPS: `23.20`
  - Max frame time: `66.40ms`
  - Slow frames:
    - `>16.7ms`: `35`
    - `>33.3ms`: `33`
    - `>50ms`: `11`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-row-contract-candidate-trace.json`
- Result: `-0.23 FPS`

### `param-container-shell` A/B

- Baseline (current branch-head row layout):
  - page DOM nodes: `6867`
  - `.react-flow` DOM nodes: `6337`
  - Param containers: `697`
  - Average frame time: `42.86ms`
  - Approx FPS: `23.33`
  - Max frame time: `58.80ms`
  - Slow frames:
    - `>16.7ms`: `38`
    - `>33.3ms`: `34`
    - `>50ms`: `9`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-container-shell-row-contract-baseline-trace.json`
- Candidate (local named-grid row wrapper):
  - page DOM nodes: `6867`
  - `.react-flow` DOM nodes: `6337`
  - Param containers: `697`
  - Average frame time: `41.15ms`
  - Approx FPS: `24.30`
  - Max frame time: `58.30ms`
  - Slow frames:
    - `>16.7ms`: `37`
    - `>33.3ms`: `33`
    - `>50ms`: `8`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-container-shell-row-contract-candidate-trace.json`
- Result: `+0.97 FPS`

### `full` A/B

- Baseline (current branch-head row layout):
  - page DOM nodes: `9633`
  - `.react-flow` DOM nodes: `8558`
  - Param containers: `697`
  - Average frame time: `27.93ms`
  - Approx FPS: `35.81`
  - Max frame time: `42.10ms`
  - Slow frames:
    - `>16.7ms`: `62`
    - `>33.3ms`: `5`
    - `>50ms`: `0`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-row-contract-baseline-trace.json`
- Candidate (local named-grid row wrapper):
  - page DOM nodes: `9633`
  - `.react-flow` DOM nodes: `8558`
  - Param containers: `697`
  - Average frame time: `29.75ms`
  - Approx FPS: `33.62`
  - Max frame time: `42.00ms`
  - Slow frames:
    - `>16.7ms`: `60`
    - `>33.3ms`: `16`
    - `>50ms`: `0`
  - Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-row-contract-candidate-trace.json`
- Result: `-2.19 FPS`

### Addendum conclusion

- This candidate is not worth landing.
- It preserved row width and visible layout, but it did not improve the real bottleneck consistently.
- The only positive result was a modest `+0.97 FPS` in `param-container-shell`.
- It was slightly worse in `param-structure-shell` and materially worse in `full`, especially in the `>33.3ms` tail.
- Branch head stays on the previous row layout after reverting this experiment.
- Updated interpretation:
  - simply replacing `grid-cols-subgrid` with a local named-grid wrapper is not enough
  - the remaining hotspot is likely deeper in the overall row/widget interaction, so the next worthwhile target is the text/code/text-area widget family or a different row-layout idea entirely

## Addendum: Top-level Rows vs Parent-only Recursion vs Full Structure

- Date: `2026-03-07`
- Goal: split the remaining `static-param-list` -> `param-structure-shell` cliff into:
  - the cost of the real production shell on the top-level visible rows
  - the cost of recursive parent rows by themselves
  - the extra cost of mounting the full nested subtree
- Measurement note:
  - this addendum uses the same browser-side viewport transform replay as the earlier render-isolation passes
  - after stage activation and a `500ms` settle, it mutates the live `.react-flow__viewport` transform for `120` frames while capturing `requestAnimationFrame` deltas and a DevTools trace
  - compare these numbers only within this addendum

New benchmark stages:

- `param-top-level-structure-shell`
  - real `ParamSwitch` / `ParamContainer` row shell
  - top-level rows only
  - nested child subtrees suppressed
- `param-parent-structure-shell`
  - real recursive row shell
  - current-level filtering keeps only parent rows
  - leaf rows are excluded
- `param-structure-shell`
  - full recursive real row shell
  - parent rows plus leaf rows plus mounted nested subtree

### `static-param-list` anchor rerun

- DOM nodes in `.react-flow`: `3773`
- Static benchmark rows: `697`
- Average frame time: `19.77ms`
- Approx FPS: `50.58`
- Max frame time: `42.10ms`
- Slow frames:
  - `>16.7ms`: `70`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/static-param-list-parent-leaf-breakdown-trace.json`

### `param-top-level-structure-shell`

- DOM nodes in `.react-flow`: `3483`
- Param containers: `452`
- Parent rows: `27`
- Leaf rows: `425`
- Nested rendered rows: `0`
- Nested child wrappers: `0`
- Suppressed parent rows: `27`
- Average frame time: `36.36ms`
- Approx FPS: `27.50`
- Max frame time: `46.80ms`
- Slow frames:
  - `>16.7ms`: `115`
  - `>33.3ms`: `90`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-structure-shell-parent-leaf-breakdown-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-structure-shell-visible.png`

### `param-parent-structure-shell`

- DOM nodes in `.react-flow`: `1935`
- Param containers: `66`
- Parent rows: `66`
- Leaf rows: `0`
- Top-level rows: `27`
- Nested rendered rows: `39`
- Nested child wrappers: `66`
- Average frame time: `14.85ms`
- Approx FPS: `67.36`
- Max frame time: `25.10ms`
- Slow frames:
  - `>16.7ms`: `43`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-parent-structure-shell-parent-leaf-breakdown-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/param-parent-structure-shell-visible.png`

### `param-structure-shell` rerun

- DOM nodes in `.react-flow`: `4451`
- Param containers: `697`
- Parent rows: `66`
- Leaf rows: `631`
- Top-level rows: `452`
- Nested rendered rows: `245`
- Nested child wrappers: `66`
- Average frame time: `48.38ms`
- Approx FPS: `20.67`
- Max frame time: `66.40ms`
- Slow frames:
  - `>16.7ms`: `115`
  - `>33.3ms`: `115`
  - `>50ms`: `49`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-parent-leaf-breakdown-trace.json`

### Addendum conclusion

- Parent-row recursion by itself is not the main bottleneck.
  - `param-parent-structure-shell` keeps all `66` real parent rows and all `66` nested branch wrappers, yet it ran at `67.36 FPS`.
- The biggest remaining cliff is already present before any nested child subtree mounts.
  - `static-param-list` -> `param-top-level-structure-shell` drops from `50.58 FPS` to `27.50 FPS`, a `-23.08 FPS` hit, even with `0` nested rendered rows.
- Mounting the nested subtree is a secondary penalty, not the primary one.
  - `param-top-level-structure-shell` -> `param-structure-shell` drops another `-6.83 FPS` while adding `245` nested rendered rows.
- The dominant cost inside the row-shell bucket now points at the real production shell on the many leaf rows.
  - `param-structure-shell` contains `631` leaf rows and only `66` parent rows.
  - `param-parent-structure-shell` is fast, while `param-top-level-structure-shell` is already slow with `425` leaf rows and no mounted nested subtree.
- Updated interpretation:
  - the remaining highest-value target is not parent recursion in general
  - it is the ordinary leaf-row production path in `ParamContainer` / `ParamSwitch`
  - nested subtree expansion still matters, but it is smaller than the per-leaf-row shell cost

## Addendum: Leaf-row layout follow-up

- Date: `2026-03-07`
- Goal: test whether the isolated leaf-row bottleneck is primarily the current top-level row-layout path.
- Measurement note:
  - this addendum reuses the same top-level-only row mix as the previous addendum: `452` rows total, with `425` leaf rows, `27` parent rows, and `0` mounted nested child subtrees
  - compare these numbers only within this addendum

New benchmark stages:

- `param-top-level-structure-shell`
  - current production leaf-row shell
  - top-level rows only
  - nested child subtrees suppressed
- `param-top-level-flat-shell`
  - same top-level row mix
  - flatter flex row shell
  - nested child subtrees suppressed
- `param-top-level-simple-grid-shell`
  - same top-level row mix
  - explicit two-column grid row shell
  - nested child subtrees suppressed

### `param-top-level-structure-shell` rerun

- DOM nodes in `.react-flow`: `3315`
- Param containers: `452`
- Parent rows: `27`
- Leaf rows: `425`
- Average frame time: `35.50ms`
- Approx FPS: `28.17`
- Max frame time: `50.40ms`
- Slow frames:
  - `>16.7ms`: `115`
  - `>33.3ms`: `80`
  - `>50ms`: `1`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-structure-shell-leaf-layout-followup-trace.json`

### `param-top-level-flat-shell`

- DOM nodes in `.react-flow`: `4387`
- Param containers: `452`
- Parent rows: `27`
- Leaf rows: `425`
- Average frame time: `27.59ms`
- Approx FPS: `36.24`
- Max frame time: `40.70ms`
- Slow frames:
  - `>16.7ms`: `116`
  - `>33.3ms`: `22`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-flat-shell-leaf-layout-followup-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-flat-shell-visible.png`

### `param-top-level-simple-grid-shell`

- DOM nodes in `.react-flow`: `4387`
- Param containers: `452`
- Parent rows: `27`
- Leaf rows: `425`
- Average frame time: `27.66ms`
- Approx FPS: `36.15`
- Max frame time: `42.00ms`
- Slow frames:
  - `>16.7ms`: `115`
  - `>33.3ms`: `24`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-simple-grid-shell-leaf-layout-followup-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-simple-grid-shell-visible.png`

### Addendum conclusion

- Both simpler leaf-row layouts materially outperformed the current production leaf-row shell.
  - `param-top-level-structure-shell`: `28.17 FPS`
  - `param-top-level-flat-shell`: `36.24 FPS`
  - `param-top-level-simple-grid-shell`: `36.15 FPS`
- The gain is about `+8 FPS` either way.
  - flat vs current: `+8.08 FPS`
  - simple-grid vs current: `+7.98 FPS`
- The win does not depend on a specific replacement layout.
  - the flex and explicit-grid candidates are effectively tied
  - both bypass the current `section-args-nested-key-value` / `section-key-value` / `grid-cols-subgrid` leaf-row wrapper path
- Raw DOM count is not the main driver here.
  - both faster candidates have `+1072` DOM nodes versus the current top-level structure shell and still perform materially better
- Updated interpretation:
  - the hottest remaining production path is the current leaf-row wrapper layout itself
  - the next implementation step should be a behavior-preserving refactor of the leaf-row branch in `ParamContainer`
  - the likely goal is a simpler outer leaf-row wrapper while preserving the existing key/value contract for `ParamInput` and row chrome inside that wrapper

## Addendum: Production Leaf-row Explicit-grid Refactor

- Date: `2026-03-07`
- Goal: land a behavior-preserving production change for the isolated top-level leaf-row shell hotspot and rerun the same pan/zoom benchmark stages.
- Implementation:
  - top-level leaf rows in `ParamContainer` now use a local explicit `key / center-gutter / value` grid
  - nested parent rows and nested child subtree rendering stay on the previous production path
- Measurement note:
  - this addendum uses the same fixed viewport transform replay described in the main Method section
  - compare these numbers within this addendum first
  - `param-top-level-simple-grid-shell` is included as a current benchmark control

### `static-param-list` anchor rerun

- DOM nodes in `.react-flow`: `3773`
- Static benchmark rows: `697`
- Param containers: `0`
- Average frame time: `10.24ms`
- Approx FPS: `97.65`
- Max frame time: `33.40ms`
- Slow frames:
  - `>16.7ms`: `15`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/static-param-list-leaf-row-production-explicit-grid-trace.json`

### `param-top-level-structure-shell` after the production leaf-row refactor

- DOM nodes in `.react-flow`: `3483`
- Param containers: `452`
- Parent rows: `27`
- Leaf rows: `425`
- Top-level rows: `452`
- Nested rendered rows: `0`
- Nested child wrappers: `0`
- Average frame time: `14.18ms`
- Approx FPS: `70.52`
- Max frame time: `50.50ms`
- Slow frames:
  - `>16.7ms`: `29`
  - `>33.3ms`: `8`
  - `>50ms`: `1`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-structure-shell-leaf-row-production-explicit-grid-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-structure-shell-leaf-row-production-explicit-grid-visible.png`

### `param-top-level-simple-grid-shell` current control

- DOM nodes in `.react-flow`: `4387`
- Param containers: `452`
- Parent rows: `27`
- Leaf rows: `425`
- Top-level rows: `452`
- Nested rendered rows: `0`
- Nested child wrappers: `0`
- Average frame time: `12.30ms`
- Approx FPS: `81.27`
- Max frame time: `41.60ms`
- Slow frames:
  - `>16.7ms`: `24`
  - `>33.3ms`: `2`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-top-level-simple-grid-shell-leaf-row-production-explicit-grid-trace.json`

### `param-structure-shell` after the production leaf-row refactor

- DOM nodes in `.react-flow`: `4283`
- Param containers: `697`
- Parent rows: `66`
- Leaf rows: `631`
- Top-level rows: `452`
- Nested rendered rows: `245`
- Nested child wrappers: `66`
- Average frame time: `18.30ms`
- Approx FPS: `54.64`
- Max frame time: `174.80ms`
- Slow frames:
  - `>16.7ms`: `37`
  - `>33.3ms`: `20`
  - `>50ms`: `2`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-structure-shell-leaf-row-production-explicit-grid-trace.json`

### `param-container-shell` after the production leaf-row refactor

- DOM nodes in `.react-flow`: `6332`
- Param containers: `697`
- Resize handles: `627`
- Parent rows: `66`
- Leaf rows: `631`
- Top-level rows: `452`
- Nested rendered rows: `245`
- Nested child wrappers: `66`
- Average frame time: `16.81ms`
- Approx FPS: `59.47`
- Max frame time: `59.20ms`
- Slow frames:
  - `>16.7ms`: `32`
  - `>33.3ms`: `19`
  - `>50ms`: `2`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-container-shell-leaf-row-production-explicit-grid-trace.json`

### `full` after the production leaf-row refactor

- DOM nodes in `.react-flow`: `8553`
- Param containers: `697`
- Text-family inputs: `426`
- Resize handles: `627`
- Parent rows: `66`
- Leaf rows: `631`
- Top-level rows: `452`
- Nested rendered rows: `245`
- Nested child wrappers: `66`
- Average frame time: `24.06ms`
- Approx FPS: `41.56`
- Max frame time: `33.60ms`
- Slow frames:
  - `>16.7ms`: `101`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-leaf-row-production-explicit-grid-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/leaf-row-explicit-grid-full-visible.png`

### Addendum conclusion

- The production leaf-row refactor materially improved the row-shell bucket.
  - `static-param-list` -> `param-top-level-structure-shell` now drops by `-27.13 FPS`
  - within this rerun, the current production top-level shell is only `-10.75 FPS` behind the simple-grid control
- The old row-shell cliff is much smaller in the full recursive path.
  - `param-structure-shell` now runs at `54.64 FPS`
  - `param-container-shell` now runs at `59.47 FPS`
  - those two stages are now in the same performance band, which means the pure row-shell structure penalty is no longer the dominant drop
- The remaining large drop is now downstream of the row shell.
  - `param-container-shell` -> `full` still drops by `-17.91 FPS`
  - that points the next optimization pass at the live param input/widget layer, especially the text-family path
- The visual contract held in the live app after the production change.
  - benchmark geometry checks passed
  - a live full-stage width sample stayed well above the collapse threshold (`minWidth ~= 514px`, `0` narrow rows)

## Addendum: Remaining Widget Cost Is Mostly CodeParam

- Date: `2026-03-07`
- Goal: decompose the remaining `param-container-shell -> full` gap after the leaf-row refactor by isolating the live widget layer on the `All Settings` benchmark.
- Important discovery:
  - the current `All Settings` benchmark contains `426` `CodeParam` rows
  - it contains `0` `TextParam` rows
  - it contains `0` `TextAreaParam` rows
  - so the remaining text-family cost in this benchmark is effectively the CodeMirror-backed `CodeParam` path
- Measurement note:
  - compare these numbers only within this addendum
  - `code-widgets` uses the same row shell and non-text live widget mix as `non-text-widgets`, but restores the real `CodeParam` widgets for those `426` rows

### `param-container-shell` anchor rerun

- DOM nodes in `.react-flow`: `6332`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `0`
- Code widget shells: `0`
- Average frame time: `16.44ms`
- Approx FPS: `60.82`
- Max frame time: `59.20ms`
- Slow frames:
  - `>16.7ms`: `33`
  - `>33.3ms`: `19`
  - `>50ms`: `2`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/param-container-shell-code-widget-breakdown-trace.json`

### `non-text-widgets`

- DOM nodes in `.react-flow`: `7038`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `0`
- Code widget shells: `426`
- Average frame time: `19.51ms`
- Approx FPS: `51.26`
- Max frame time: `49.90ms`
- Slow frames:
  - `>16.7ms`: `57`
  - `>33.3ms`: `10`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/non-text-widgets-code-widget-breakdown-trace.json`

### `code-widgets`

- DOM nodes in `.react-flow`: `8385`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- Code widget shells: `0`
- Average frame time: `24.61ms`
- Approx FPS: `40.64`
- Max frame time: `33.30ms`
- Slow frames:
  - `>16.7ms`: `107`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/code-widgets-code-widget-breakdown-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/code-widgets-visible.png`

### `full` rerun

- DOM nodes in `.react-flow`: `8553`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- Code widget shells: `0`
- Average frame time: `22.86ms`
- Approx FPS: `43.74`
- Max frame time: `32.90ms`
- Slow frames:
  - `>16.7ms`: `93`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-code-widget-breakdown-trace.json`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/code-widget-breakdown-full-visible.png`

### Addendum conclusion

- The remaining benchmark text-family bucket is not a mixed text/code problem in `All Settings`.
  - it is overwhelmingly the `CodeParam` path
  - there are no `TextParam` or `TextAreaParam` rows in this benchmark view
- The code widget layer is the main remaining hotspot after the row-shell refactor.
  - `non-text-widgets` -> `code-widgets`: `51.26 FPS` -> `40.64 FPS`, a `-10.62 FPS` drop
  - that drop comes from restoring the real `426` CodeMirror-backed code rows
- `code-widgets` already lands in the same performance band as `full`.
  - `code-widgets`: `40.64 FPS`
  - `full`: `43.74 FPS`
  - the practical interpretation is that the real `CodeParam` widget path explains most of the remaining widget cost, while live labels and section handles are secondary in this benchmark
- Updated next step:
  - stop splitting `TextParam` vs `TextAreaParam` for this benchmark, because they are absent here
  - focus the next optimization pass on the `CodeParam` / `TextInputCodeMirror` path

## Addendum: flatter DummyCodeMirror preview preserves highlighting and removes the code-widget cliff

- Date: `2026-03-07`
- Goal: keep real parser-driven syntax highlighting for `CodeParam`, but replace the old `DummyCodeMirror` line-by-line token DOM with a flatter preview that should be cheaper during steady-state pan/zoom.
- Change under test:
  - keep the same `CodeMirror` parser + theme mapping
  - remove the `RangeSetBuilder` / `Decoration` / `Text` line-wrapping path from `DummyCodeMirror`
  - render a single highlighted content stream with merged adjacent style runs
  - remove the per-line `.cm-line` wrappers from the idle dummy preview
- Measurement note:
  - the first after-only rerun was sensitive to stage-specific fit differences, so the final comparison below uses a fixed viewport transform copied from the live `full` stage
  - compare these numbers only within this addendum
  - use the earlier `Remaining Widget Cost Is Mostly CodeParam` addendum as the directional baseline for the old code-widget path

### `param-container-shell` fixed-base anchor

- DOM nodes in `.react-flow`: `6332`
- Code widgets: `0`
- Average frame time: `11.78ms`
- Approx FPS: `84.92`
- Max frame time: `21.40ms`
- Slow frames:
  - `>16.7ms`: `13`
  - `>33.3ms`: `0`
  - `>50ms`: `0`

### `non-text-widgets` fixed-base rerun

- DOM nodes in `.react-flow`: `7038`
- Param containers: `697`
- Code widgets: `0`
- Code widget shells: `426`
- `.cm-line` nodes: `0`
- Average frame time: `11.38ms`
- Approx FPS: `87.87`
- Max frame time: `33.80ms`
- Slow frames:
  - `>16.7ms`: `32`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/non-text-widgets-dummy-preview-flattened-fixed-base-trace.json`

### `code-widgets` fixed-base rerun

- DOM nodes in `.react-flow`: `7940`
- Param containers: `697`
- Code widgets: `426`
- Code widget shells: `0`
- `.cm-line` nodes: `0`
- Highlighted spans under code widgets: `476`
- Average frame time: `7.84ms`
- Approx FPS: `127.50`
- Max frame time: `13.40ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`

### `full` fixed-base rerun

- DOM nodes in `.react-flow`: `8108`
- Param containers: `697`
- Code widgets: `426`
- Code widget shells: `0`
- `.cm-line` nodes: `0`
- Highlighted spans under code widgets: `476`
- Average frame time: `8.19ms`
- Approx FPS: `122.10`
- Max frame time: `10.90ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Screenshot artifact: `perf/artifacts/frontend/settings-all-settings/dummy-preview-flattened-full-visible.png`

### Addendum conclusion

- The old code-widget cliff is gone in this rerun.
  - previous code-widget addendum: `code-widgets` at `40.64 FPS`, `full` at `43.74 FPS`
  - this flatter highlighted preview rerun: `code-widgets` at `127.50 FPS`, `full` at `122.10 FPS`
- The DOM reduction is modest in total count but important in shape.
  - old `code-widgets` DOM: `8385`
  - new `code-widgets` DOM: `7940`
  - old `full` DOM: `8553`
  - new `full` DOM: `8108`
  - the idle code preview no longer renders any `.cm-line` wrappers
- The practical takeaway is that syntax highlighting itself was not the blocker.
  - the expensive part was the old dummy preview structure and its extra line/token DOM path
  - preserving parser-driven highlighting with a flatter preview is viable
- Interpretation caution:
  - this fixed-base rerun now shows `code-widgets` and `full` in the same band as, or slightly ahead of, the shell baselines
  - treat the exact inversion as noisy because stage geometry still differs, but the directional result is robust: the code-widget path no longer stands out as the dominant pan/zoom bottleneck in this benchmark

## Addendum: repeated rerun correction for the flattened DummyCodeMirror pass

- Date: `2026-03-07`
- Goal: verify that the flattened `DummyCodeMirror` change is actually live in the headed browser and replace the suspicious single-pass `122 FPS` claim with a repeated rerun.
- Correction:
  - the previous single-pass fixed-base numbers in the immediately preceding addendum were too optimistic and should not be used as the branch conclusion
  - use this repeated rerun instead

### Live DOM verification

- Benchmark stage confirmed live in the headed page:
  - `code-widgets` renders `426` code widgets
  - `.cm-line` count is `0`
  - highlighted span count under code widgets is `476`
- Sample widget verification:
  - a simple code widget now renders as a single root preview with direct highlighted span children
  - the richest visible sampled code widget had `48` child spans for `367` characters of code
- Screenshot artifacts:
  - `perf/artifacts/frontend/settings-all-settings/dummy-preview-flattened-code-widgets-visible-rerun.png`
  - `perf/artifacts/frontend/settings-all-settings/dummy-preview-flattened-code-widgets-closeup-rerun.png`
  - `perf/artifacts/frontend/settings-all-settings/dummy-preview-flattened-full-visible-rerun.png`

### Repeated fixed-base rerun

- Measurement note:
  - fixed viewport transform: `matrix(0.1, 0, 0, 0.1, 779.9, -55.7)`
  - each stage rerun used `5` browser-side D3 zoom loops of `180` frames each
  - compare these numbers only within this addendum

### `param-container-shell`

- DOM nodes in `.react-flow`: `6332`
- Code widgets: `0`
- Average frame time across `5` runs: `47.13ms`
- Average FPS across `5` runs: `21.22`
- Median FPS: `21.12`
- Per-run FPS: `21.12`, `20.93`, `21.02`, `21.43`, `21.59`

### `non-text-widgets`

- DOM nodes in `.react-flow`: `7038`
- Code widgets: `0`
- Code widget shells: `426`
- Average frame time across `5` runs: `39.65ms`
- Average FPS across `5` runs: `25.22`
- Median FPS: `25.21`
- Per-run FPS: `25.24`, `25.21`, `25.21`, `25.21`, `25.24`

### `code-widgets`

- DOM nodes in `.react-flow`: `7940`
- Code widgets: `426`
- Code widget shells: `0`
- `.cm-line` nodes: `0`
- Highlighted spans under code widgets: `476`
- Average frame time across `5` runs: `22.56ms`
- Average FPS across `5` runs: `44.38`
- Median FPS: `44.75`
- Per-run FPS: `45.51`, `42.32`, `44.75`, `45.89`, `43.40`

### `full`

- DOM nodes in `.react-flow`: `8108`
- Code widgets: `426`
- Code widget shells: `0`
- `.cm-line` nodes: `0`
- Highlighted spans under code widgets: `476`
- Average frame time across `5` runs: `21.62ms`
- Average FPS across `5` runs: `46.26`
- Median FPS: `46.19`
- Per-run FPS: `46.80`, `46.11`, `46.19`, `46.19`, `46.00`

### Corrected conclusion

- The `122 FPS` single-pass claim was not reliable. The repeated rerun puts the flattened `DummyCodeMirror` path in the mid-40 FPS band, not the 120 FPS band.
- The implementation is live and does what it was intended to do:
  - syntax highlighting is still present
  - the idle preview no longer renders `.cm-line` wrappers
  - the code preview DOM is flatter than before
- The performance win is real, but modest, not dramatic.
  - previous addendum baseline: `code-widgets` `40.64 FPS`, `full` `43.74 FPS`
  - corrected repeated rerun: `code-widgets` `44.38 FPS`, `full` `46.26 FPS`
  - practical gain: roughly `+3.74 FPS` on `code-widgets` and `+2.52 FPS` on `full`
- The shell-only stages in this fixed region now benchmark lower than the real code-widget stages, so they are not a trustworthy subtraction baseline for this correction pass.
- The only defensible branch conclusion from this lower-risk refactor is:
  - the old dummy preview structure was part of the problem
  - flattening it while preserving syntax highlighting helps
  - but it does not erase the remaining pan/zoom cost in `All Settings`

## Addendum: SnapDOM SVG previews reduce DOM but do not buy a large enough pan/zoom win

- Date: `2026-03-07`
- Goal: test whether the inactive `CodeParam` preview can keep the current highlighted DOM appearance, but swap the live preview subtree for a single SnapDOM-captured SVG image surface.
- Change under test:
  - benchmark-only stages `code-widgets-snapdom` and `full-snapdom`
  - inactive code widgets render the normal `DummyCodeMirror` once, capture it with SnapDOM `toSvg(...)`, then replace it with a single `<img>` backed by the captured SVG
  - production behavior outside the benchmark stages was not changed

### Live DOM verification

- The SnapDOM benchmark path was confirmed live in the headed browser:
  - `code-widgets-snapdom` renders `426` code widgets
  - `.cm-line` count is `0`
  - SnapDOM-ready preview count is `426`
  - broken SnapDOM preview images: `0`
- Screenshot artifacts:
  - `perf/artifacts/frontend/settings-all-settings/code-widgets-snapdom-baseline-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/code-widgets-snapdom-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/full-snapdom-baseline-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/full-snapdom-visible.png`

### Repeated fixed-base rerun

- Measurement note:
  - fixed viewport transform: `matrix(0.1, 0, 0, 0.1, 779.9, -55.7)`
  - viewport size: `1440x1200`
  - each stage rerun used `5` browser-side pan/zoom loops of `180` frames each
  - compare these numbers only within this addendum

### `code-widgets` baseline

- DOM nodes in `.react-flow`: `8385`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `426`
- SnapDOM preview images: `0`
- Average frame time across `5` runs: `21.01ms`
- Average FPS across `5` runs: `47.61`
- Median FPS: `47.30`
- Max frame time: `34.30ms`
- Slow frames:
  - `>16.7ms`: `666`
  - `>33.3ms`: `9`
  - `>50ms`: `0`
- Per-run FPS: `47.12`, `46.90`, `47.30`, `48.38`, `48.38`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/code-widgets-snapdom-baseline-trace.json`

### `code-widgets-snapdom`

- DOM nodes in `.react-flow`: `7464`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `0`
- SnapDOM preview images: `426`
- Broken SnapDOM preview images: `0`
- Average frame time across `5` runs: `21.93ms`
- Average FPS across `5` runs: `45.61`
- Median FPS: `45.22`
- Max frame time: `42.50ms`
- Slow frames:
  - `>16.7ms`: `708`
  - `>33.3ms`: `17`
  - `>50ms`: `0`
- Per-run FPS: `45.22`, `44.95`, `45.21`, `45.52`, `47.21`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/code-widgets-snapdom-trace.json`

### `full` baseline

- DOM nodes in `.react-flow`: `8553`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `426`
- SnapDOM preview images: `0`
- Average frame time across `5` runs: `22.24ms`
- Average FPS across `5` runs: `44.96`
- Median FPS: `45.60`
- Max frame time: `50.90ms`
- Slow frames:
  - `>16.7ms`: `741`
  - `>33.3ms`: `21`
  - `>50ms`: `1`
- Per-run FPS: `46.19`, `45.60`, `45.17`, `42.24`, `45.83`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-snapdom-baseline-trace.json`

### `full-snapdom`

- DOM nodes in `.react-flow`: `7632`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `0`
- SnapDOM preview images: `426`
- Broken SnapDOM preview images: `0`
- Average frame time across `5` runs: `21.15ms`
- Average FPS across `5` runs: `47.29`
- Median FPS: `47.11`
- Max frame time: `66.90ms`
- Slow frames:
  - `>16.7ms`: `666`
  - `>33.3ms`: `11`
  - `>50ms`: `1`
- Per-run FPS: `46.58`, `46.85`, `47.11`, `47.52`, `48.43`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-snapdom-trace.json`

### SnapDOM conclusion

- SnapDOM does reduce DOM meaningfully in the target hotspot.
  - `code-widgets`: `8385` -> `7464` DOM nodes, `-921`
  - `full`: `8553` -> `7632` DOM nodes, `-921`
- But the pan/zoom result is not strong enough or clean enough to justify keeping the experiment.
  - isolated code stage: `47.61 FPS` -> `45.61 FPS`, about `-2.00 FPS`
  - full stage: `44.96 FPS` -> `47.29 FPS`, about `+2.33 FPS`
- That means the most generous read is still only a low-single-digit improvement in the real view, and the code-only stage did not improve at all.
- The practical branch conclusion is:
  - replacing inactive code previews with SnapDOM SVG images is not the large win we need
  - the DOM count drop alone does not translate into a decisive pan/zoom gain here
  - this direction was measured and rejected, and the benchmark-only implementation was reverted after recording these results

## Addendum: SnapDOM canvas previews are materially worse than both DOM and SVG

- Date: `2026-03-07`
- Goal: test whether replacing inactive `CodeParam` preview DOM with SnapDOM `canvas` surfaces performs better than the previously rejected SnapDOM SVG-image path.
- Change under test:
  - benchmark-only stages `code-widgets-canvas` and `full-canvas`
  - inactive code widgets render the normal `DummyCodeMirror` once, capture it with SnapDOM `toCanvas(...)`, then replace it with a single `<canvas>` surface
  - production behavior outside the benchmark stages was not changed

### Live DOM verification

- The canvas benchmark path was confirmed live in the headed browser:
  - `code-widgets-canvas` renders `426` code widgets
  - `.cm-line` count is `0`
  - ready canvas preview count is `426`
  - broken canvas previews: `0`
- Screenshot artifacts:
  - `perf/artifacts/frontend/settings-all-settings/code-widgets-canvas-baseline-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/code-widgets-canvas-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/full-canvas-baseline-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/full-canvas-visible.png`

### Repeated fixed-base rerun

- Measurement note:
  - fixed viewport transform: `matrix(0.1, 0, 0, 0.1, 779.9, -55.7)`
  - viewport size: `1440x1200`
  - each stage rerun used `5` browser-side pan/zoom loops of `180` frames each
  - compare these numbers only within this addendum

### `code-widgets` baseline

- DOM nodes in `.react-flow`: `8385`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `426`
- Canvas previews: `0`
- Average frame time across `5` runs: `21.53ms`
- Average FPS across `5` runs: `46.45`
- Median FPS: `46.64`
- Max frame time: `41.80ms`
- Slow frames:
  - `>16.7ms`: `684`
  - `>33.3ms`: `20`
  - `>50ms`: `0`
- Per-run FPS: `44.62`, `46.50`, `46.64`, `47.15`, `47.42`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/code-widgets-canvas-baseline-trace.json`

### `code-widgets-canvas`

- DOM nodes in `.react-flow`: `7464`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `0`
- Canvas previews: `426`
- Broken canvas previews: `0`
- Average frame time across `5` runs: `35.09ms`
- Average FPS across `5` runs: `28.50`
- Median FPS: `28.39`
- Max frame time: `43.70ms`
- Slow frames:
  - `>16.7ms`: `895`
  - `>33.3ms`: `605`
  - `>50ms`: `0`
- Per-run FPS: `28.38`, `28.39`, `27.91`, `29.11`, `28.71`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/code-widgets-canvas-trace.json`

### `full` baseline

- DOM nodes in `.react-flow`: `8553`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `426`
- Canvas previews: `0`
- Average frame time across `5` runs: `21.64ms`
- Average FPS across `5` runs: `46.21`
- Median FPS: `46.33`
- Max frame time: `33.90ms`
- Slow frames:
  - `>16.7ms`: `713`
  - `>33.3ms`: `8`
  - `>50ms`: `0`
- Per-run FPS: `46.09`, `45.26`, `46.48`, `46.33`, `46.91`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-canvas-baseline-trace.json`

### `full-canvas`

- DOM nodes in `.react-flow`: `7632`
- Param containers: `697`
- Resize handles: `627`
- Code widgets: `426`
- `.cm-line` nodes: `0`
- Canvas previews: `426`
- Broken canvas previews: `0`
- Average frame time across `5` runs: `38.78ms`
- Average FPS across `5` runs: `25.79`
- Median FPS: `25.91`
- Max frame time: `58.40ms`
- Slow frames:
  - `>16.7ms`: `895`
  - `>33.3ms`: `785`
  - `>50ms`: `7`
- Per-run FPS: `26.08`, `25.69`, `25.91`, `25.27`, `26.00`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-canvas-trace.json`

### Canvas conclusion

- The canvas version removes the same `921` DOM nodes as the SVG version, but it is dramatically slower in the actual pan/zoom benchmark.
  - `code-widgets`: `46.45 FPS` -> `28.50 FPS`, about `-17.95 FPS`
  - `full`: `46.21 FPS` -> `25.79 FPS`, about `-20.42 FPS`
- That means the canvas path is not just “not good enough”; it is actively much worse than the current DOM preview and much worse than the rejected SVG-image path.
- The most plausible interpretation is that hundreds of independently scaled raster canvases are significantly more expensive for this React Flow pan/zoom case than the existing DOM text path.
- Practical branch conclusion:
  - do not pursue the canvas inactive-preview path
  - keep the measurements and artifacts, but revert the benchmark-only implementation
