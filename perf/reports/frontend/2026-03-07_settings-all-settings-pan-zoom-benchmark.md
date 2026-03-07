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
