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

## Addendum: whole-section SnapDOM previews are the first large pan/zoom win, but they are an architectural tradeoff

- Date: `2026-03-07`
- Goal: test whether replacing each inactive section body with a single SnapDOM-captured surface is materially different from replacing only the code-widget subtrees.
- Change under test:
  - benchmark-only stage `full-section-snapdom`
  - keep the outer section frame, header, and chrome live
  - render the real section body once, capture it with SnapDOM `toSvg(...)`, then replace the entire body subtree with a single `<img>` surface
  - production behavior outside the benchmark stage was not changed
- Code paths:
  - `frontend/src/components/Pages/Project/settingsAllSettingsBenchmark.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `frontend/src/components/Section/Container/SettingsAllSettingsBenchmarkSnapdomSectionBody.tsx`

### Live DOM verification

- The whole-section SnapDOM path was confirmed live in the headed browser:
  - `42` section bodies render as SnapDOM wrappers
  - `42` ready SnapDOM preview images
  - `0` pending captures
  - `0` failed captures
  - `0` live param rows left in the `.react-flow` subtree
- Screenshot artifacts:
  - `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-baseline-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-visible.png`

### Repeated fixed-base rerun

- Measurement note:
  - fixed viewport transform: `matrix(0.1, 0, 0, 0.1, 779.9, -55.7)`
  - viewport size: `1440x1200`
  - each stage rerun used `5` browser-side fixed-transform replay loops of `180` frames each
  - this addendum mutates the live `.react-flow__viewport` transform directly and records `requestAnimationFrame` deltas
  - compare these numbers only within this addendum

### `full` baseline

- DOM nodes in `.react-flow`: `8553`
- Param containers: `697`
- Code widgets: `426`
- Section SnapDOM wrappers: `0`
- Section SnapDOM preview images: `0`
- Average frame time across `5` runs: `16.58ms`
- Average FPS across `5` runs: `60.31`
- Median FPS: `60.52`
- Max frame time: `30.70ms`
- Slow frames:
  - `>16.7ms`: `341`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `58.88`, `61.03`, `60.51`, `60.52`, `60.67`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-baseline-trace.json`

### `full-section-snapdom`

- DOM nodes in `.react-flow`: `1149`
- Param containers: `0`
- Code widgets: `0`
- Section SnapDOM wrappers: `42`
- Section SnapDOM preview images: `42`
- Average frame time across `5` runs: `8.31ms`
- Average FPS across `5` runs: `120.33`
- Median FPS: `120.01`
- Max frame time: `11.30ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `120.01`, `121.36`, `120.33`, `119.99`, `120.00`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-trace.json`

### Whole-section conclusion

- This is the first SnapDOM experiment in this branch that produces a large pan/zoom gain.
  - DOM nodes: `8553` -> `1149`, `-7404`
  - average FPS: `60.31` -> `120.33`, about `+60.02 FPS`
- That is qualitatively different from the rejected code-widget-only SnapDOM experiments. Replacing only `426` code preview subtrees was not enough; replacing the entire inactive section body is.
- The reason is straightforward:
  - this removes the full inactive section-body cost bucket at once
  - row layout, widgets, code previews, and nested subtree DOM are all gone from the live pan/zoom path
- But this is not a behavior-preserving optimization. It is an architectural mode:
  - inactive section bodies become static preview surfaces
  - inner text selection, hover behavior, and inline widget interaction are gone until hydration
  - only the outer section shell remains live
- Practical branch conclusion:
  - if the product can accept inactive-section preview mode with explicit hydration on interaction, this direction is worth serious consideration
  - if the product requires fully live inactive section bodies, this result should be treated as an upper-bound experiment, not a directly landable refactor

## Addendum: inactive-to-active section hydration takes about 130ms on average

- Date: `2026-03-07`
- Goal: measure the cost of making a snapped inactive section body live again after the user clicks it.
- Change under test:
  - same benchmark-only `full-section-snapdom` stage as the previous addendum
  - one follow-up benchmark-only refinement in `SettingsAllSettingsBenchmarkSnapdomSectionBody`:
    - when a section becomes active, swap to the live body immediately during render instead of waiting for an effect to clear `previewSrc`
    - this removes an artificial one-render delay from the activation path

### Automated behavior guard

- Playwright coverage now verifies the activation path directly:
  - open `full-section-snapdom`
  - click the first snapped section
  - assert exactly one section body becomes `live-active`
  - assert the live body exposes real param rows and real enabled controls

### Measurement method

- Same target page: Settings project, `All Settings`, headed Chrome DevTools MCP session
- Target sections:
  - the currently live section
  - the next snapped ready section
- Repeated sequence:
  - alternate clicks between those two sections so every measured target starts in the inactive `ready` preview state
- Transition metrics:
  - `liveMs`: click to target wrapper status `live-active`
  - `usableMs`: click to first enabled control inside the live body subtree
  - `focusableMs`: click to that first enabled control successfully taking focus

### Repeated transition rerun

- Initial state before the measured sequence:
  - `41` ready preview sections
  - `1` already-live section
- Measured sequence:
  - `ready` section `07b6d359-bd61-47c5-b61c-e262d728de31`
  - `live` section `038e6d5e-fd6f-449a-9222-3be6fc4d9a42`
  - alternate between them for `5` measured activations
- Per-run results:
  - run 1: `live 137.9ms`, `usable 137.9ms`, `focusable 138.9ms`
  - run 2: `live 156.3ms`, `usable 156.4ms`, `focusable 157.3ms`
  - run 3: `live 55.3ms`, `usable 55.4ms`, `focusable 56.4ms`
  - run 4: `live 207.9ms`, `usable 207.9ms`, `focusable 208.9ms`
  - run 5: `live 101.8ms`, `usable 101.9ms`, `focusable 102.7ms`
- Aggregate results:
  - average `liveMs`: `131.84ms`
  - average `usableMs`: `131.90ms`
  - average `focusableMs`: `132.84ms`
  - max `liveMs`: `207.90ms`
  - max `usableMs`: `207.90ms`
  - max `focusableMs`: `208.90ms`
- Active-state DOM during the transition sequence:
  - DOM nodes in `.react-flow`: `1351`
  - live param rows: `17`
  - remaining SnapDOM preview images: `40`

### Activation trace

- A single traced activation rerun measured `192.2ms` from click to a live enabled control.
- Trace artifact:
  - `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-activation-trace.json`
- DevTools insight:
  - one forced-reflow cluster was reported during activation
  - top contributors:
    - `43ms` in `updateHeight` at `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
    - `7ms` in `captureSnapshot` at `frontend/src/components/Section/Container/SettingsAllSettingsBenchmarkSnapdomSectionBody.tsx`

### Activation conclusion

- The whole-section preview path solves pan/zoom convincingly, but the section activation path is visibly not free.
- On this benchmark, the current hydration path is roughly:
  - best case: about `55ms`
  - typical case: about `130ms`
  - slower case: about `200ms`
- The dominant activation cost is not the SnapDOM image removal itself. The trace points more directly at:
  - remounting the real section body
  - section-body layout work, especially `KwargsControls` height/update logic
  - a smaller additional cost to recapture the section that just became inactive
- Practical branch conclusion:
  - if we pursue the inactive-preview architecture, the next optimization target is activation latency, not pan/zoom FPS
  - the first concrete hotspot to inspect is `frontend/src/components/Section/SectionParts/KwargsControls.tsx`

## Addendum: `opacity: 0` on inactive section bodies has a large pan/zoom effect

- Date: `2026-03-07`
- Goal: test whether keeping the real section bodies mounted, but hiding inactive section bodies with `opacity: 0`, changes pan/zoom performance in the same Settings `All Settings` benchmark.
- Benchmark-only change:
  - new `full-section-opacity-hidden` stage
  - every section body still mounts its real live DOM
  - inactive section bodies are wrapped in a benchmark-only container with `opacity: 0` and `pointer-events: none`
  - the active section body remains fully visible and live

### Live DOM verification

- The opacity-hidden path was confirmed live in the headed browser:
  - `42` opacity-hidden section wrappers
  - `41` inactive hidden section bodies
  - `1` visible active section body
  - `0` SnapDOM preview images
- Screenshot artifacts:
  - `perf/artifacts/frontend/settings-all-settings/full-opacity-baseline-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/full-section-opacity-hidden-visible.png`
  - `perf/artifacts/frontend/settings-all-settings/full-section-opacity-hidden-snapdom-visible.png`

### Repeated fixed-base rerun

- Measurement note:
  - fixed viewport transform: `matrix(0.1, 0, 0, 0.1, 779.9, -55.7)`
  - observed viewport size in headed Chrome: `1440x772`
  - each stage rerun used `5` browser-side fixed-transform replay loops of `180` frames each
  - this addendum mutates the live `.react-flow__viewport` transform directly and records `requestAnimationFrame` deltas
  - compare these numbers only within this addendum

### `full` baseline

- DOM nodes in `.react-flow`: `8553`
- Param containers: `697`
- Code widgets: `426`
- Opacity-hidden section wrappers: `0`
- Average frame time across `5` runs: `21.86ms`
- Average FPS across `5` runs: `45.74`
- Median FPS: `45.77`
- Max frame time: `41.60ms`
- Slow frames:
  - `>16.7ms`: `676`
  - `>33.3ms`: `1`
  - `>50ms`: `0`
- Per-run FPS: `46.26`, `45.48`, `45.33`, `45.77`, `45.87`

### `full-section-opacity-hidden`

- DOM nodes in `.react-flow`: `8637`
- Param containers: `697`
- Code widgets: `426`
- Text input dummy previews: `426`
- Opacity-hidden section wrappers: `42`
- Hidden inactive section bodies: `41`
- Visible active section bodies: `1`
- SnapDOM preview images: `0`
- Average frame time across `5` runs: `8.33ms`
- Average FPS across `5` runs: `120.01`
- Median FPS: `119.99`
- Max frame time: `16.60ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `119.99`, `120.11`, `119.98`, `120.04`, `119.94`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-section-opacity-hidden-trace.json`

### `full-section-snapdom` reference rerun

- DOM nodes in `.react-flow`: `1251`
- Param containers: `8`
- Code widgets: `6`
- SnapDOM preview images: `41`
- Average frame time across `5` runs: `8.33ms`
- Average FPS across `5` runs: `120.03`
- Median FPS: `120.01`
- Max frame time: `9.50ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `119.98`, `120.07`, `120.01`, `119.98`, `120.09`

### Opacity conclusion

- In this fixed-transform pan benchmark, `opacity: 0` on inactive section bodies does have a very large effect.
  - `full`: `45.74 FPS`
  - `full-section-opacity-hidden`: `120.01 FPS`
  - gain versus `full`: about `+74.27 FPS`
