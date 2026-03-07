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
