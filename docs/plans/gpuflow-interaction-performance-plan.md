# GpuFlow Interaction Performance Plan

## Goal

Make dense GpuFlow projects responsive for high-frequency canvas interactions:
pan/zoom, section drag/drop, parameter drag/drop, top-level section resize, and
nested section resize.

The work should be benchmark-driven. Each optimization must start from a
repeatable difficult scene, record a baseline in `perf/`, make a focused
change, then record before/after results.

## Scope

In scope:

- GpuFlow interaction targeting, projection, dirty tracking, frame scheduling,
  texture upload, and renderer-owned layout paths.
- Difficult benchmark scenes with dense section DOM, nested sections, long
  parameter lists, sliders, switches, text inputs, and scroll regions.
- Browser-level profiling through the existing CDP/probe workflow.
- Focused Vitest and E2E guardrails for interaction regressions.

Out of scope for this plan:

- Changing durable section/parameter contracts without a Go-owned design.
- Replacing the full section content renderer. That larger clean-break work is
  tracked in `docs/plans/gpuflow-full-scene-canvas-content-clean-break-plan.md`.
- Adding compatibility shims or dual old/new interaction paths.

## Current Read

The current pan/zoom path is already structurally sound: active viewport-only
movement avoids texture uploads, `requestPaint`, React renders, and broad source
DOM transform rewrites. Recent targeting-cache work reduced repeated dense DOM
target discovery costs, but the next performance risks are interactions that
change section or parameter layout while pointer events are firing.

Likely hot spots:

- Section resize can dirty too much texture area or force layout reads on every
  pointer move.
- Nested section resize can amplify parent/child layout, clip, scroll, and
  source-rect invalidation costs.
- Section drag/drop can touch selection state, z order, edge/port geometry,
  hover/drop lookup, and React state too often.
- Parameter drag/drop can recapture large section surfaces and repeatedly scan
  dense source DOM.

## Example Repo Review

Before changing the interaction architecture, review the local html-in-canvas
examples under:

`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos`

Use this review to separate browser/API constraints from project-specific Setta
architecture decisions. The most relevant patterns to compare against GpuFlow:

- `html-in-canvas-official/README.md`: `layoutsubtree`, direct canvas child
  constraints, `paint` events, `changedElements`, `requestPaint()`, transform
  synchronization, `captureElementImage`, and WebGPU
  `copyElementImageToTexture`.
- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`:
  high-frequency control interaction with explicit WebGPU texture uploads.
- `three-html-render/src/threeHTMLRenderer.ts`: one texture per source element,
  event propagation control for real DOM controls, and scroll-triggered
  repaint requests.
- `three-html-render/src/interactionManager.ts`: aligning real DOM elements to
  rendered surfaces with a single CSS transform so native pointer, focus,
  selection, and keyboard behavior continue to work.
- `three-html-render/src/raycastInteractionManager.ts`: event-driven pointer
  projection that moves only the active DOM island instead of updating every
  source element on every frame.
- `html-in-canvas/plugins/html-cloth.mjs`: practical transformed-surface hit
  testing and comments about avoiding `elementFromPoint` assumptions outside
  the viewport.

Architecture questions to answer from this review:

- Which interactions should be handled by the real DOM source island, and which
  should be handled by GpuFlow's renderer-owned scene state?
- Are source surfaces split finely enough that scrolling a dense section or
  moving one child does not recapture unrelated content?
- Are source DOM transforms synchronized only when hit testing or accessibility
  needs them, rather than during pure viewport pan/zoom?
- Are `requestPaint()` calls limited to true DOM content changes, not used as a
  general animation mechanism?
- Can active interaction use one projected DOM island or one renderer-owned
  preview instead of rewriting transforms for many elements?
- Are benchmark scripts exercising real native interactions, not only direct
  store or API mutations?

## Benchmark Project

Create a deterministic interaction stress project, separate from normal user
projects, with enough structure to exercise all target interactions.

Required scene contents:

- A Settings-like "All Settings" section with many controls.
- Long parameter lists and grouped parameter dictionaries.
- Text inputs, textareas, sliders, switches, comboboxes, and buttons.
- Multiple nested scroll areas inside sections.
- Top-level sections with mixed sizes and edge connections.
- Nested group/list sections with enough children to test child resize and
  reorder.
- Parameter rows with ports so drag/drop also exercises edge/port geometry.

The benchmark project should be reproducible from source-controlled fixture code
or a script. It should not depend on mutable local `setta_files` state.

## Metrics

Collect these metrics for every benchmarked interaction:

- p50, p95, and p99 interaction-to-frame latency.
- p50, p95, and p99 frame time during active pointer movement.
- Long task count and duration.
- `copyElementImageToTexture` count and uploaded bytes.
- `requestPaint` count.
- Source DOM transform writes.
- Dirty source rect count and total dirty area.
- React commit count where available.
- Layout/style/recalculate cost from Chrome trace when deeper profiling is
  needed.
- Final durable mutation count after interaction stop.

Store results as append-only reports under `perf/reports/frontend/`.

## Implementation Plan

### 1. Architecture Review And Probe Inventory

- Map the current GpuFlow interaction path for:
  - pan/zoom
  - scrolling inside sections
  - clicking/focus/typing inside DOM islands
  - sliders and other high-frequency controls
  - top-level section resize
  - nested section resize
  - section drag/drop
  - parameter drag/drop
- Compare the current path against the example-repo patterns above.
- Identify every high-frequency interaction that currently causes:
  - full section texture recapture
  - broad source DOM transform rewrites
  - React state updates per pointermove/wheel/input event
  - DOM measurement per pointermove
  - uncached dense hit/drop-target scans
- Record the findings in the first benchmark report so later optimizations have
  a concrete architectural baseline.

### 2. Benchmark Harness And Baselines

- Add or extend a browser probe that can script:
  - top-level resize drag
  - nested resize drag
  - section drag/drop
  - parameter drag/drop
  - wheel/scroll inside dense sections
  - slider/text input interaction inside dense sections
- Use one deterministic stress project for all scenarios.
- Record baseline reports before changing behavior.
- Define acceptance thresholds per scenario after the first baseline, because
  the current hardware/browser numbers should drive realistic targets.

### 3. Top-Level Section Resize

Start here because it is bounded and avoids nested ownership complexity.

Investigate:

- Whether pointermove resize updates stay in renderer-owned layout state.
- Whether source texture recapture is deferred, throttled, or dirty-rect scoped.
- Whether edge/port updates are computed from existing layout data instead of
  DOM reads.
- Whether React state only receives durable resize commits at interaction stop.

Optimize toward:

- Transform/layout-only visual feedback during active resize.
- One durable section-size commit at the end of the interaction.
- No full-section texture recapture on every pointermove unless live DOM content
  truly needs it.
- Bounded edge/port recomputation.

Verification:

- Focused Vitest for resize state transitions.
- Browser benchmark with before/after report.
- CDP visual check for resize handles and final layout.

### 4. Nested Section Resize

Proceed after top-level resize is measured and improved.

Investigate:

- Parent/child local-to-world coordinate conversion.
- Parent clip rect and scroll offset behavior.
- Whether resizing a child invalidates parent source surfaces.
- Whether nested resize uses a separate DOM/CSS path from top-level resize.

Optimize toward:

- Shared renderer-owned resize path for top-level and nested sections.
- Child-only live layout updates during pointer movement.
- Parent invalidation limited to clip/scroll metadata, not full parent DOM
  recapture.
- Durable child size commit at interaction stop.

Verification:

- Tests for local/world rect updates under parent scroll.
- Browser benchmark with dense nested section scenes.
- CDP visual check for nested resize in scrolled and unscrolled parents.

### 5. Section Drag/Drop

Investigate after resize because drag/drop touches more systems.

Investigate:

- How often drag movement updates React state.
- Whether moving a section dirties or uploads its texture.
- Drop target lookup cost in dense scenes.
- Edge and port geometry recomputation frequency.
- Selection/z-order updates during active drag.

Optimize toward:

- Renderer-owned transient drag transform and z-order during pointer movement.
- Durable move/reorder commit only on drop.
- No texture recapture for pure movement.
- Cached or scene-owned drop target lookup.
- Edge updates from renderer layout records, not source DOM measurement.

Verification:

- Benchmarks for single section drag, multi-selection drag, and drag across
  dense connected sections.
- Tests for drop target resolution and final persisted order/position.
- CDP visual check for section drag/drop.

### 6. Parameter Drag/Drop

Do this after section drag/drop because parameter drag is likely the most
DOM-heavy scenario.

Investigate:

- Whether param row drag is owned by React/dnd-kit inside the source DOM.
- Whether every pointermove recaptures the containing section texture.
- Whether param hover/drop lookup scans dense DOM.
- Whether param port geometry is measured from DOM during active drag.

Optimize toward:

- Renderer-owned drag preview or lightweight active DOM island.
- Dirty rects limited to old/new row locations, not the entire section.
- Drop lookup from structured param layout metadata where possible.
- Durable reorder commit at drop.

If the current DOM-owned param architecture prevents a robust fix, document the
measured limit and connect the remaining work to the full scene/canvas content
clean-break plan.

Verification:

- Benchmarks for long parameter lists, grouped params, and params with ports.
- Tests for reorder correctness and source-rect dirtying.
- CDP visual check for parameter drag/drop.

## Acceptance Criteria

- Every target interaction has a reproducible benchmark scenario.
- Baseline and after reports exist in `perf/reports/frontend/`.
- Active pan/zoom still performs no texture uploads, `requestPaint`, React
  rerenders, or broad source transform rewrites.
- Top-level and nested resize have bounded per-pointermove work and commit
  durable state once per completed interaction.
- Section drag/drop uses renderer-owned transient movement and does not recapture
  textures for pure movement.
- Parameter drag/drop either meets the same bounded-work standard or has a
  documented architectural blocker tied to the full-scene plan.
- UI-relevant changes include CDP visual verification.

## Execution Order

1. Review GpuFlow interaction architecture and the local html-in-canvas example
   repos.
2. Build deterministic interaction stress project and probes.
3. Record baselines for pan/zoom, node interaction, top-level resize, nested
   resize, section drag/drop, and parameter drag/drop.
4. Optimize top-level section resize.
5. Optimize nested section resize.
6. Optimize section drag/drop.
7. Optimize parameter drag/drop.
8. Re-run full interaction benchmark suite and append final report.