- The surprising part is that this happens while keeping almost the entire DOM mounted.
  - DOM nodes: `8553` -> `8637`, `+84`
  - param containers: still `697`
  - code widgets: still `426`
- The practical interpretation is that, for this benchmark, the dominant steady-state cost is not just “DOM exists” or “layout exists.”
  - the dominant cost appears much closer to painting and compositing the visible section-body content during the transform replay
  - making inactive bodies fully transparent is enough to collapse that cost almost to the same level as whole-section SnapDOM previews
- Important caveats:
  - this is still a benchmark-only stage, not a production behavior change
  - it measures steady-state pan/zoom only, not activation or interaction semantics
  - inactive section bodies remain mounted, so follow-up work still needs to check focus behavior, event handling, invalidation behavior, and whether active/inactive transitions stay smooth

## Addendum: SnapDOM preview plus hidden live body keeps pan fast, but makes activation worse

- Date: `2026-03-07`
- Goal: test the combined idea:
  - inactive section bodies render as SnapDOM previews
  - the real live body stays mounted underneath, hidden with `opacity: 0`
  - on activation, drop the preview immediately and reveal the already-mounted live body
- Benchmark-only stage:
  - `full-section-snapdom-hidden-live`

### What changed in the benchmark harness

- Added a new benchmark stage in `settingsAllSettingsBenchmark.tsx`:
  - `full-section-snapdom-hidden-live`
- Extended `SettingsAllSettingsBenchmarkSnapdomSectionBody`:
  - keep the live section body mounted during SnapDOM preview mode
  - mark inactive hidden-live bodies as `hidden-ready`
  - drop the preview immediately when the section becomes active
- Extended Playwright coverage:
  - the benchmark ladder now includes the new stage
  - a new E2E guard verifies the combined stage can activate a clicked section and expose real live controls

### Live DOM verification

- The combined path was confirmed live in headed Chrome:
  - `42` SnapDOM wrappers
  - `42` ready SnapDOM previews
  - `42` mounted opacity-hidden live bodies
  - `42` `hidden-ready` live bodies
  - `697` mounted param rows
  - `426` mounted text input dummy previews
  - DOM nodes in `.react-flow`: `8679`
- Screenshot artifacts:
  - `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-hidden-live-visible-rerun.png`
  - `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-hidden-live-activated-visible.png`

### Repeated fixed-base pan rerun

- Measurement note:
  - fixed viewport transform: `matrix(0.1, 0, 0, 0.1, 779.9, -55.7)`
  - observed viewport size in headed Chrome: `1440x772`
  - each stage rerun used `5` browser-side fixed-transform replay loops of `180` frames each
  - compare these numbers only within this addendum

### `full-section-snapdom` reference rerun

- DOM nodes in `.react-flow`: `1251`
- SnapDOM preview images: `41`
- Mounted hidden live bodies: `0`
- Text input dummy previews: `6`
- Average frame time across `5` runs: `8.35ms`
- Average FPS across `5` runs: `119.82`
- Median FPS: `120.01`
- Max frame time: `17.60ms`
- Slow frames:
  - `>16.7ms`: `1`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `120.06`, `120.01`, `120.06`, `119.33`, `119.66`

### `full-section-opacity-hidden` reference rerun

- DOM nodes in `.react-flow`: `8637`
- SnapDOM preview images: `0`
- Mounted opacity-hidden live bodies: `42`
- Hidden inactive live bodies: `41`
- Text input dummy previews: `426`
- Average frame time across `5` runs: `8.34ms`
- Average FPS across `5` runs: `119.94`
- Median FPS: `120.07`
- Max frame time: `16.00ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `119.40`, `120.06`, `120.09`, `120.09`, `120.07`

### `full-section-snapdom-hidden-live`

- DOM nodes in `.react-flow`: `8679`
- SnapDOM wrappers: `42`
- Ready SnapDOM previews: `42`
- SnapDOM preview images: `42`
- Mounted opacity-hidden live bodies: `42`
- Hidden-ready live bodies: `42`
- Visible active live bodies: `0`
- Mounted param rows: `697`
- Text input dummy previews: `426`
- Average frame time across `5` runs: `8.33ms`
- Average FPS across `5` runs: `120.09`
- Median FPS: `120.03`
- Max frame time: `9.40ms`
- Slow frames:
  - `>16.7ms`: `0`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `120.32`, `120.03`, `120.02`, `120.10`, `119.98`
- Trace artifact:
  - `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-hidden-live-trace.json`

### Pan conclusion

- The combined mode does preserve the steady-state pan/zoom win.
  - `full-section-snapdom`: `119.82 FPS`
  - `full-section-opacity-hidden`: `119.94 FPS`
  - `full-section-snapdom-hidden-live`: `120.09 FPS`
- So from a pan-only perspective, the combined idea works.
- But it does not buy anything over the two simpler benchmark modes. All three are effectively in the same `~120 FPS` band.

### Activation rerun

- Measurement method:
  - pick two ready inactive sections
  - alternate clicks between them for `5` activations
  - measure:
    - `previewGoneMs`: click to the target preview image disappearing
    - `liveMs`: click to the target body entering its live active state
    - `usableMs`: click to the first enabled control inside the target body
    - `focusableMs`: click to that control accepting focus

### `full-section-snapdom` activation reference rerun

- Per-run results:
  - run 1: `140.6ms`
  - run 2: `147.5ms`
  - run 3: `48.3ms`
  - run 4: `188.0ms`
  - run 5: `96.1ms`
- Aggregate:
  - average `previewGoneMs`: `124.10ms`
  - average `liveMs`: `124.10ms`
  - average `usableMs`: `124.10ms`
  - average `focusableMs`: `124.10ms`
  - max `usableMs`: `188.00ms`

### `full-section-snapdom-hidden-live` activation rerun

- Per-run results:
  - run 1: `403.4ms`
  - run 2: `161.9ms`
  - run 3: `245.6ms`
  - run 4: `304.9ms`
  - run 5: `145.6ms`
- Aggregate:
  - average `previewGoneMs`: `252.28ms`
  - average `liveMs`: `252.28ms`
  - average `usableMs`: `252.28ms`
  - average `focusableMs`: `252.28ms`
  - max `usableMs`: `403.40ms`
- Single traced activation:
  - `605ms` from click to preview gone / live / usable in the sampled run
  - trace artifact:
    - `perf/artifacts/frontend/settings-all-settings/full-section-snapdom-hidden-live-activation-trace.json`

### Combined-stage conclusion

- The combined mode fails the real goal.
  - It keeps the pan/zoom win.
  - But it makes the inactive-to-active transition materially worse than plain SnapDOM.
- Within this benchmark:
  - plain SnapDOM activation: about `124ms` average
  - combined SnapDOM + hidden live body activation: about `252ms` average
  - regression: about `+128ms`
- So this is not a best-of-both-worlds path. It keeps the steady-state rendering cheap, but the still-mounted hidden live bodies appear to make section activation and section-state turnover substantially more expensive.
- Practical branch conclusion:
  - this combined direction should be treated as a rejected experiment
  - if we continue exploring the inactive-preview architecture, the better path is still SnapDOM-only plus direct work on activation latency hot spots, not keeping every inactive live body mounted underneath

## Correction: screenshot gate invalidates the whole-section SnapDOM addenda

- Date: `2026-03-07`
- Why this correction exists:
  - a CDP screenshot audit on the current branch showed that the whole-section SnapDOM stages were not visually benchmarking the intended thing
  - the prior addenda at:
    - `1730-1900` (`full-section-snapdom` and its activation addendum)
    - `2004-2170` (`full-section-snapdom-hidden-live`)
    should no longer be treated as valid decision-making data

### What the screenshot audit showed

- Reference live full stage:
  - `perf/artifacts/frontend/settings-all-settings/visual-validation-2026-03-07/full-baseline-visible.png`
- Corrected plain SnapDOM stage after fixing capture size:
  - `perf/artifacts/frontend/settings-all-settings/visual-validation-2026-03-07/full-section-snapdom-corrected-visible.png`
- Corrected SnapDOM + hidden-live stage after fixing capture size:
  - `perf/artifacts/frontend/settings-all-settings/visual-validation-2026-03-07/full-section-snapdom-hidden-live-corrected-visible.png`
- The SnapDOM preview images are no longer tiny transformed thumbnails:
  - sample corrected preview dimensions: natural width about `116px`, capture width about `114px`
  - this is materially better than the broken `12px`-wide captures
- But the corrected screenshots still do not look like faithful section-body previews.
  - the live full stage shows dense visible param content
  - both corrected SnapDOM stages still show mostly empty dark cards at the benchmark zoom region

### Practical conclusion

- The harness bug was real, and it is now fixed enough to expose the deeper problem.
- Even with corrected capture dimensions, whole-section SnapDOM is still not visually faithful for this benchmark target.
- So the previously reported FPS and activation numbers for:
  - `full-section-snapdom`
  - `full-section-snapdom-hidden-live`
  are invalid and should not guide product or architecture choices.
- This is exactly the failure mode the plan now forbids:
  - if screenshots do not confirm that the benchmarked stage matches the intended target, the numbers do not count

## Addendum: valid rerun shows `full-section-opacity-hidden` still keeps the large pan win

- Date: `2026-03-07`
- Goal: replace the invalid section-SnapDOM comparison with a visually valid section-body comparison.
- Valid stages in this rerun:
  - `full`
  - `full-section-opacity-hidden`
- Invalid stages intentionally excluded from the comparison:
  - `full-section-snapdom`
  - `full-section-snapdom-hidden-live`

### Visual confirmation

- `full` is visually correct for the benchmark target:
  - `perf/artifacts/frontend/settings-all-settings/visual-validation-2026-03-07/full-baseline-visible.png`
- `full-section-opacity-hidden` is also visually correct for its intended benchmark target:
  - `perf/artifacts/frontend/settings-all-settings/visual-validation-2026-03-07/full-section-opacity-hidden-corrected-visible.png`
  - the empty inactive section bodies are intentional in this stage because the benchmark is explicitly measuring hidden-but-mounted content

### Measurement note

- Fixed viewport transform: `matrix(0.1, 0, 0, 0.1, 779.9, -55.7)`
- Viewport size: `1440x1200`
- Each stage rerun used `5` browser-side fixed-transform replay loops of `180` frames each:
  - `36` settle frames
  - `36` pan down/right frames
  - `36` pan back up/left frames
  - `18` zoom-in frames
  - `18` zoom-out frames
  - `36` settle frames
- Compare these numbers only within this addendum.

### `full`

- DOM nodes in `.react-flow`: `8553`
- Param containers: `697`
- Code widgets: `426`
- Opacity-hidden section wrappers: `0`
- Average frame time across `5` runs: `15.14ms`
- Average FPS across `5` runs: `66.06`
- Median FPS: `66.11`
- Max frame time: `25.90ms`
- Slow frames:
  - `>16.7ms`: `325`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `65.29`, `65.89`, `66.52`, `66.11`, `66.51`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-corrected-rerun-trace.json`

