# Workspace Graph Pan/Zoom Surface Runtime Refactor Plan

- **Date:** June 18, 2026
- **Status:** Draft active plan
- **Scope:** Make workspace graph pan/zoom smooth by refactoring graph canvas
  lifetime, workspace pane presentation writes, and frame-loop scheduling around
  explicit surface ownership and measurable interaction budgets.
- **Related Plans:**
  [DOM Pane Surface Lifecycle Plan](dom_pane_surface_lifecycle_plan.md),
  [Workspace Trajectory Liveness and Semantic Memory Plan](workspace_trajectory_liveness_and_semantic_memory_plan.md),
  and [Pixi Workspace Crisp Rendering Plan](pixi_workspace_crisp_rendering_plan.md).

## Position

The pan/zoom problem should not be treated as a wheel-handler problem.

The latest diagnostic recordings show that wheel handling and camera math are
cheap once the event reaches our code. The bad feel comes from the browser main
thread being congested before the wheel event is handled and from graph frame
cadence settling around 25-30ms during interaction.

The strongest evidence is:

- Wheel handler p95 is about `0.2ms`.
- Camera update p95 is about `0.1ms`.
- Event-to-camera-update p95 after handler entry is about `0.1ms`.
- Wheel events reach the handler late: p50 about `31.6ms`, p95 about `52ms`,
  max about `94ms`.
- Graph frame p50 is about `25.9ms`, p95 about `29.9ms`.
- Duplicate active graph renderers are present for the same surface.
- Workspace pane chrome produces repeated DOM mutation bursts, often around
  `210-215` mutation records every roughly 250ms.

Those diagnostics are sufficient to reject local wheel-handler tuning as the
primary solution. They are not sufficient to name the exact task occupying the
main thread during the 30-50ms before handler entry. Phase 0 must therefore add
trace-grade blocker attribution before any architectural fix is treated as
proven.

That means the principled fix is not more wheel intent heuristics and not a
local Pixi micro-optimization. Setta needs a stronger surface runtime boundary:
one graph canvas controller per graph surface, one admitted frame loop per
active surface, and pane presentation that does not rewrite chrome attributes
or resync content during camera movement.

The goal is to make the current failure modes structurally impossible:

- no duplicate live graph renderers for one surface,
- no camera-caused pane chrome mutation storms during camera interaction,
- no camera-caused graph React commits or graph reconstruction in the camera hot
  path,
- no backend or semantic refresh work on the critical input path,
- no mystery animation layer that consumes frame budget without clear meaning.

## Non-Goals

- Do not tune semantic cartographer prompts in this plan.
- Do not redesign durable semantic memory in this plan; that belongs to the
  trajectory and semantic memory plan.
- Do not build a whole-app GPU compositor.
- Do not move normal DOM panes into Pixi, WebGPU, or Three.
- Do not introduce DOM labels for graph nodes.
- Do not add browser-pane offscreen texture routing.
- Do not make wheel delta threshold heuristics the primary fix.
- Do not hide regressions behind debug-only code paths.

## Reference Repos

The most useful references have been cloned shallow/sparse under
`/Users/kevin/Documents/AppDevelopment/reference_repos`.

### RapiD

Local path:
`/Users/kevin/Documents/AppDevelopment/reference_repos/Rapid`

Useful files:

- `modules/core/GraphicsSystem.js`
- `modules/pixi/PixiScene.js`

Useful ideas:

- A single graphics system owns the Pixi application, ticker, stage, scene,
  events, and textures.
- Pixi's automatic ticker/render path is explicitly disabled:
  `autoStart: false`, `sharedTicker: false`, and the application ticker is
  emptied.
- The render loop separates transform work, application/scene preparation, and
  Pixi draw work with `_appPending` and `_drawPending`.
- Temporary transforms can be applied between full redraws, avoiding full scene
  preparation for ordinary movement.
- Scene work is layer-owned; layers render and cull in order, and dirtying can
  be scene-wide, layer-wide, or feature-specific.

RapiD is the closest reference for Setta's graph surface runtime. The plan
should borrow the ownership and scheduling principles, not its map-specific
projection model.

### Leaflet.PixiOverlay

Local path:
`/Users/kevin/Documents/AppDevelopment/reference_repos/Leaflet.PixiOverlay`

