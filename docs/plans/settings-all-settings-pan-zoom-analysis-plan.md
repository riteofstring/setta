# Settings All Settings Pan/Zoom Analysis Plan

## Goal

Build a repeatable benchmark for the Settings project's `All Settings` view that:

1. Starts from a nearly empty section render.
2. Re-enables section content in controlled stages.
3. Measures pan/zoom performance at every stage.
4. Records the results in an append-only perf report.

## Benchmark Target

- Project: `settings`
- View mode: `All Settings`
- Interaction scope: top-level canvas pan + zoom performance
- Primary metrics:
  - approximate FPS during a deterministic pan/zoom sequence
  - average frame time
  - slow frame counts (`> 16.7ms`, `> 33ms`, `> 50ms`)
  - DOM node count for the benchmark view
  - DevTools trace observations for scripting / rendering / paint

## Why This Approach

The `All Settings` view is a good stress case because it contains many complex `Dict` sections with nested param trees. That means we can isolate costs in layers:

- canvas + node shells
- section chrome
- dict/param area chrome
- param row structure
- full param widgets and interactions

## Benchmark Stages

Use a stage flag that only activates on the `settings` project while the active view mode is `All Settings`.

Stage order:

1. `frame-only`
   - Keep the React Flow canvas, top-level nodes, and resizable section frame.
   - Remove headers, handles, section body, and param content.
2. `header-only`
   - Add section header chrome back.
   - Keep section body empty.
3. `section-body-shell`
   - Add the dict body shell back.
   - Keep lightweight body containers for pinned/unpinned param areas.
   - Do not render real param rows/widgets yet.
4. `static-param-list`
   - Add lightweight text-only param rows using the real visible param tree/order.
   - Keep actual param inputs/widgets disabled.
5. `full`
   - Existing production render path.

## Implementation Plan

1. Add a benchmark stage provider/hook for the frontend.
   - Read the stage from the URL query string.
   - Activate only when `projectConfig.name === "settings"` and the active view mode name is `All Settings`.
   - Expose the resolved stage through React context so section components do not each parse the URL.
2. Thread the stage through the Settings render hot path.
   - `UIPage` / React Flow root: expose the active stage as a data attribute for tests/debugging.
   - `SectionContainerCore`: disable extra section chrome for stripped stages.
   - `SectionContainerCoreResizable`: switch between empty shell, header-only shell, and full body rendering.
   - `DictArea` / `ParamGroupContainer`: add shell and static-row benchmark render paths.
3. Add a lightweight static param renderer.
   - Use the real visible param tree/order from the project state.
   - Render cheap text rows with depth indentation.
   - Avoid actual inputs, tooltips, DnD behavior, error chrome, and nested widget subtrees.
4. Add automated coverage.
   - Playwright spec that loads `/settings`, switches to `All Settings`, and verifies:
     - the stage activates from the URL
     - section/node count stays stable across stages
     - stripped stages reduce DOM complexity
     - static rows appear before full widgets are restored
5. Create the perf report and artifacts.
   - Report file under `perf/reports/frontend/`.
   - Trace artifacts stored locally under `perf/artifacts/`.

## Measurement Workflow

For each benchmark stage:

1. Open `/settings` with the stage query parameter.
2. Switch to `All Settings`.
3. Ensure the same viewport and browser window size are used for every run.
4. Take benchmark screenshots before trusting any numbers.
   - Capture at least one screenshot of the benchmark stage before measurement.
   - If the benchmark uses a replacement surface or stripped render path, capture a matched screenshot of the reference stage too.
   - Confirm visually that the benchmark is rendering the intended thing, not an empty/incorrect surrogate.
   - If the screenshot does not match the intended benchmark target, stop and fix the benchmark harness before collecting metrics.
5. Collect:
   - DOM node count from the page
   - deterministic pan/zoom frame metrics from the page runtime
   - a DevTools Performance trace covering the same pan/zoom sequence
6. Append the stage results to the perf report before moving to the next stage.

## Deterministic Pan/Zoom Sequence

Use the same scripted viewport sequence for every stage so comparisons stay valid:

1. initial settle
2. pan right/down in fixed increments
3. pan left/up in fixed increments
4. zoom in fixed increments
5. zoom back out to the starting level

The sequence should run long enough to generate stable frame samples without mixing unrelated app activity.

## Deliverables

- `docs/plans/settings-all-settings-pan-zoom-analysis-plan.md`
- benchmark stage implementation in the frontend
- Playwright coverage for the benchmark harness
- perf report under `perf/reports/frontend/`
- local DevTools trace artifacts under `perf/artifacts/`

## Risks / Watchouts

- Stripped stages can change natural section dimensions. Use a fixed viewport during measurement so results stay comparable.
- The Settings screen may not default to `All Settings`; the benchmark flow must always activate that view mode explicitly.
- Timing assertions in automation may be flaky. Prefer structural automation plus manual DevTools numbers in the report.
- Benchmarks that replace live DOM with previews or synthetic shells can silently measure the wrong thing. Screenshot confirmation is mandatory before treating a result as valid.