### `full-section-opacity-hidden`

- DOM nodes in `.react-flow`: `8637`
- Param containers: `697`
- Code widgets: `426`
- Opacity-hidden section wrappers: `42`
- Hidden inactive section bodies: `41`
- Visible active section bodies: `1`
- SnapDOM preview images: `0`
- Average frame time across `5` runs: `8.34ms`
- Average FPS across `5` runs: `119.85`
- Median FPS: `119.99`
- Max frame time: `17.20ms`
- Slow frames:
  - `>16.7ms`: `1`
  - `>33.3ms`: `0`
  - `>50ms`: `0`
- Per-run FPS: `120.00`, `119.30`, `120.05`, `119.99`, `119.92`
- Trace artifact: `perf/artifacts/frontend/settings-all-settings/full-section-opacity-hidden-corrected-rerun-trace.json`

### Corrected takeaway

- The valid large section-body win in this area is still `full-section-opacity-hidden`, not whole-section SnapDOM.
- In this matched rerun:
  - `full`: `66.06 FPS`
  - `full-section-opacity-hidden`: `119.85 FPS`
  - gain: about `+53.79 FPS`
- That result is still surprising, but it is now tied to a visually confirmed stage.
- The strongest remaining interpretation is:
  - the dominant steady-state cost in the fully live `All Settings` view is heavily tied to painting/compositing visible section-body content during pan/zoom
  - simply keeping the same DOM mounted is not enough to preserve the original cost if that content is no longer visibly painted

## Addendum: corrected SnapDOM wrapper now renders faithfully, but it still loses to plain hidden live bodies

- Date: `2026-03-07`
- Goal: repair the whole-section SnapDOM harness so it benchmarks a faithful preview instead of a broken collapsed wrapper, then rerun the comparison.
- Important harness correction:
  - the benchmark wrapper now preserves the original section-body direct children with `display: contents`
  - SnapDOM captures from the real `CustomResizable` root
  - the preview is rendered as an absolute crop overlay inside the real section container
  - for layout stability, both corrected SnapDOM benchmark stages keep the live body mounted underneath:
    - `full-section-snapdom`: live body hidden with `visibility: hidden`
    - `full-section-snapdom-hidden-live`: live body hidden with `opacity: 0`
- Compare these numbers only within this addendum. They are not directly comparable to the invalid earlier SnapDOM addenda.

### Visual confirmation

- Reference live stage:
  - `perf/artifacts/frontend/settings-all-settings/snapdom-fidelity-2026-03-07/full-baseline-visible.png`
- Corrected plain SnapDOM stage:
  - `perf/artifacts/frontend/settings-all-settings/snapdom-fidelity-2026-03-07/full-section-snapdom-fixed-visible.png`
- Corrected SnapDOM + hidden-live stage:
  - `perf/artifacts/frontend/settings-all-settings/snapdom-fidelity-2026-03-07/full-section-snapdom-hidden-live-fixed-visible.png`
- Corrected opacity-hidden stage:
  - `perf/artifacts/frontend/settings-all-settings/snapdom-fidelity-2026-03-07/full-section-opacity-hidden-fixed-visible.png`
- Structural validation after the wrapper fix:
  - live hidden body children keep their real width, about `279px` visible at the benchmark zoom for the sampled section instead of collapsing to `12px`
  - the sampled preview overlay width is about `547px` in unscaled section coordinates, matching the real section-body crop rather than the earlier tiny capture
  - Playwright now has an explicit fidelity guard for this:
    - it checks that sampled SnapDOM roots keep real live-child widths and non-collapsed preview overlays

### Measurement note

- Fixed viewport transform replay:
  - base transform: `translate(779.9px, -55.7px) scale(0.1)`
  - per measured loop:
    - `36` pan down/right frames
    - `36` pan back up/left frames
    - `18` zoom-in frames
    - `18` zoom-out frames
- `5` repeated loops per stage after a `500ms` settle
- Representative pan traces saved for:
  - `perf/artifacts/frontend/settings-all-settings/snapdom-fidelity-2026-03-07/full-section-opacity-hidden-fixed-pan-trace.json`
  - `perf/artifacts/frontend/settings-all-settings/snapdom-fidelity-2026-03-07/full-section-snapdom-fixed-pan-trace.json`

### `full`

- DOM nodes in `.react-flow`: `8595`
- Average frame time across `5` runs: `17.81ms`
- Average FPS across `5` runs: `56.16`
- Max frame time: `42.00ms`
- Per-run FPS: `56.10`, `55.86`, `56.85`, `56.11`, `55.86`

### `full-section-opacity-hidden`

- DOM nodes in `.react-flow`: `8595`
- SnapDOM preview images: `0`
- Hidden inactive section bodies: `42`
- Average frame time across `5` runs: `8.67ms`
- Average FPS across `5` runs: `115.32`
- Max frame time: `25.10ms`
- Per-run FPS: `114.70`, `114.69`, `116.76`, `114.66`, `115.79`

### `full-section-snapdom`

- DOM nodes in `.react-flow`: `8679`
- SnapDOM preview images: `42`
- Hidden inactive section bodies: `0`
- Average frame time across `5` runs: `12.98ms`
- Average FPS across `5` runs: `77.06`
- Max frame time: `17.80ms`
- Per-run FPS: `76.24`, `77.61`, `75.29`, `78.55`, `77.60`

### `full-section-snapdom-hidden-live`

- DOM nodes in `.react-flow`: `8679`
- SnapDOM preview images: `42`
- Hidden inactive section bodies: `42`
- Average frame time across `5` runs: `10.31ms`
- Average FPS across `5` runs: `97.30`
- Max frame time: `50.00ms`
- Per-run FPS: `88.17`, `96.00`, `102.04`, `102.03`, `98.25`

### Activation rerun

- Corrected plain SnapDOM activation:
  - repeated alternating clicks between two preview sections
  - average `liveMs`: `285.16ms`
  - average `usableMs`: `285.16ms`
  - average `focusableMs`: `412.44ms`
  - max `liveMs`: `505.50ms`
- Corrected SnapDOM + hidden-live activation:
  - repeated alternating clicks between two preview sections
  - average `liveMs`: `307.10ms`
  - average `usableMs`: `307.12ms`
  - average `focusableMs`: `461.30ms`
  - max `liveMs`: `536.80ms`
- Representative activation trace:
  - `perf/artifacts/frontend/settings-all-settings/snapdom-fidelity-2026-03-07/full-section-snapdom-fixed-activation-trace.json`
  - single traced activation sample: about `589.7ms` to a live usable section

### Corrected takeaway

- SnapDOM can now be made visually faithful in this benchmark harness.
- But once the preview is faithful, it is still not the best performance path here:
  - `full`: `56.16 FPS`
  - `full-section-snapdom`: `77.06 FPS`
  - `full-section-snapdom-hidden-live`: `97.30 FPS`
  - `full-section-opacity-hidden`: `115.32 FPS`
- So the current branch conclusion is:
  - corrected whole-section SnapDOM is a real improvement over fully live section bodies
  - but it is materially worse than simply hiding inactive live bodies
  - and its activation path is still expensive, around `285-307ms` average in this corrected rerun
- Practical implication:
  - if the goal is maximum pan/zoom gain in `All Settings`, `opacity: 0` on inactive section bodies is still the strongest result on this branch
  - if the goal is a visually faithful inactive surrogate, SnapDOM is now workable, but it does not currently justify itself on performance or activation latency

## Addendum: plain section activation is slow even without SnapDOM, and the cliff is in the live widget layer

- Date: `2026-03-07`
- Goal: verify whether the visible section-activation lag still exists in the plain fully live `All Settings` view, then isolate which benchmark layer introduces it.
- Method:
  - repeated alternating clicks between the two visible top-row sections (`shortcuts` and `gui`)
  - measured `click -> active outline class flips` in the live page
  - `6` runs per stage
  - compare these numbers only within this addendum

### Visual confirmation

- Plain full stage before activation:
  - `perf/artifacts/frontend/settings-all-settings/activation-lag-2026-03-07/full-before-click.png`
- Plain full stage after activation:
  - `perf/artifacts/frontend/settings-all-settings/activation-lag-2026-03-07/full-after-click.png`
- `non-text-widgets` stage before activation:
  - `perf/artifacts/frontend/settings-all-settings/activation-lag-2026-03-07/non-text-widgets-before-click.png`
- `non-text-widgets` stage after activation:
  - `perf/artifacts/frontend/settings-all-settings/activation-lag-2026-03-07/non-text-widgets-after-click.png`

### Activation ladder

- `frame-only`
  - average `46.68ms`
  - min `39.80ms`
  - max `52.90ms`
- `header-only`
  - average `74.65ms`
  - min `35.00ms`
  - max `91.20ms`
- `section-body-shell`
  - average `62.52ms`
  - min `19.50ms`
  - max `95.30ms`
- `static-param-list`
  - average `74.40ms`
  - min `39.30ms`
  - max `100.00ms`
- `param-container-shell`
  - average `77.07ms`
  - min `38.70ms`
  - max `99.60ms`
- `non-text-widgets`
  - average `220.40ms`
  - min `127.90ms`
  - max `422.10ms`
- `code-widgets`
  - average `226.33ms`
  - min `140.80ms`
  - max `384.90ms`
- `full`
  - average `230.80ms`
  - min `146.50ms`
  - max `401.40ms`
- `full-section-opacity-hidden`
  - average `230.52ms`
  - min `146.90ms`
  - max `395.20ms`
- `full-section-opacity-1pct`
  - average `236.17ms`
  - min `148.50ms`
  - max `413.50ms`

### What changed, and what did not

- The lag is real in plain `full`, without SnapDOM.
- `opacity` is not the cause:
  - `full`: `230.80ms`
  - `full-section-opacity-hidden`: `230.52ms`
  - `full-section-opacity-1pct`: `236.17ms`
- The section outline path itself is not the main problem:
  - `frame-only` is only about `46.68ms`
- The row shell is not the main activation cliff either:
  - `param-container-shell` is only about `77.07ms`
- The big jump is when real widgets return:
  - `param-container-shell -> non-text-widgets`: about `+143.33ms`
- Code widgets are only a small extra activation cost on top of that:
  - `non-text-widgets -> code-widgets`: about `+5.93ms`
  - `code-widgets -> full`: about `+4.47ms`

### Trace findings

- Representative full-stage activation trace:
  - `perf/artifacts/frontend/settings-all-settings/activation-lag-2026-03-07/full-activation-trace.json`
  - traced `click -> active` sample: about `550.30ms`