Useful files:

- `L.PixiOverlay.js`
- `docs/many-markers.html`

Useful ideas:

- Move/zoom can update a container transform without redrawing by default;
  `shouldRedrawOnMove` defaults to false.
- Redraw is explicit and separate from transform updates.
- The million-marker demo uses `ParticleContainer`, disables Pixi interaction
  management for that overlay, and starts a ticker only during zoom animation.

This is a focused reference for render-on-demand, container-scale zoom, and
bounded interaction overhead. It is not a full editor architecture.

### HiGlass

Local path:
`/Users/kevin/Documents/AppDevelopment/reference_repos/higlass`

Useful files:

- `app/scripts/TiledPixiTrack.js`
- `app/scripts/PixiTrack.js`

Useful ideas:

- Visible data is tracked explicitly through visible tile ids.
- Fetch/render work is scoped to visible tiles and debounced during zoom.
- Camera movement can transform an already-rendered mobile container while
  visible data refresh catches up.

HiGlass is less directly relevant to the immediate duplicate-renderer and pane
mutation issues. Its useful lesson is that large-viewer camera cost should
depend on visible windows/tiles, not total data size.

## Compatibility Policy

This plan should not preserve old graph renderer, workspace presentation, or
surface lifecycle behavior for compatibility.

Do not add:

- backward-compatibility shims,
- legacy support paths,
- migrations,
- old-field aliases,
- transitional readers or writers,
- dual-read/write paths,
- compatibility adapters,
- legacy renderer modes,
- feature flags whose only purpose is preserving old behavior during the
  refactor,
- or silent compatibility fallbacks.

If a renderer state shape, workspace surface contract, generated type, local
storage record, or debug snapshot shape changes incompatibly, change it
directly and fail loudly when stale state is encountered. Local pre-release
workspace/runtime state may be reset. Tests should assert the new contract
rather than asserting migration from the old one.

## Target Architecture

### 1. Surface Runtime Owns Canvas Lifetime

Graph canvas lifetime should be owned by the workspace surface runtime, not by
a React effect whose dependencies can recreate a renderer while an old renderer
is still active.

Introduce or refactor toward an imperative graph surface controller owned at the
surface boundary:

```text
SurfaceRegistry / workspace surface runtime
  GraphSurfaceController(surfaceId)
    Pixi app
    viewport/camera
    scene graph store
    trajectory runtime layer
    semantic visual layer
    lifecycle metrics

React shell
  toolbar
  overlays
  details open commands
  error presentation
```

The controller contract should make these states explicit:

- `mount(host)`
- `activate(reason)`
- `suspend(reason)`
- `transferHost(nextHost)`
- `resize(rect)`
- `updateScene(snapshot)`
- `updateTrajectory(frame)`
- `destroy()`

The important invariant is stricter than the API shape:

> For a given `surfaceId`, at most one Pixi application, one ticker, one
> viewport, and one graph controller may be alive.

Host movement or React rerendering may transfer a controller to a new host, but
it must not create a second renderer for the same surface. If the invariant is
violated, fail loudly in development and fail the deterministic Electron
performance test.

Controller creation must be race-safe. The surface registry should expose an
atomic get-or-create path keyed by `surfaceId`, and the controller should expose
explicit lifecycle states such as `creating`, `mounted`, `active`, `suspended`,
`destroying`, and `destroyed`. Teardown must be idempotent and must invalidate
the controller generation, abort async initialization, cancel stale
`requestAnimationFrame` callbacks, stop tickers, remove listeners and observers,
and drop queued scene or trajectory updates that target an old generation.
Stale callbacks must be counted in diagnostics and must not mutate a destroyed
or superseded controller.

### 2. One Frame Owner And O(1) Camera Path

The graph should have one actual frame owner. Pixi auto-rendering, independent
tickers, renderer-local loops, React commits, and workspace layout frames must
not all compete to render the same camera movement.

The long-term camera path should be:

1. Accumulate wheel/pointer input.
2. Commit one camera/root-container transform.
3. Coalesce required screen-space label or cheap liveness updates.
4. Render once on the admitted frame.

During active camera movement, prohibit:

- independent Pixi auto-render/ticker ownership,
- per-node traversal for camera movement,
- per-edge traversal for camera movement,
- scene-wide Pixi hit testing,
- full label-set synchronization,
- scene graph replacement,
- geometry rebuild,
- semantic runtime projection application,
- and pane chrome/content synchronization.

Allowed movement work must be bounded by visible-window data structures, pooled
display objects, and explicit dirty sets. The target is not literally constant
time for every possible screen size; the target is that camera cost does not
scale with total graph size.

A root transform by itself is not proof of scale independence. Verification must
include workloads where total graph size increases while visible graph density
and visible labels stay fixed. The graph runtime must expose camera-frame
scene-visit counters, including Setta-owned layer visits, graph objects
considered, cull candidates checked, display objects traversed, labels
considered, and bounds calculations, or the closest equivalent counters at the
owning layer. If Pixi does not expose a counter, Setta-owned loops must count
their own visits. Draw calls and rendered object counts are supplemental; they
are not sufficient because hidden CPU traversal can stay invisible to GPU-facing
metrics.

For the constant-visible-content scaling workload, p95 camera-frame scene visits
must stay below `visibleRenderableCount * 4 + 512`, and the p95 visit count at
the largest total graph size must not exceed the smallest total graph size by
more than `5%`. Any missing required visit counter fails the benchmark instead
of being treated as unavailable data.

### 3. Frame Admission Is Evidence-Gated

The workspace already has a layout `FrameScheduler` and the graph has Pixi's
render loop plus renderer-local schedulers. These need a shared admission model
if traces still show competing scheduled work after duplicate renderers and DOM
mutation storms are removed.

Define an interaction-aware frame budget coordinator with lanes such as:

| Lane | Allowed During Camera Movement | Budget |
|---|---:|---:|
| camera transform | yes | under 1ms p95 |
| input diagnostics counters | yes, sampled | under 0.25ms p95 |
| cheap trajectory sprites | yes | bounded and pooled |
| graph label position sync | yes, coalesced | under 2ms p95 |
| semantic decorative animation | no, unless proven cheap | deferred |
| full graph projection replace | no | deferred until settle |
| pane chrome/content sync | no | event-driven outside movement |
| DOM snapshot/capture | no | idle/settled only |

This does not mean all animations stop while panning. It means animation work
is assigned a purpose and a budget:

- camera-critical transforms continue,
- cheap trajectory/liveness indicators may continue,
- semantic decoration that does not communicate state is removed or paused,
- expensive recompute waits until the camera settles.

Do not build this coordinator before remeasuring. If Phase 1 and Phase 2 remove
the main-thread blocker, keep the simpler ownership model and document why a
shared coordinator is not needed yet.

### 4. Presentation Writes Are Split By Frequency

`PresentationEngine` should have two separate write planes:

1. A movement plane that writes only transform, opacity, and z-index.
2. A chrome/content plane that updates pane identity, buttons, labels,
   accessibility attributes, surface assignment, and resize handles only when
   their typed state actually changes.

Pane chrome should be represented as a typed `PaneChromeState` with equality,
not as repeated direct DOM setter calls every frame.

During graph camera movement, the workspace should not repeatedly write:

- `data-pane-id`,
- `data-tone`,
- `aria-label`,
- `title`,
- `tabindex`,
- `aria-hidden`,
- `disabled`,
- resize-handle adjacency data,
- pane action visibility,
- or pane control metadata.

The movement path should be transform-only unless a pane is actually entering
or leaving the visible set.

### 5. Camera Input Is Isolated From Graph Data Updates

Wheel and pointer camera input should update only the viewport transform,
screen-space labels that are required for the current view, and bounded cheap
liveness visuals.

The camera path must not:

- reconstruct the scene graph,
- replace the Pixi app,
- change React state,
- trigger workflow projection refresh,
- apply semantic runtime patches,
- write node layout to the backend,
- sync pane chrome,
- capture snapshots,
- or rebuild graph geometry.

Graph and semantic updates that arrive during camera movement should be queued
as latest-wins scene snapshots and applied after the camera settles, unless the
update is explicitly classified as camera-critical.

### 6. Diagnostics Become Causal, Not Just Voluminous

The current diagnostics are useful, but the long-term profiler should connect
one interaction across event delivery, handler entry, camera commit, rendered
frame, DOM mutations, React commits, and renderer lifecycle.