- Representative `non-text-widgets` activation trace:
  - `perf/artifacts/frontend/settings-all-settings/activation-lag-2026-03-07/non-text-widgets-activation-trace.json`
  - traced `click -> active` sample: about `584.15ms`

- In both traces, the click handler itself is not the slow part:
  - `EventDispatch` was only about `13-15ms`
  - the optimistic `route_set_active_ids` request is sent immediately after the click
- The dominant cost is post-click React work on the main thread:
  - `RunMicrotasks` / `FunctionCall` consumed about `534-569ms`
  - the trace is dominated by `commitPassiveMountOnFiber`, `recursivelyTraversePassiveMountEffects`, and related React commit work
- The strongest widget-specific signal in the slow trace is the combobox stack:
  - repeated `downshift` passive-effect frames dominate the widget-layer sample
  - notable functions include `wrapper`, the anonymous `downshift` passive-effect path, `setTimeout`, `clearTimeout`, and follow-on hook updates
- GC is a secondary but real factor in the slow path:
  - the `non-text-widgets` sample included both `MajorGC` and `MinorGC`
  - that points at meaningful allocation churn during the activation rerender
- `setZIndices` / `cloneDeep` still exists in the activation path, but it was not the dominant cost in these traces.

### Corrected takeaway

- The user observation was correct:
  - section activation is still slow in the plain fully live view
  - SnapDOM removal and opacity changes are not the primary cause
- The current best diagnosis is:
  - the activation cliff is mostly the live widget layer
  - within that layer, the largest trace signal is the combobox / `downshift` effect path
  - code widgets are not the main remaining activation problem, even though they were a major steady-state pan/zoom cost
- So the next optimization target for activation should be:
  - reduce the number of widget subtrees that do meaningful work when `activeIds` changes
  - especially the combobox / passive-effect-heavy path

## Addendum: deeper activation split shows dropdown / combobox widgets explain most of the non-text activation cliff

- Date: `2026-03-07`
- Goal: make the activation diagnosis more concrete by splitting the `non-text-widgets` stage into smaller widget families, then comparing activation timing and traces.
- Method:
  - repeated alternating clicks between the same two visible top-row sections (`shortcuts` and `gui`)
  - measured `click -> active outline class flips`
  - `6` runs per stage
  - compare these numbers only within this addendum

### Visual validation

- `dropdown-widgets` screenshot:
  - `perf/artifacts/frontend/settings-all-settings/activation-deep-dive-2026-03-07/dropdown-widgets-visible.png`
  - live counts: `76` combobox inputs, `0` switches, `125` non-text widget shells, `426` text-family widget shells
- `switch-widgets` screenshot:
  - `perf/artifacts/frontend/settings-all-settings/activation-deep-dive-2026-03-07/switch-widgets-visible.png`
  - live counts: `0` combobox inputs, `119` switches, `82` non-text widget shells, `426` text-family widget shells
- `non-text-widgets-no-dropdown` screenshot:
  - `perf/artifacts/frontend/settings-all-settings/activation-deep-dive-2026-03-07/non-text-widgets-no-dropdown-visible.png`
  - live counts: `0` combobox inputs, `119` switches, `76` non-text widget shells, `426` text-family widget shells

### Activation split

- `param-container-shell`
  - average `75.70ms`
  - min `27.60ms`
  - max `92.10ms`
  - runs `88.00`, `91.20`, `92.10`, `89.90`, `65.40`, `27.60`
- `other-non-text-widgets`
  - average `104.60ms`
  - min `56.60ms`
  - max `231.00ms`
  - runs `231.00`, `159.00`, `60.90`, `61.50`, `58.60`, `56.60`
- `switch-widgets`
  - average `122.00ms`
  - min `67.50ms`
  - max `316.80ms`
  - runs `316.80`, `124.20`, `78.80`, `74.00`, `67.50`, `70.70`
- `non-text-widgets-no-dropdown`
  - average `124.83ms`
  - min `71.10ms`
  - max `329.50ms`
  - runs `329.50`, `105.60`, `95.00`, `71.10`, `71.90`, `75.90`
- `dropdown-widgets`
  - average `175.70ms`
  - min `114.30ms`
  - max `395.90ms`
  - runs `395.90`, `119.50`, `121.40`, `116.50`, `114.30`, `186.60`
- `non-text-widgets`
  - average `228.05ms`
  - min `131.10ms`
  - max `415.30ms`
  - runs `415.30`, `169.10`, `131.30`, `134.20`, `131.10`, `387.30`
- `code-widgets`
  - average `244.40ms`
  - min `149.90ms`
  - max `476.10ms`
  - runs `476.10`, `154.80`, `149.90`, `152.40`, `235.50`, `297.70`
- `full`
  - average `254.27ms`
  - min `155.70ms`
  - max `439.90ms`
  - runs `439.90`, `192.30`, `160.20`, `155.70`, `253.60`, `323.90`

### What this isolates

- `dropdown-widgets` is the biggest single non-text bucket in activation.
  - `param-container-shell -> dropdown-widgets`: about `+100.00ms`
- Removing dropdowns cuts the non-text activation cliff by almost half.
  - `non-text-widgets`: `228.05ms`
  - `non-text-widgets-no-dropdown`: `124.83ms`
  - delta: about `-103.22ms`
- So the dropdown / combobox path explains most of the `param-container-shell -> non-text-widgets` jump.
- There is still a smaller secondary activation cost in the remaining live widgets.
  - `param-container-shell -> non-text-widgets-no-dropdown`: about `+49.13ms`
  - `switch-widgets` and `other-non-text-widgets` both sit above the shell baseline, but far below the dropdown stage
- Code widgets are still not the main activation problem.
  - `non-text-widgets -> code-widgets`: about `+16.35ms`
  - `code-widgets -> full`: about `+9.87ms`

### Trace comparison

- Representative dropdown-only activation trace:
  - `perf/artifacts/frontend/settings-all-settings/activation-deep-dive-2026-03-07/dropdown-widgets-activation-trace.json`
- Representative no-dropdown activation trace:
  - `perf/artifacts/frontend/settings-all-settings/activation-deep-dive-2026-03-07/non-text-widgets-no-dropdown-activation-trace.json`
- Representative switch-only activation trace:
  - `perf/artifacts/frontend/settings-all-settings/activation-deep-dive-2026-03-07/switch-widgets-activation-trace.json`

- The dropdown-only trace strongly reinforces the earlier `downshift` suspicion.
  - `downshift` matches in the trace: `1569`
  - `MinorGC`: `16`
  - `MajorGC`: `2`
  - repeated stacks include `downshift` `wrapper`, `validateControlledUnchanged2`, `setTimeout`, `clearTimeout`, and React passive-mount frames
- The no-dropdown and switch-only traces do not show the same combobox signature.
  - `non-text-widgets-no-dropdown`: `downshift 0`, `MinorGC 1`, `MajorGC 1`
  - `switch-widgets`: `downshift 0`, `MinorGC 1`, `MajorGC 1`
- There are still smaller secondary signals in the non-dropdown path, including section measurement / scrollability work, but they are not in the same cost band as the dropdown trace.

### Activation conclusion

- The activation problem is now much more concrete:
  - the dominant remaining activation hotspot is the dropdown / `IdNameCombobox` / `downshift` path
  - switches and the rest of the non-text widgets still cost something, but they are secondary
  - code widgets remain a small tail on activation compared with their larger steady-state pan/zoom cost
- If the next goal is reducing section activation lag, the best target is:
  - the combobox mount / passive-effect path first
  - then the remaining non-dropdown widget layer if needed

## Addendum: `ParamInput` selector churn was forcing broad dropdown rerenders on activation

- Date: `2026-03-07`
- Goal: test whether the dropdown activation cliff was really a combobox-only problem, or whether broad `ParamInput` rerenders were forcing the combobox layer to do heavy work on every `activeIds` update.
- Production change:
  - in `frontend/src/components/Params/ParamItems/ParamInput.tsx`, replace the single `useProjectState` selector that returned `{ baseValue, codeObjType }` with two primitive selectors
  - the old selector returned a fresh object on every store update, so unrelated project-state changes like section activation invalidated every `ParamInput`
  - that broad rerender then fanned into the `DropdownInput` / `IdNameCombobox` / `downshift` passive-effect path

### Visual validation

- `dropdown-widgets` after the fix:
  - `perf/artifacts/frontend/settings-all-settings/dropdown-fix-2026-03-07/dropdown-widgets-after-fix-visible.png`
- `full` after the fix:
  - `perf/artifacts/frontend/settings-all-settings/dropdown-fix-2026-03-07/full-after-fix-visible.png`

### Activation rerun after the selector fix

- Method:
  - same alternating click loop as the previous activation addenda
  - same `click -> active outline class flips` timing
  - `6` runs per stage
  - compare these results directly against the earlier activation split addendum above

- `param-container-shell`
  - average `79.93ms`
  - min `27.20ms`
  - max `145.10ms`
  - runs `77.90`, `99.00`, `145.10`, `87.30`, `43.10`, `27.20`
- `dropdown-widgets`
  - average `80.65ms`
  - min `30.90ms`
  - max `104.50ms`
  - runs `101.40`, `104.50`, `97.10`, `95.60`, `54.40`, `30.90`
- `non-text-widgets`
  - average `77.03ms`
  - min `33.30ms`
  - max `93.20ms`
  - runs `91.50`, `93.20`, `89.90`, `90.30`, `64.00`, `33.30`
  - live counts: `76` combobox inputs, `119` switches
- `code-widgets`
  - average `78.98ms`
  - min `30.30ms`
  - max `139.90ms`
  - runs `81.40`, `91.40`, `139.90`, `85.80`, `45.10`, `30.30`
- `full`
  - average `82.08ms`
  - min `33.50ms`
  - max `104.10ms`
  - runs `101.00`, `104.10`, `98.00`, `101.60`, `54.30`, `33.50`
  - live counts: `76` combobox inputs, `119` switches

### Before / after summary

- `dropdown-widgets`: `175.70ms` -> `80.65ms`
  - delta: `-95.05ms`
- `non-text-widgets`: `228.05ms` -> `77.03ms`
  - delta: `-151.02ms`
- `full`: `254.27ms` -> `82.08ms`
  - delta: `-172.19ms`
- After the fix, dropdown activation is no longer materially worse than the stripped shell baseline.
  - `param-container-shell`: `79.93ms`
  - `dropdown-widgets`: `80.65ms`
  - `full`: `82.08ms`

### Trace comparison

- Representative post-fix full activation trace:
  - `perf/artifacts/frontend/settings-all-settings/dropdown-fix-2026-03-07/full-activation-trace-after-fix.json`

- The old dropdown-specific trace signature is gone from the post-fix full-stage trace.
  - previous dropdown-only trace: `downshift 1569`, `MinorGC 16`, `MajorGC 2`
  - post-fix full trace: `downshift 0`, `MinorGC 9`, `MajorGC 1`