Each pan/zoom gesture should have a stable interaction id with spans for:

- hardware/browser event timestamp,
- handler start,
- wheel/pointer classification,
- camera transform commit,
- next Pixi render,
- next browser animation frame,
- first presented frame containing the committed camera transform,
- input-to-presented-frame duration,
- settle time,
- active renderer count,
- DOM mutation count by subsystem, owner, and causal source,
- React commit count by owner and causal source,
- deferred graph updates,
- and dropped/deferred animation work.

The recording parser should summarize these into a performance report instead
of requiring manual inspection of raw event logs.

## Implementation Plan

### Phase 0: Trace-Grade Baseline, Blocker Attribution, And Benchmarks

Before changing behavior, turn the current diagnostic evidence into a repeatable
baseline that can identify the task occupying the main thread before handler
entry.

Tasks:

- Add a checked-in append-only report under
  `docs/reports/performance/workspace-graph-pan-zoom-surface-runtime.md`.
- Capture the current manual recording summary:
  - wheel handler p95,
  - camera update p95,
  - event delivery delay p50/p95/max,
  - input-to-presented-frame p50/p95/max,
  - frame p50/p95/max,
  - camera-frame scene visit counters,
  - rendered object count and draw calls as supplemental metrics,
  - active renderer count,
  - duplicate renderer samples,
  - pane chrome mutation counts by owner and causal source,
  - React commit count by owner and causal source during camera movement,
  - graph scene replacement count by causal source during camera movement.
- Capture run metadata:
  - build mode and git commit,
  - machine model,
  - OS version,
  - Electron and Chromium version,
  - device pixel ratio,
  - viewport size,
  - display refresh rate when available,
  - recording enabled/disabled,
  - debug instrumentation enabled/disabled.
- Define deterministic benchmark workloads:
  - `simple`: 3 workflow nodes, 2 edges, no semantic nodes, no trajectory
    backlog. This catches baseline interaction regressions.
  - `normal`: 100 workflow nodes, 150 edges, 25 semantic nodes, 200 recent
    trajectory sprites, labels capped to the visible window.
  - `dense`: 500 workflow nodes, 900 edges, 150 semantic nodes, 1,000 recent
    trajectory sprites, labels capped to the visible window.
  - `stress`: 1,000 workflow nodes, 2,000 edges, 300 semantic nodes, 2,000
    recent trajectory sprites. This is report-only until the normal workload
    passes reliably.
- Pin each benchmark workload to a fixed dataset, layout coordinates, random
  seed, visible graph density, label cap, viewport, zoom level, warm-up count,
  repetition count, and interaction script.
- Add a scaling workload that keeps visible content constant while increasing
  total graph size. Use it to compare frame cost, Pixi render cost, rendered
  object counts, required scene-visit counters, and draw calls.
- Run the primary desktop benchmark at `1440x900` CSS pixels and DPR `2` when
  available. Record actual DPR and refresh rate instead of assuming them.
- Run threshold-gated benchmarks against a production Electron build on a named
  reference runner. Development builds and non-reference machines should emit
  reports and still fail structural invariants, but timing thresholds must not
  gate arbitrary hardware.
- Add or extend a deterministic Electron workflow that performs the same
  interaction script for each workload:
  - wheel pan,
  - modifier zoom,
  - pointer drag pan if supported,
  - graph node drag,
  - semantic/trajectory update arrival during camera movement.
- Capture Chromium trace data through CDP or Electron tracing with categories
  that identify:
  - top-level tasks,
  - input latency,
  - timers,
  - microtasks,
  - style,
  - layout,
  - paint/compositing,
  - GC,
  - V8 execution,
  - user timing marks,
  - React commits,
  - Pixi render/ticker work.
- Add user-timing marks or trace events for:
  - browser event timestamp,
  - handler entry,
  - handler exit,
  - camera transform commit,
  - first Pixi render after input,
  - first browser animation frame after input,
  - first presented frame containing the committed camera transform,
  - graph scene update start/end,
  - pane presentation apply start/end,
  - React commit start/end when observable,
  - disallowed presentation write start/end with owner and causal source,
  - camera-frame scene visit counters.
- Make the deterministic test fail on known structural regressions:
  - active graph renderer count greater than one for a surface,
  - camera-caused graph or graph-shell React commits during camera movement,
  - camera-caused graph app creation during camera movement,
  - disallowed workspace presentation writes during camera movement,
  - camera-caused full graph replacement during camera movement.

Unrelated React commits or DOM mutations that occur while the user is panning or
zooming should be reported with owner and causal-source attribution, not failed
solely because they overlap the interaction window.

Initial target budgets:

- wheel handler p95 under `1ms`,
- camera commit p95 under `1ms`,
- wheel event delivery p95 under one refresh interval plus `8ms` while
  recording and under one refresh interval plus `4ms` without recording,
- input-to-presented-frame p95 under two refresh intervals plus `8ms` while
  recording and under two refresh intervals plus `4ms` without recording for
  the `normal` workload,
- pan/zoom frame p95 under one refresh interval plus `4ms` for the `normal`
  workload without recording,
- active renderer count always exactly `1` for the focused graph surface,
- zero camera-caused disallowed workspace presentation writes during camera
  movement,
- zero camera-caused graph or graph-shell React commits during camera movement,
- constant-visible-content scaling p95 scene visits under
  `visibleRenderableCount * 4 + 512`,
- constant-visible-content scaling p95 scene visits at the largest total graph
  size no more than `5%` above the smallest total graph size.

Success criteria:

- The baseline can be regenerated with one command.
- The report explains whether a run is slow because of input delivery,
  renderer duplication, DOM mutation, React commits, graph work, or recording
  overhead.
- Structural gates distinguish camera-caused graph and presentation work from
  unrelated work that merely overlaps the interaction window.
- The report names the largest tasks occupying the main thread before delayed
  wheel/pointer handler entry.
- The report identifies the build mode, benchmark seed, warm-up count,
  repetition count, workload, runner class, and whether timing thresholds were
  enforced or report-only.
- No product fix is hidden inside Phase 0.

### Phase 1: Move Graph Canvas Lifetime To One Surface Controller And Frame Owner

Replace React-effect-owned Pixi lifetime with a surface-runtime-owned graph
controller and one explicit frame owner.

Tasks:

- Create a `GraphSurfaceController` or equivalent under the workspace graph
  surface boundary.
- Make controller identity keyed by `surfaceId`.
- Make controller lookup and creation atomic for each `surfaceId`.
- Model lifecycle with explicit states and generation tokens or abort signals.
- Make controller creation/destruction owned by the surface registry or a
  surface runtime owner, not by ordinary React rerender dependencies.
- Keep React responsible for overlays and commands, not Pixi app lifetime.
- Replace renderer recreation on host remount with explicit host transfer.
- Disable independent Pixi auto-render/ticker ownership for the graph surface.
  Follow the RapiD model where the application does not own a hidden render
  loop.
- Accumulate wheel/pointer camera input and commit at most one root/container
  transform per admitted frame.
- Render at most once per admitted camera frame.
- During active camera movement, prohibit:
  - full scene replacement,
  - per-node traversal,
  - per-edge traversal,
  - full label-set synchronization,
  - scene-wide Pixi hit testing,
  - geometry rebuild,
  - semantic runtime projection application.
- Add a development invariant that throws if a second live controller is created
  for one `surfaceId`.
- Make `destroy()` idempotent and cancel pending rAF callbacks, tickers,
  listeners, observers, async initialization, and queued updates for the old
  controller generation.
- Remove the old renderer creation path after the new path is in place.

Success criteria:

- Automated pan/zoom recording shows no duplicate active renderer samples.
- Host reassignment, pane focus movement, and graph toolbar rerenders do not
  create a second Pixi app.
- Renderer destruction happens exactly once per controller lifetime.
- Stale lifecycle callbacks and queued updates cannot mutate a destroyed or
  superseded controller.
- Camera movement cost does not scale with total graph size when visible
  content is held constant.
- Trace shows one graph frame owner and no independent Pixi auto-render loop.

### Phase 2: Refactor PresentationEngine To Typed Diffed Writes

Make pane DOM mutation storms impossible by construction.

Tasks:

- Introduce typed state records for:
  - host frame state,
  - pane identity state,
  - pane chrome state,
  - action button state,
  - resize handle state,
  - surface viewport state.