- That lines up with the selector diagnosis:
  - the expensive part was not just "dropdowns exist"
  - the expensive part was that section activation invalidated nearly every `ParamInput`, which then forced the dropdown subtree through extra passive-effect work

### Corrected activation conclusion

- The dropdown slowdown is now much more concrete:
  - `DropdownInput` / `IdNameCombobox` were slow mainly because section activation was needlessly rerendering their parent `ParamInput` wrappers
  - the fresh-object `useProjectState` selector in `ParamInput` was the trigger
- Splitting that subscription into primitive selectors collapses the activation cliff across the whole benchmark.
- There may still be smaller activation costs left in the live widget layer, but the previous dropdown bottleneck is no longer the dominant issue.

## Addendum: post-dropdown activation follow-up shows the next hotspots are selector equality churn and UI editor section config

- Date: `2026-03-07`
- Goal: figure out what remains in activation latency after the dropdown `ParamInput` fix.
- Method:
  - same alternating `shortcuts` / `gui` click loop
  - measured `click -> active outline class flips`
  - same-session comparisons only

### Visual validation

- `full` after selector tightening:
  - `perf/artifacts/frontend/settings-all-settings/activation-next-hotspot-2026-03-07/full-visible-after-selector-tightening.png`
- `full-ui-editor-shell`:
  - `perf/artifacts/frontend/settings-all-settings/activation-next-hotspot-2026-03-07/full-ui-editor-shell-visible.png`

### Targeted controls before the production change

- `full`
  - average `67.18ms`
  - runs `100.80`, `101.50`, `176.10`, `49.60`, `27.10`, `29.70`, `27.30`, `25.30`
- `full-ui-editor-shell`
  - average `56.29ms`
  - runs `80.90`, `95.30`, `79.10`, `77.20`, `52.40`, `21.70`, `21.70`, `22.00`
- `full-no-zindex`
  - average `91.90ms`
  - runs `340.10`, `111.70`, `123.00`, `53.00`, `28.40`, `26.40`, `27.10`, `25.50`

### What those controls isolated

- Replacing the UI editor content with a shell does help, but only as a secondary win.
  - `full`: `67.18ms`
  - `full-ui-editor-shell`: `56.29ms`
  - delta: `-10.89ms`
- Skipping the z-index reorder path did not help.
  - `full-no-zindex` was noisier and worse than the baseline in this pass
  - so `setZIndices` is not the next high-value target

### Trace read before the production change

- Representative trace:
  - `perf/artifacts/frontend/settings-all-settings/activation-next-hotspot-2026-03-07/full-activation-trace-next-hotspot.json`
- The remaining hot names were not dominated by widgets anymore.
- The strongest concrete signals were:
  - `UiEditor`
  - `SectionConfig/EdgePortsSettings`
  - `KwargsControls/ParamFilter`
  - repeated `zustand` `memoizedSelector` + `lodash isEqual` frames
- So the next fix target was not another widget implementation. It was selector/equality churn in shared activation subscribers.

### Production selector tightening

- `frontend/src/components/Panes/UiEditor/UiEditor.tsx`
  - subscribe to the primitive active section id instead of the whole `activeIds` array
- `frontend/src/state/hooks/uiTypes.ts`
  - stop returning `{ selectedTabName, requiredTabs, sectionType }` from a `useProjectState(..., _.isEqual)` selector
  - derive the tab info outside the store selector, so `requiredTabs` no longer creates a fresh `Set` inside the selector on every store update
- `frontend/src/components/Section/Container/SectionContainer.tsx`
  - replace `_.isEqual` with `shallow` for a selector that only returns primitives / booleans
- `frontend/src/components/Section/Container/ContainerCore.tsx`
  - replace `_.isEqual` with `shallow` for the group container selector
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - replace the primitive style/callable selector `_.isEqual` with `shallow`
  - split `ParamFilter` into primitive subscriptions for `paramFilterValue` and `sectionIsActive`

### Same-session rerun after selector tightening

- `full`
  - average `63.58ms`
  - runs `86.60`, `97.90`, `169.70`, `48.20`, `26.50`, `29.40`, `25.90`, `24.40`
- `full-ui-editor-shell`
  - average `54.99ms`
  - runs `72.00`, `88.40`, `82.60`, `79.70`, `51.60`, `21.40`, `23.00`, `21.20`

### Before / after summary

- `full`: `67.18ms` -> `63.58ms`
  - delta: `-3.60ms`
- `full-ui-editor-shell`: `56.29ms` -> `54.99ms`
  - delta: `-1.30ms`
- Remaining `full -> full-ui-editor-shell` gap after the fix:
  - `63.58ms` -> `54.99ms`
  - delta: `-8.59ms`

### Corrected activation conclusion

- The next hotspot is now concrete enough that another broad pass is unnecessary.
- The remaining activation latency is split between:
  - UI editor content for the selected section, especially `SectionConfig/EdgePortsSettings`
  - canvas-side section chrome / filter subscribers such as `KwargsControls/ParamFilter`
- The z-index reorder path is not the next meaningful win.
- The low-risk selector tightening pass was worth landing, but it only recovered a small part of the remaining latency.
- So the next high-value direction is:
  - either defer / lighten UI editor section-config work on active-section change
  - or continue tightening section-level active-state subscribers if we want a fully behavior-preserving path first

## Addendum: lazy Section Config mounting and row-shell selector cleanups were visually correct, but did not produce a decisive outline-latency win

- Date: `2026-03-07`
- Goal: continue reducing the plain `All Settings` section-activation lag after the dropdown fix by targeting:
  - UI editor mount work in `SectionConfig`
  - row-shell selector churn in `KwargsControls`, `GetParamSwitch`, `ParamSwitch`, and `ParamContainer`
- Method:
  - same alternating `shortcuts` / `gui` click loop
  - measured `click -> active outline class flips`
  - same-session comparisons only

### Visual validation

- Full stage after the UI editor lazy-mount change:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-editor-2026-03-07/full-after-ui-editor-lazy-load-visible.png`
- `full-ui-editor-shell` after the same change:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-editor-2026-03-07/full-ui-editor-shell-after-ui-editor-lazy-load-visible.png`
- Browser DOM check on the corrected `full` stage:
  - the closed `APPEARANCE` accordion no longer mounted its `Style` / `Color Tag` subtree
  - `#UiEditorPane` DOM count was about `254` in `full`
  - `#UiEditorPane` DOM count was about `9` in `full-ui-editor-shell`

### Production changes tested in this pass

- `PaneAccordion` / `SectionConfigAccordion`
  - lazy-on-first-open mounting for section-config accordion content
- `EdgePortsSettings`
  - split the large `useProjectState(..., _.isEqual)` selector into narrower subscriptions
  - moved param-label derivation out of the store selector
- `KwargsControls`
  - subscribed to the effective params impl directly instead of returning a fresh object
  - moved deletable-selected-param derivation out of the store selector
  - changed `ParamFilter` to use the effective params impl + a primitive sole-active-section selector
- `ParamSwitch`, `ParamContainer`, `GetParamSwitch`
  - switched row-shell selectors to stable impl/core subscriptions plus memoized derivation

### UI editor comparison after the lazy-mount change

- `full`
  - average `63.32ms`
  - median `85.80ms`
  - runs `104.80`, `85.80`, `45.70`, `26.20`, `27.70`, `91.70`, `98.00`, `89.00`, `46.60`, `22.50`, `23.50`, `92.60`, `98.90`, `91.30`, `45.90`, `22.90`
- `full-ui-editor-shell`
  - average `63.37ms`
  - median `73.70ms`
  - runs `87.00`, `79.50`, `78.40`, `43.60`, `21.70`, `74.60`, `73.70`, `77.20`, `73.90`, `47.20`, `70.80`, `72.30`, `73.10`, `73.80`, `45.70`, `21.50`

### Row-shell comparison after the selector cleanups

- `full`
  - average `63.83ms`
  - median `95.20ms`
  - runs `99.80`, `99.10`, `28.00`, `26.40`, `29.70`, `99.90`, `106.30`, `96.20`, `39.20`, `27.20`, `27.70`, `96.30`, `100.90`, `95.20`, `26.30`, `23.10`
- `param-container-shell`
  - average `63.54ms`
  - median `93.50ms`
  - runs `103.20`, `98.40`, `28.60`, `25.10`, `27.20`, `94.90`, `103.20`, `93.50`, `33.80`, `25.40`, `25.90`, `98.20`, `103.10`, `94.50`, `38.40`, `23.30`

### Conclusion

- These changes were visually correct and they did reduce real mounted UI work in the side pane.
- But in the current outline-based activation metric, they did not produce a decisive win.
- The `full` and `param-container-shell` timings are still effectively in the same band, which means the common section shell / row-shell path still dominates.
- So this pass should be treated as an inconclusive experiment, not a confirmed activation optimization.
- The next likely high-value direction is still the shared section / row activation path, not the UI editor side pane.

## Addendum: shell/body active-state split modestly improved activation, but the shared shell path still dominates

- Date: `2026-03-07`
- Goal: reduce plain `All Settings` section-activation lag by stopping `activeIds` changes from flowing through the heaviest section body path.
- Method:
  - same alternating `shortcuts` / `gui` click loop
  - measured `click -> section data-section-active flips to true` on the live page
  - same-session comparisons against the previous activation-shell baseline
- Important caveat:
  - this branch-head rerun was taken on top of the still-dirty selector-cleanup experiment from the previous addendum
  - that earlier experiment had already measured as inconclusive on its own, so the new delta is still useful, but this is not a perfectly isolated single-change A/B

### Production changes tested in this pass

- `SectionContainerCore`
  - moved the active z-layer to the outer section shell
  - added a section-level active marker for instrumentation
- `SectionContainerCoreResizable`
  - removed `isActiveSection` from the heavy resizable/body path
  - wrapped the resizable body component in `React.memo`
- `CustomResizable`
  - stopped deriving inner resizable z-index from active state
- `SectionHeader`
  - removed the active-state prop from the full header
  - made only the title path subscribe to active state
- `SettingsAllSettingsBenchmarkSnapdomSectionBody`
  - stopped tracking active state in normal benchmark stages
  - only subscribes to active state in the hidden/snapdom stages that actually need it

### Visual validation

- `full` after the shell split:
  - `perf/artifacts/frontend/settings-all-settings/activation-shell-split-2026-03-07/full-visible-after-shell-split.png`
- `param-container-shell` after the shell split:
  - `perf/artifacts/frontend/settings-all-settings/activation-shell-split-2026-03-07/param-container-shell-visible-after-shell-split.png`

### Activation rerun