- Diff state records before touching DOM attributes, properties, text, or
  styles.
- Precreate stable pane chrome where possible and only toggle already-diffed
  state.
- Move per-frame movement code onto a transform-only path.
- Remove repeated no-op writes to button labels, titles, disabled state,
  tabindex, visibility, and dataset fields.
- Attribute DOM mutation diagnostics to presentation subcomponents so future
  regressions identify the owner.

Success criteria:

- During graph pan/zoom, pane chrome mutation count is zero unless pane
  assignment or visible set actually changes.
- Existing pane controls still update correctly when focus, maximization,
  split, resize, or adjacency changes.
- Tests cover both no-op frame application and real chrome state changes.

### Phase 3: Remeasure And Gate Further Scheduling Work

Rerun the Phase 0 benchmark matrix before adding a shared frame admission
coordinator.

Tasks:

- Re-run `simple`, `normal`, `dense`, and `stress` workloads with recording on
  and off.
- Re-run the constant-visible-content scaling workload.
- Compare against the Phase 0 report.
- Identify the remaining top pre-handler blockers and long frames.
- Decide whether a shared frame admission coordinator is necessary.
- If the budgets pass without a shared coordinator, record that decision and do
  not build Phase 4 yet.
- If the budgets fail because layout, graph, semantic, and trajectory work still
  compete for frames, proceed to Phase 4 with trace evidence.

Success criteria:

- Duplicate renderer count remains `1`.
- Camera-caused disallowed workspace presentation writes remain absent.
- Input-to-presented-frame p95 is reported and either meets the target budget or
  is explained by named trace evidence.
- Required scene-visit counters are present, satisfy the numeric scaling budget,
  and show whether frame cost scales with visible content or total graph size.
- The report clearly states whether the remaining issue is event delivery,
  graph scene work, Pixi draw work, React work, browser layout/paint, GC, or
  recording overhead.
- Phase 4 is either explicitly justified by traces or explicitly deferred.

### Phase 4: Add Shared Frame Admission Only If Remeasure Requires It

Introduce one interaction-aware scheduling policy for camera movement only if
Phase 3 proves that competing scheduled work remains the bottleneck.

Tasks:

- Extend the existing layout frame scheduler or introduce a small coordinator
  owned by workspace runtime.
- Expose camera movement state from the graph controller without React state.
- Give graph lanes explicit admission rules:
  - camera transforms run immediately,
  - label sync is coalesced to the next admitted frame,
  - trajectory sprites update within a bounded pool,
  - semantic decoration defers or degrades during camera movement,
  - full scene replacement waits until settle.
- Give workspace presentation lanes explicit admission rules:
  - movement transform writes run,
  - pane chrome/content sync waits unless pane assignment changes,
  - snapshot capture waits for idle/settled.
- Record deferred work counts by lane.

Success criteria:

- Pan/zoom cannot trigger full scene replacement.
- Expensive semantic animation cannot consume camera frame budget.
- Deferred graph updates apply once after settle, using latest-wins semantics.
- Trajectory/liveness visuals that are classified as cheap continue while
  panning.
- The coordinator is deleted or not introduced if Phase 3 proves it unnecessary.

### Phase 5: Isolate Camera State From React And Backend Writes

Make camera interaction local, imperative, and persistence-safe.

Tasks:

- Keep camera state in the graph controller during active movement.
- Notify React/backend only on settle or explicit user-visible state boundary.
- Persist camera and node layout edits through a queued, latest-wins command
  path that cannot overwrite local movement with stale projection data.
- Make stale projection/layout refreshes fail a version check or merge through
  a typed local overlay; do not silently snap user-moved nodes back.
- Ensure semantic and workflow projection updates cannot replace the graph scene
  while camera movement is active.

Success criteria:

- Camera pan/zoom produces no graph or graph-shell React commits.
- Node drag position remains stable after async refresh.
- Backend layout persistence failure is visible and specific; stale refreshes
  do not silently reset local layout.

### Phase 6: Simplify The Graph Visual Workload

Remove or reclassify visuals that spend frame budget without readable meaning.

Tasks:

- Inventory every graph animation and assign it to one of:
  - camera-critical,
  - trajectory/liveness,
  - semantic state,
  - decorative.
- Remove decorative semantic animation from the default view unless it maps to a
  named state with visible or inspectable meaning.