- Previous activation-shell baseline from the prior addendum:
  - `full`
    - average `63.83ms`
    - median `95.20ms`
  - `param-container-shell`
    - average `63.54ms`
    - median `93.50ms`

- Current branch-head rerun after the shell split:
  - `full`
    - average `59.79ms`
    - median `81.30ms`
    - runs `101.80`, `90.70`, `87.00`, `44.10`, `25.30`, `24.70`, `24.60`, `82.90`, `87.60`, `81.30`, `62.10`, `24.80`, `26.00`, `21.80`, `86.50`, `85.50`
  - `param-container-shell`
    - average `59.24ms`
    - median `77.60ms`
    - runs `113.90`, `80.60`, `91.00`, `42.30`, `23.50`, `22.50`, `24.10`, `82.80`, `88.20`, `77.60`, `65.90`, `21.10`, `23.70`, `22.00`, `90.80`, `77.90`

### Trace artifact

- `full` activation after the shell split:
  - `perf/artifacts/frontend/settings-all-settings/activation-shell-split-2026-03-07/full-activation-trace-after-shell-split.json`

### Conclusion

- This shell/body split produced a modest but real improvement:
  - `full`: about `-4.04ms` average and `-13.90ms` median
  - `param-container-shell`: about `-4.30ms` average and `-15.90ms` median
- The larger median gain suggests the refactor helped the heavier activation samples more than the lighter ones.
- But `full` and `param-container-shell` are still effectively in the same band after the change.
- So the conclusion is:
  - moving active chrome out of the heavy body path does help
  - but it does not uncover a new large widget-specific cliff
  - the remaining activation lag is still centered on the shared section / row shell path

## Addendum: activation render counters show the remaining React work is now concentrated in the section shell, and the visible lag is amplified by the shell outline transition

- Date: `2026-03-07`
- Goal: identify which shared-shell components still commit on plain section activation after the earlier activation optimizations.
- Method:
  - added benchmark-only commit counters to:
    - `SectionContainerCore`
    - `SectionContainerCoreResizable`
    - `SectionHeader`
    - `KwargsControls`
    - `GetParamSwitch`
    - `ParamSwitch`
    - `ParamContainer`
  - exposed those counters on `window.__settaSettingsBenchmarkRenderCounters`
  - for each run:
    - reset counters
    - click one inactive section in the live headed `All Settings` canvas
    - wait for `data-section-active="true"`
    - wait two `requestAnimationFrame` ticks
    - record per-scope commit counts and unique entity counts

### Visual validation

- `full` benchmark stage:
  - `perf/artifacts/frontend/settings-all-settings/activation-render-counters-2026-03-07/full-stage-visible.png`
- `full` after one activation:
  - `perf/artifacts/frontend/settings-all-settings/activation-render-counters-2026-03-07/full-stage-after-activation-visible.png`
- `param-container-shell` benchmark stage:
  - `perf/artifacts/frontend/settings-all-settings/activation-render-counters-2026-03-07/param-container-shell-visible.png`

### Activation render-counter results

- `full`
  - average `119.02ms` from click to active-attribute + settle check
  - runs `167.30`, `131.70`, `123.60`, `100.00`, `72.50`
  - stable counter snapshot on every run:
    - `section-shell`: `2` commits across `2` section entities
    - `section-core-resizable`: `0`
    - `section-header`: `0`
    - `kwargs-controls`: `0`
    - `get-param-switch`: `0`
    - `param-switch`: `0`
    - `param-container`: `0`

- `param-container-shell`
  - average `101.46ms`
  - runs `141.20`, `109.30`, `107.30`, `99.70`, `49.80`
  - stable counter snapshot on every run:
    - `section-shell`: `2` commits across `2` section entities
    - `section-core-resizable`: `0`
    - `section-header`: `0`
    - `kwargs-controls`: `0`
    - `get-param-switch`: `0`
    - `param-switch`: `0`
    - `param-container`: `0`

### What the counters mean

- After the earlier activation work, plain section activation is no longer causing a heavy section-body rerender.
- The measured React commit work is now limited to the old active section shell and the new active section shell.
- So the remaining activation cost is no longer explained by:
  - `KwargsControls`
  - param-row recursion
  - `ParamContainer`
  - `ParamSwitch`
  - the header subtree
- The next true React-side hotspot is now the outer section shell itself, especially the active-state path in `SectionContainerCore`.

### Visual-lag A/B: active state vs outline transition

- On a live active section shell, `getComputedStyle(...)` reported:
  - `transition-property: border-radius, box-shadow, drop-shadow, outline`
  - `transition-duration: 0.17s`

- With the normal production transition still enabled, repeated `full`-stage clicks measured:
  - average `78.82ms` from click to `data-section-active="true"`
  - average `86.32ms` more for the outline color to finish settling
  - average total perceived settle time `180.96ms`

- Browser-only control experiment: injected
  - `section[data-section-id] { transition-property: none !important; transition-duration: 0s !important; }`

- With only that temporary transition override, repeated `full`-stage clicks measured:
  - average `80.32ms` from click to `data-section-active="true"`
  - average `0.64ms` more for the outline to settle
  - average total `94.52ms`

### Conclusion

- The remaining activation story now has two distinct parts:
  - real active-state update cost: roughly `80ms`
  - additional visible shell-animation cost: roughly `86ms`
- So the user-visible “section becomes active slowly” symptom is now explained substantially by the section-shell outline transition, not just React/rendering work.
- The next likely high-value fixes are:
  - reduce or remove the active outline transition on section shells
  - then, if more improvement is still needed, optimize the now-isolated `SectionContainerCore` active-state path itself

## Addendum: section activation is not blocked on backend `setActiveIds` acknowledgement

- Date: `2026-03-08`
- Goal: test whether the remaining plain section-activation lag is caused by the backend `setActiveIds` response path rather than the optimistic local update.
- Method:
  - stayed on the live headed `full` benchmark stage
  - installed a browser-only `fetch` harness for `/setActiveIds`
  - compared three modes over repeated section clicks:
    - `normal`: real backend request/response
    - `stub200`: intercepted and returned an immediate local `200`
    - `hang`: intercepted and never resolved, so no backend acknowledgement could arrive at all
  - measured:
    - click to `data-section-active="true"`
    - click to visual settle on the section shell
    - `/setActiveIds` resolution timing when present

### Results

- `normal`
  - average click to active: `83.04ms`
  - average click to visual settle: `270.34ms`
  - average `/setActiveIds` response time: `103.52ms`

- `stub200`
  - average click to active: `86.86ms`
  - average click to visual settle: `276.38ms`
  - average synthetic `/setActiveIds` response time: `8.64ms`

- `hang`
  - average click to active: `90.96ms`
  - average click to visual settle: `281.80ms`
  - `/setActiveIds` never resolved

### Interpretation

- The initial activation behavior stays in the same band even when the backend acknowledgement never arrives.
- That means the remaining lag is not gated on receiving new project state from the backend for this interaction.
- This matches the code path:
  - `applyActiveSectionChange(...)` calls `setActiveSectionIds(...)`
  - `setActiveSectionIds(...)` uses `dispatchOptimisticProjectStateUpdate(...)`
  - `dispatchOptimisticProjectStateUpdate(...)` writes local Zustand state first with `useProjectState.setState(apply)` and only then sends `route_set_active_ids(...)`
  - the `200` path only acknowledges the pending op; it does not write project state again

### Conclusion

- For plain section activation, the remaining lag is local frontend work plus the shell transition, not backend acknowledgement latency.
- This does not rule out unrelated later backend sync noise elsewhere in the app, but it does rule it out as the cause of the activation delay measured here.

## Addendum: runtime suppression of websocket/project-sync traffic still does not change activation lag

- Date: `2026-03-08`
- Goal: test whether broader backend-driven sync traffic during the activation window, beyond the `/setActiveIds` request itself, is contributing to the remaining lag.
- Method:
  - started from a normally loaded live `full` benchmark page
  - measured 5 baseline section activations
  - then installed a browser-only runtime suppression layer that:
    - swallowed incoming `message` events from project frontend websockets
    - blocked fetches to `/getLatestProjectState` and `/getLatestLspDiagnostics`
  - re-ran the same 5-section activation loop
  - also left the suppression layer active for an extra `5s` idle window to see whether any project-sync traffic actually appeared

### Visual validation

- baseline `full` page:
  - `perf/artifacts/frontend/settings-all-settings/backend-sync-suppression-2026-03-08/full-baseline-visible.png`
- runtime-suppressed `full` page:
  - `perf/artifacts/frontend/settings-all-settings/backend-sync-suppression-2026-03-08/full-runtime-suppressed-visible.png`

### Results

- baseline `full`
  - average click to active: `96.44ms`
  - average click to visual settle: `284.66ms`

- runtime-suppressed `full`
  - average click to active: `107.80ms`
  - average click to visual settle: `301.22ms`

### What the suppression layer actually saw

- during the 5 activation runs:
  - swallowed websocket messages: `0`
  - blocked `/getLatestProjectState` fetches: `0`
  - blocked `/getLatestLspDiagnostics` fetches: `0`

- during an additional `5s` idle sample:
  - new swallowed websocket messages: `0`
  - new blocked project-sync fetches: `0`

### Conclusion

- There was no websocket/project-sync traffic to suppress during the measured activation window on this page.
- So, in this benchmark, broader backend-driven project sync is not explaining the remaining activation lag either.
- The remaining delay is still best explained by local frontend work plus the visible section-shell transition.

## Addendum: with backend sync suppressed, the visual settle is specifically the shell outline transition

- Date: `2026-03-08`
- Goal: isolate which visual shell property is actually responsible for the post-activation settle time while keeping the runtime backend-sync suppression layer active.
- Method:
  - kept the browser-side websocket/project-sync suppression layer installed
  - measured the same `full`-stage section activation loop under 6 transition variants:
    - `baseline`
    - `none`
    - `outlineOnly`
    - `boxShadowOnly`
    - `borderRadiusOnly`
    - `outlineAndBoxShadow`
  - on every animation frame after click, sampled computed:
    - `outlineColor`
    - `boxShadow`
    - `borderRadius`
    - `filter`
  - recorded:
    - click to `data-section-active="true"`
    - click to overall visual settle
    - per-property settle time
    - per-property change counts

### Results

- `baseline`
  - average click to active: `96.30ms`
  - average overall visual settle: `285.67ms`
  - average extra time after active: `189.37ms`
  - average `outlineColor` changes after active: `16.5`

- `outlineOnly`
  - average click to active: `92.72ms`
  - average overall visual settle: `281.75ms`
  - average extra time after active: `189.03ms`
  - average `outlineColor` changes after active: `16.5`

- `outlineAndBoxShadow`
  - average click to active: `91.83ms`
  - average overall visual settle: `287.45ms`
  - average extra time after active: `195.63ms`
  - average `outlineColor` changes after active: `17.25`