- Keep cheap, pooled trajectory sprites separate from durable semantic nodes.
- Ensure background/foundation style is independent from the mere presence of a
  semantic node.
- Define animation budgets per layer and record dropped/deferred work.

Success criteria:

- Pan/zoom does not freeze meaningful liveness indicators.
- Semantic animation has an explicit state meaning or is absent.
- A semantic node appearing does not change the whole background style.

### Phase 7: Replace Raw Logs With A Pan/Zoom Performance Report

Make future recordings actionable without manual log archaeology.

Tasks:

- Add a parser for recording artifacts that emits a concise pan/zoom report.
- Include:
  - interaction ids,
  - event delivery delay,
  - handler duration,
  - camera commit duration,
  - first-render-after-input duration,
  - input-to-presented-frame duration,
  - frame p50/p95/p99/max,
  - required camera-frame scene visit counters,
  - rendered object counts and draw calls as supplemental metrics,
  - duplicate renderer count,
  - DOM mutations by owner and causal source,
  - React commits by owner and causal source,
  - full scene replacements,
  - deferred work by lane.
- Store before/after reports under `docs/reports/performance/`.
- Wire deterministic Electron performance tests to the same summary code so
  manual and automated evidence use one vocabulary.

Success criteria:

- A new recording can answer why pan/zoom felt bad in one report.
- The report distinguishes handler cost, event delivery delay, renderer
  lifecycle, DOM mutation, React work, and graph scene work.

### Phase 8: Delete Old Hot Paths And Lock In The Contract

After the new surface runtime is proven, remove the old paths.

Tasks:

- Delete React-effect-owned Pixi app creation.
- Delete any old per-frame pane chrome sync path that bypasses typed diffing.
- Delete obsolete debug fields and tests that assert the old lifecycle.
- Remove tactical wheel or lifecycle workaround code that the new architecture
  makes unnecessary.
- Update docs so future work extends the surface controller, frame admission,
  and typed presentation write model.

Success criteria:

- There is one graph canvas lifecycle model.
- There is one workspace presentation write model.
- There are no transitional adapters, compatibility readers, legacy renderer
  modes, dual paths, or stale feature flags.

## Verification Requirements

Use production Electron/main/preload/renderer/store paths with temporary app
data for behavior that touches workspace surfaces, renderer lifecycle, graph
interaction, workflow projection, or trajectory display.

Required checks before implementation commits that touch executable code:

- Phase 0 trace capture and report generation for the relevant benchmark
  workload,
- renderer-level scaling benchmark with constant visible content and increasing
  total graph size,
- focused renderer/unit tests for scheduler, presentation diffing, graph
  controller lifecycle, and camera state behavior,
- deterministic Electron pan/zoom performance workflow,
- deterministic Electron workflow graph interaction workflow,
- `./scripts/format.sh`,
- `./check_quality.sh --all`.

For performance-relevant phases, record before/after results as append-only
reports under `docs/reports/performance/`.

## Open Decisions

- Before Phase 0: whether trace capture should use Playwright/CDP tracing,
  Electron tracing, or both.
- Before Phase 0: which machine or CI lane is the timing-threshold reference
  runner, and which machines are report-only for timing metrics.
- Before Phase 0: how the input-to-presented-frame timestamp is derived from
  Chromium/Electron traces so the metric means a committed camera transform was
  presented, not only scheduled.
- Whether the graph controller should live directly inside `SurfaceRegistry` or
  behind a new `WorkspaceSurfaceRuntime` owner. Decide before Phase 1.
- Whether pane chrome should remain per-pane DOM or move to a single overlay
  layer keyed by focused/hovered pane. Decide before Phase 2.
- Whether frame admission should extend the existing `FrameScheduler` or be a
  small coordinator consumed by both layout and graph. Decide only after the
  Phase 3 remeasurement gate proves Phase 4 is needed.
- Whether graph full-scene replacement during camera movement should always be
  latest-wins deferred, or whether a small class of workflow execution status
  updates should be admitted immediately. Decide before Phase 4 or Phase 5,
  depending on whether the scheduler gate is opened.

Do not resolve these by adding temporary dual paths. Pick the new owner and
contract, update the implementation to that contract, and delete the old path.