- `none`
  - average click to active: `96.73ms`
  - average overall visual settle: `151.57ms`
  - average extra time after active: `54.85ms`
  - average `outlineColor` changes after active: `0`

- `boxShadowOnly`
  - average click to active: `96.72ms`
  - average overall visual settle: `149.00ms`
  - average extra time after active: `52.28ms`
  - average `outlineColor` changes after active: `0`

- `borderRadiusOnly`
  - average click to active: `95.75ms`
  - average overall visual settle: `149.10ms`
  - average extra time after active: `53.35ms`
  - average `outlineColor` changes after active: `0`

### Property-level observation

- On the actual section shell element used for activation:
  - `outlineColor` changed repeatedly after active state flipped
  - `boxShadow` change count stayed `0`
  - `borderRadius` change count stayed `0`
  - `filter` change count stayed `0`

### Conclusion

- The visual settle is not a generic “some animation” effect. It is specifically the shell outline transition.
- `outlineOnly` reproduces the full baseline settle almost exactly.
- `boxShadowOnly` and `borderRadiusOnly` behave like `none`, which means those properties are not driving the visible post-click delay on this page.
- The remaining ~`50-55ms` after active in the non-outline variants is mostly the measurement guard waiting for several stable `requestAnimationFrame` samples, not a visible shell animation.

## Addendum: removing the production outline transition drops section activation settle time to the no-outline band

- Date: `2026-03-08`
- Goal: land the production CSS change and rerun the same activation latency measurement.
- Change:
  - removed `outline` from `.transition-radius` in `frontend/index.css`
  - resulting live shell `transitionProperty`: `border-radius, box-shadow, drop-shadow`
- Method:
  - kept the same browser-side backend-sync suppression control active
  - reran 5 section activations on the live `full` stage

### Visual validation

- post-change `full` page:
  - `perf/artifacts/frontend/settings-all-settings/backend-sync-suppression-2026-03-08/full-outline-transition-removed-visible.png`

### Results

- previous suppressed baseline with production outline transition:
  - average click to active: `96.30ms`
  - average overall visual settle: `285.67ms`
  - average extra time after active: `189.37ms`

- current suppressed rerun after removing the production outline transition:
  - average click to active: `94.76ms`
  - average overall visual settle: `150.68ms`
  - average extra time after active: `55.92ms`

### Conclusion

- Removing the production outline transition does exactly what the earlier isolation predicted.
- The real active-state latency is basically unchanged.
- The visible settle drops by about `134.99ms` (`285.67ms -> 150.68ms`).
- The remaining post-active gap is now in the same `~50-56ms` band as the earlier no-outline controls, which is consistent with the measurement guard rather than a visible shell animation.

## Addendum: localizing ParamFilter active-state subscription removes the last cross-section activation rerender fan-out

- Date: `2026-03-08`
- Goal: push `click to active` and `click to visual settle` lower after the outline-transition removal by finding the next remaining full-stage activation fan-out.
- Method:
  - added benchmark-only render counters for:
    - `section-title-active` (`MaybeCardTitle`)
    - `param-filter` (`KwargsControls` -> `ParamFilter`)
  - ran a clean `full`-stage activation and read the benchmark counter snapshot
  - changed `ParamFilter` from the global selector:
    - `x.projectConfig.activeIds.length === 1 ? x.projectConfig.activeIds[0] : null`
    - to the local boolean selector:
    - `x.projectConfig.activeIds.length === 1 && x.projectConfig.activeIds[0] === sectionId`
  - reran the counter snapshot
  - reran the warmed activation ladder on:
    - `frame-only`
    - `param-container-shell`
    - `full`

### Counter snapshots

- Before the `ParamFilter` selector change, one clean `full` activation produced:
  - `section-shell`: `2` commits
  - `section-title-active`: `2` commits
  - `param-filter`: `42` commits
  - `kwargs-controls`, `get-param-switch`, `param-switch`, `param-container`: `0`

- After the `ParamFilter` selector change, the same clean `full` activation produced:
  - `section-shell`: `2` commits
  - `section-title-active`: `2` commits
  - `param-filter`: `2` commits
  - `kwargs-controls`, `get-param-switch`, `param-switch`, `param-container`: `0`

### Warmed activation ladder after the fix

- `frame-only`
  - average click to active: `55.22ms`
  - average click to visual settle: `77.73ms`
  - average extra time after active: `22.52ms`

- `param-container-shell`
  - average click to active: `83.03ms`
  - average click to visual settle: `107.58ms`
  - average extra time after active: `24.55ms`

- `full`
  - average click to active: `84.07ms`
  - average click to visual settle: `106.50ms`
  - average extra time after active: `22.43ms`

### Conclusion

- The last concrete cross-section activation fan-out was `ParamFilter`, not the heavy param row tree.
- Fixing that selector removed `40` unnecessary rerenders per activation (`42 -> 2`).
- After the fix, `full` and `param-container-shell` are effectively in the same activation band again, which means the remaining gap is no longer in live widget content.
- The remaining warmed gap versus `frame-only` is now about:
  - `28.85ms` for click to active
  - `28.77ms` for click to visual settle
- So the next remaining floor is the shared section-shell / store-update path, not another obvious full-stage widget fan-out.

## Addendum: `setZIndices` becomes a small but real activation bucket once the larger fan-out issues are gone

- Date: `2026-03-08`
- Goal: revisit `setZIndices` after the later activation optimizations, because the earlier `full-no-zindex` addendum was taken before the dropdown, shell, outline, and `ParamFilter` fixes moved the activation floor down.
- Change:
  - kept the existing full normalization path for drag/version updates
  - added a fast path in `frontend/src/state/actions/sections/sectionPositions.ts` for ordinary activation clicks:
    - compute the current max z-index
    - clone only the targeted node entries into a new `Map(nodeInternals)`
    - raise just the activated sections above the current max
    - only fall back to full normalization when z-indices grow too far apart

### Method

- Reran the live headed browser on the default `full` benchmark stage with normal overlays restored:
  - agentic edges: on
  - arg edges: on
  - minimap: on
- Used the benchmark-only `full-no-zindex` stage as the matched browser-side control.
- Measured warmed section activation with the same browser harness used in the recent activation addenda:
  - click to `data-section-active="true"`
  - click to visual settle using stable computed-style sampling on the activated section shell

### Visual validation

- default `full` with overlays restored:
  - `perf/artifacts/frontend/settings-all-settings/activation-zindex-fast-path-2026-03-08/full-default-overlays-restored.png`
  - `perf/artifacts/frontend/settings-all-settings/activation-zindex-fast-path-2026-03-08/full-default-overlays-restored-rerun.png`
- matched `full-no-zindex` control:
  - `perf/artifacts/frontend/settings-all-settings/activation-zindex-fast-path-2026-03-08/full-no-zindex-default-overlays.png`

### Results

- `full` first same-session run:
  - average click to active: `50.53ms`
  - average click to visual settle: `71.29ms`
  - average extra time after active: `20.76ms`

- `full-no-zindex` matched control:
  - average click to active: `48.56ms`
  - average click to visual settle: `67.67ms`
  - average extra time after active: `19.11ms`

- `full` rerun after the control:
  - average click to active: `52.61ms`
  - average click to visual settle: `71.23ms`
  - average extra time after active: `18.61ms`

### Conclusion

- `setZIndices` is no longer a large activation bucket, but it is also not pure noise anymore once the bigger rerender and animation costs are removed.
- With the new fast path in place, the remaining gap to the `full-no-zindex` control is only about:
  - `~2.0ms` to `~4.1ms` for click to active
  - `~3.6ms` for click to visual settle
- So this change is worth keeping, but it does not explain the whole remaining `frame-only -> full` gap by itself.
- The next remaining work is not overlay chrome or bulk z-index normalization. It is the shared activation floor in the section/store path.

## Addendum: a split active-section UI store removes another meaningful chunk of activation latency in a benchmarked prototype

- Date: `2026-03-08`
- Goal: test whether the remaining activation floor is the giant project-store write itself by splitting UI-facing active section state off the durable `projectConfig.activeIds` path.
- Prototype:
  - added a small `useActiveSectionUI` store and mirrored it from `projectConfig.activeIds`
  - switched the UI-facing active-shell consumers to the new store:
    - section shells
    - joined group shells
    - active title styling
    - `UiEditor`
    - `ParamFilter`
    - benchmark SnapDOM/hidden-body wrappers
  - added a benchmark-only `full-ui-active-store` stage
  - in that stage only, `setActiveSectionIds(...)`:
    - updates `useActiveSectionUI` immediately
    - defers the durable `useProjectState.setState(...)` / optimistic backend path to the next animation frame

### Method

- Kept the normal overlays on:
  - agentic edges: on
  - arg edges: on
  - minimap: on
- Used the same browser-side activation harness as the recent addenda:
  - click to `data-section-active="true"`
  - click to visual settle using stable computed-style sampling on the activated shell
- Measured the same-session sequence:
  - `full`
  - `full-ui-active-store`
  - `full` rerun

### Visual validation

- `full` baseline:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-active-store-2026-03-08/full-baseline-visible.png`
- `full-ui-active-store`:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-active-store-2026-03-08/full-ui-active-store-visible.png`
- `full` rerun:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-active-store-2026-03-08/full-rerun-visible.png`

### Results

- `full` first same-session run:
  - average click to active: `55.91ms`
  - average click to visual settle: `77.87ms`
  - average extra time after active: `21.96ms`

- `full-ui-active-store` prototype stage:
  - average click to active: `43.99ms`
  - average click to visual settle: `57.16ms`
  - average extra time after active: `13.17ms`

- `full` rerun after the prototype stage:
  - average click to active: `47.96ms`
  - average click to visual settle: `66.43ms`
  - average extra time after active: `18.47ms`

### Conclusion

- This is the clearest evidence so far that the remaining activation floor is the durable `projectConfig.activeIds` write path, not section-body rerendering.
- Even with same-session warm variance, the benchmark-only split-store stage improved activation by roughly:
  - `~4ms` to `~12ms` for click to active
  - `~9ms` to `~21ms` for click to visual settle
- The important architectural conclusion is stronger than the exact number:
  - activation gets materially faster when the shell and pane stop waiting on the giant project store
  - the durable project-state / optimistic-backend sync can move off the critical paint path
- So the next production step is clear:
  - promote the active-section UI store out of benchmark-only mode
  - keep it as the immediate source for active shell/pane state
  - mirror to `projectConfig.activeIds` asynchronously, with follow-up coverage for any behavior that currently assumes same-tick project-store updates

## Addendum: promoting the split active-section UI store makes normal `full` activation match the benchmark prototype band

- Date: `2026-03-08`
- Goal: promote the benchmark-only `useActiveSectionUI` activation path into normal production behavior, then verify that the real `full` stage lands in the same activation band as the prototype.
- Production change:
  - `setActiveSectionIds(...)` now updates `useActiveSectionUI` immediately and defers the durable `projectConfig.activeIds` sync for real loaded projects, not just the benchmark-only stage.
  - switched immediate active-selection readers that drive UI behavior and interaction targeting to `useActiveSectionUI` / `getActiveSectionUIIds()`, including:
    - pane tab resolution
    - copy/paste and format-code actions
    - keyboard escape / tab helpers
    - section search focus
    - group / ungroup actions
    - node selection, minimap, drag, selection-bounds, and active-edge rendering

### Method

- Kept the normal live headed browser workflow on `http://127.0.0.1:3009/settings`.
- Fixed the viewport at `1440x1200`.
- Used the same browser-side activation harness as the recent addenda:
  - click a visible inactive section
  - measure click to `data-section-active="true"`
  - measure click to visual settle using stable computed-style sampling on the activated shell
- Measured the same-session sequence:
  - `full`
  - `full-ui-active-store`
  - `full` rerun
- Important comparison note:
  - these absolute numbers were collected in a later live session than the prototype addendum above
  - compare within this addendum first; the key question here is whether normal `full` now matches the prototype control in the same session

### Visual validation

- `full` production baseline:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-active-store-production-2026-03-08/full-production-visible.png`
- `full-ui-active-store` control:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-active-store-production-2026-03-08/full-ui-active-store-production-visible.png`
- `full` production rerun:
  - `perf/artifacts/frontend/settings-all-settings/activation-ui-active-store-production-2026-03-08/full-production-rerun-visible.png`

### Results

- `full` first same-session production run:
  - average click to active: `105.30ms`
  - average click to visual settle: `122.22ms`
  - average extra time after active: `16.92ms`

- `full-ui-active-store` control stage:
  - average click to active: `93.30ms`
  - average click to visual settle: `109.28ms`
  - average extra time after active: `15.98ms`

- `full` production rerun:
  - average click to active: `95.70ms`
  - average click to visual settle: `113.18ms`
  - average extra time after active: `17.48ms`

### Conclusion

- The production promotion worked.
- After the split-store path is enabled for normal `full`, the real `full` stage lands in essentially the same band as the old benchmark-only prototype control.
- Within this same session, the remaining `full` rerun gap to `full-ui-active-store` is small:
  - about `2.4ms` on click to active
  - about `3.9ms` on click to visual settle
- That is close enough to treat as normal warm-session variance rather than a meaningful remaining architecture gap.
- So the split is worth keeping:
  - immediate active-shell/UI behavior belongs in the lightweight active-section UI store
  - durable `projectConfig.activeIds` sync can stay on the deferred project-state/backend path

## Addendum: marquee selection hitch was mostly repeated durable active-id sync during drag, and deferring that sync cuts the per-section stalls

- Date: `2026-03-08`
- Goal: reduce the hitch while holding `Shift` and dragging a selection rectangle across sections in `All Settings`.
- Hypothesis:
  - the drag path was not just doing local shell updates
  - it was repeatedly flushing `setActiveIds` through the durable project/backend path while the marquee was still in progress

### Before change

- Live headed-browser synthetic marquee drag on normal `full`:
  - `5` `/api/setActiveIds` requests during one short drag
  - step durations stayed around a frame when the selected count did not change, but spiked hard when it did:
    - `102.30ms` on the initial drag step
    - `92.80ms` when the active count changed from `1 -> 2`
    - `103.90ms` when the active count changed from `2 -> 4`
    - `93.10ms` when the active count changed from `4 -> 6`
- Render counters during that drag showed the body was not the issue:
  - `section-shell`: `6` commits across `6` entities
  - `section-title-active`: `6` commits across `6` entities
  - `kwargs-controls`, `param-switch`, `param-container`: `0`
- The hit-test loop still ran every step:
  - `762` section `getBoundingClientRect()` calls across `18` drag steps

### Change

- Added explicit sync modes to `setActiveSectionIds(...)`:
  - `ui-only`
  - `auto`
  - `immediate`
- Updated marquee selection in `Pane.tsx`:
  - `mousedown` / `mousemove` selection-rect updates now use `syncMode: "ui-only"`
  - `mouseup` / `mouseleave` commit the final UI-selected ids once through the durable sync path
- This preserves live shell selection during drag, but stops the project-state/backend churn until the drag is done.

### Method

- Reran the same live synthetic marquee drag on `http://127.0.0.1:3009/settings?settingsBenchmarkStage=full`.
- Kept the same viewport and same drag path across the visible Settings sections.
- Instrumented:
  - per-step drag duration
  - `/api/setActiveIds` call count
  - benchmark render counters
  - section `getBoundingClientRect()` call counts

### Visual validation

- `full` before rerun:
  - `perf/artifacts/frontend/settings-all-settings/selection-rect-sync-2026-03-08/full-visible-after-selection-sync.png`
- `full` after marquee drag:
  - `perf/artifacts/frontend/settings-all-settings/selection-rect-sync-2026-03-08/full-selection-rect-after-drag-visible.png`
- `full` before click rerun:
  - `perf/artifacts/frontend/settings-all-settings/selection-rect-sync-2026-03-08/full-visible-before-click-rerun.png`

### Results

- After the change, the same marquee drag produced:
  - `1` `/api/setActiveIds` request total
  - no more `~90ms` to `~100ms` per-section cliffs
  - selection-count change steps now landed in the `16ms` to `25ms` band:
    - `24.60ms` when the active count changed from `1 -> 2`
    - `24.20ms` when the active count changed from `2 -> 4`
    - `16.00ms` when the active count changed from `4 -> 6`
    - `25.00ms` when the active count changed from `6 -> 9`
- Render counters after the change:
  - `section-shell`: `15` commits across `9` entities
  - `section-title-active`: `15` commits across `9` entities
  - `kwargs-controls`, `param-switch`, `param-container`: `0`
- The hit-test work itself was basically unchanged:
  - `765` section `getBoundingClientRect()` calls across the same `18` drag steps

### Activation sanity check

- This change targeted marquee selection, not ordinary click activation, but I reran the click harness on `full` afterward as a sanity check:
  - average click to active: `73.02ms`
  - average click to visual settle: `88.50ms`
  - average extra time after active: `15.48ms`

### Conclusion

- The marquee hitch was mostly the repeated durable active-id sync path, not section-body rerenders.
- Deferring the project/backend sync until `mouseup` cut the per-section drag stalls from roughly `93ms` to `104ms` down to roughly `16ms` to `25ms`, while preserving live shell selection during the drag.
- The remaining marquee floor is now clearer:
  - the expensive part left is the hit-test loop itself, especially `getNodesInside(...)` walking all sections and reading geometry on every drag step
- So the next best target for selection-rectangle performance is:
  - replace the DOM-rect hit testing in `getNodesInside(...)` with cached node geometry from the flow store / node internals

## Addendum: marquee hit-testing now uses node internals instead of per-step DOM section rect scans

- Date: `2026-03-08`
- Goal: remove the remaining geometry-read cost during `Shift` + marquee selection after durable active-id sync was already deferred.
- Hypothesis:
  - after the sync fix, the main remaining marquee cost was `getNodesInside(...)`
  - that path still walked all sections and read DOM geometry with `getBoundingClientRect()` on every drag step
  - for top-level canvas marquee selection, live node internals should be a correct geometry source and should avoid those DOM reads

### Change

- Updated `getNodesInside(...)` in `frontend/src/forks/xyflow/core/utils/graph.ts`:
  - it now iterates `useNodeInternals.getState().x.values()`
  - it computes overlap directly from node `position`, `width`, and `height`
  - it preserves the old behavior that nodes with unknown dimensions are still treated as selectable
- Left the existing DOM-backed helpers in `graph.ts` intact for other call sites that still need real DOM bounds.
- Added targeted coverage in `frontend/src/forks/xyflow/core/utils/graph.test.ts` for:
  - overlap resolution from node internals
  - partial-overlap mode
  - unknown-dimension fallback behavior

### Method

- Reloaded the live headed browser on:
  - `http://127.0.0.1:3009/settings?settingsBenchmarkStage=full`
- Reused the same synthetic marquee-drag harness as the previous addendum:
  - same viewport
  - same drag shape across the visible Settings sections
  - same instrumentation for per-step durations, render counters, `/api/setActiveIds`, and `getBoundingClientRect()` call counts
- Recorded an after-change trace during the drag.

### Visual validation

- `full` after the node-internals rerun:
  - `perf/artifacts/frontend/settings-all-settings/selection-rect-node-internals-2026-03-08/full-selection-rect-node-internals-visible.png`

### Results

- The node-internals path removed almost all section DOM geometry reads during the drag:
  - previous committed marquee baseline: `765` section `getBoundingClientRect()` calls across `18` steps
  - new node-internals rerun: `6` section `getBoundingClientRect()` calls total
- Durable active-id sync behavior stayed correct:
  - `/api/setActiveIds` requests: still `1` total for the same drag
- Step durations improved again and mostly stayed in the single-digit to low-teens band:
  - `11.60, 18.70, 7.90, 4.70, 7.80, 7.80, 8.10, 8.10, 17.20, 4.60, 6.20, 7.80, 7.70, 5.30, 6.80, 13.80, 31.20, 3.50 ms`
- Selection progression during the rerun:
  - active counts by step: `0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 6, 6`
- The remaining large sample was now a late drag spike, not repeated per-section rect reads:
  - max step in the main rerun: `31.20ms`

### Trace follow-up

- Trace artifact:
  - `perf/artifacts/frontend/settings-all-settings/selection-rect-node-internals-2026-03-08/full-selection-rect-node-internals-trace.json`
- DevTools no longer pointed at section DOM rect scans as the main marquee cost.
- The main remaining signal in the trace was a forced reflow inside:
  - `frontend/src/forks/xyflow/core/components/NodesSelection.tsx`
- I ran one browser-only control with `HTMLElement.prototype.focus` temporarily suppressed to check whether the selection-overlay autofocus was the whole remaining issue.
- That did not materially change the drag profile:
  - focus-suppressed max step: `30.40ms`
- So the remaining marquee floor is not the old section-rect scan anymore, and it is probably not just the `focus()` call by itself.

### Conclusion

- This change is worth keeping.
- The marquee hit-test loop now uses live node internals instead of repeatedly reading section DOM rects, which cut section `getBoundingClientRect()` calls from `765` down to `6` in the same drag shape.
- The remaining selection hitch is now much smaller and has moved to a different bucket:
  - selection-overlay/layout work in `NodesSelection.tsx`
- So the next marquee-specific target, if we keep pushing this path, should be the selection overlay / forced-reflow work rather than geometry lookup.
