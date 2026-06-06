# Niri-Style Electron Pane System v2: DOM-Preserved High-Performance Plan

## Executive Decision

The original plan is directionally correct, but it should be tightened.

The most important change is conceptual:

> Build a custom **pane manager / presentation engine**, not a custom DOM renderer and not a whole-app GPU compositor.

The system should arrange, animate, virtualize, freeze, snapshot, and lifecycle-manage panes. It should not render React DOM, browser pages, form controls, selections, IME, accessibility, or normal HTML into WebGPU/Pixi/Three.

The correct architecture is:

```txt
Electron + React shell
TypeScript niri-like layout engine
DOM/native-view presentation layer
Surface adapters per pane type
Electron WebContentsView for browser panes
Pixi/WebGPU only inside GPU-heavy panes
Rust/WASM/native modules only for isolated hot paths
```

## Prototype Branch Stance

This branch should optimize for the fastest credible niri-style prototype, not
for immediate mergeability as the final application architecture.

It is acceptable for this branch to remove the current finite pane grid from
the active workspace presentation path. The branch can become an example or
reference implementation if the experiment proves valuable, rather than the
exact code that lands unchanged.

However, the prototype should still keep the future integration boundary clean:

```txt
App shell
 ├─ top bar / window chrome
 ├─ project sidebar
 └─ workspace presentation surface
     └─ niri presentation engine
```

The top bar and project sidebar should stay outside the niri engine. The niri
engine owns only the workspace presentation surface.

Do not implement a live classic-grid/niri mode switch in this branch. If the
experiment is later productized, the intended switch should be startup-mode
selection with app relaunch semantics:

```txt
classic-grid on startup → mount classic workspace presentation
niri on startup         → mount niri workspace presentation
setting changed         → persist preference, require relaunch
```

That future switch should be a small mount-point choice, not a shared layout
model and not a hot runtime conversion.

## What Changed from the Original Plan

### Keep

- Niri-inspired infinite horizontal columns.
- Up/down splits within a column.
- Stable pane sizes.
- Transform-only pane movement for DOM/canvas panes.
- `WebContentsView` for browser panes.
- Snapshot/freeze/throttle lifecycle for heavy panes.
- Pixi/WebGPU inside heavy canvas panes.
- TypeScript layout engine first.
- Debug overlay and benchmark scenes from day one.

### Modify

1. Rename the "compositor" to **Presentation Engine** or **Pane Orchestrator** in code/docs.
   - The word compositor may cause an implementation LLM to build a pixel compositor.
   - This layer should compute/apply rectangles, transforms, bounds, visibility, snapshots, and lifecycle policy.

2. Add a strict **no custom DOM renderer** rule.
   - React DOM panes must remain DOM.
   - Browser panes must remain Chromium/Electron surfaces.
   - WebGPU/Pixi should not become the universal renderer.

3. Make surface boundaries explicit.
   - Every pane type implements a `SurfaceAdapter`.
   - The layout engine never imports React, Electron, Pixi, WebGPU, terminal code, or browser code.

4. Treat `WebContentsView` as a separate native-view path.
   - It is not a DOM element.
   - It must be created, positioned, focused, hidden, and destroyed from Electron main-process code.
   - Renderer-process layout sends batched bounds updates.

5. Treat Rust/WASM/native as optional acceleration boundaries.
   - Do not start by moving the pane manager to Rust/WASM.
   - Use Rust/WASM for pure compute only after profiling.
   - Use native Rust/C++ only for OS/GPU/native integrations such as libghostty, PTY, or shared texture experiments.

6. Add implementation guardrails for Codex.
   - No React state writes inside `requestAnimationFrame`.
   - No layout engine imports from UI modules.
   - No per-pane React re-render during movement.
   - No unbounded live browser panes.
   - No global `will-change` on every pane.

## Hard Anti-Goals

Do not build:

```txt
A custom HTML/CSS renderer
A custom DOM-in-WebGPU renderer
A whole-app Three.js scene
A whole-app Pixi scene
A whole-app WebGPU compositor as v1
A system where React state updates every animation frame
A system where every pane stays live forever
A system where browser panes are treated like normal divs
```

The product needs niri-like pane behavior, not niri's full Wayland compositor model.

## Core Architecture

```txt
Electron Main Process
 ├─ AppWindow
 ├─ WebContentsViewRegistry
 ├─ NativeViewBoundsBatcher
 ├─ BrowserPaneLifecycleManager
 ├─ Terminal/PTY services
 └─ Optional native modules

Renderer Process
 ├─ React App Shell
 ├─ LayoutStore
 ├─ NiriLikeLayoutEngine
 ├─ PresentationEngine
 ├─ SurfaceRegistry
 ├─ PaneRuntimePolicy
 ├─ SnapshotManager
 ├─ AnimationClock
 ├─ FrameScheduler
 └─ DebugOverlay

Workers / Optional Native
 ├─ Graph layout worker
 ├─ Diff worker
 ├─ Node-canvas spatial-index worker
 ├─ Terminal parser/renderer worker
 └─ Optional Rust/WASM pure compute modules
```

## Rendering Boundaries

| Pane Type | Renderer | Presentation Strategy |
|---|---|---|
| Chat | React DOM | Move host with transform; virtualize content. |
| Settings | React DOM | Normal DOM. |
| Diffs | React DOM + virtualization | Canvas minimap only if needed. |
| Git graph | DOM/SVG for small, Canvas/Pixi/WebGPU for large | Worker for layout. |
| Infinite node canvas | Pixi/WebGPU inside pane | Spatial culling, LOD, pause/resume. |
| Browser | Electron `WebContentsView` | Native view bounds via main process. |
| Terminal | libghostty/core + GPU/canvas renderer if feasible | Dirty-row rendering, virtualized scrollback. |
| Far/inactive pane | Snapshot/placeholder | No live heavy surface. |

## Main Performance Principle

Pane movement must not rerender pane contents.

Good frame path:

```txt
pointer/key input
→ sample one frame timestamp
→ compute pane rectangles
→ write CSS transforms for DOM/canvas hosts
→ send one batched native-view bounds update
→ composite
```

Bad frame path:

```txt
pointer/key input
→ set React state
→ React render
→ DOM layout
→ DOM paint
→ canvas/browser relayout
→ composite
```

## 120 FPS Interpretation

Target:

> 120 fps shell-level movement for visible panes under realistic budgets.

Do not define target as:

> Unlimited live Chromium/DOM/WebGPU panes all actively rendering at 120 fps.

That target is not bounded. Browser panes, canvas panes, DOM panes, terminal output, and git/diff computation all consume independent CPU/GPU/process resources.

## TypeScript First

Keep the pane system in TypeScript initially.

Use TypeScript for:

```txt
workspace/column/pane model
focus movement
split operations
resize operations
animation state
visibility policy
surface lifecycle orchestration
DOM transform application
IPC batching to main process
debug overlays
benchmark scene generation
```

The layout engine is unlikely to be the bottleneck compared with Chromium rendering, canvas rendering, browser pane rendering, IPC, and heavy content computation.

## Rust/WASM/Native Strategy

### Use Rust/WASM for pure compute only

Good candidates:

```txt
large graph layout
spatial indexes
hit testing
node/edge culling
diff algorithms
syntax parsing
terminal parsing/state machine
geometry packing
large local indexes
```

Bad candidates:

```txt
DOM rendering
React rendering
browser-pane rendering
per-frame DOM mutation
accessibility
IME/text input
selection/copy/paste
CSS layout
normal UI components
```

Use typed-array batch APIs across the Wasm boundary. Avoid calling Wasm once per pane/node/edge.

Good:

```ts
layoutWasm.computeVisibleItems(inputBuffer, outputBuffer)
```

Bad:

```ts
for (const node of nodes) {
  layoutWasm.computeNode(node)
}
```

### Use native Rust/C++ only for native integration

Good candidates:

```txt
libghostty integration
PTY management
shared GPU texture interop
OS-specific file watching/indexing
native search/index engines
custom native renderer experiments
```

Avoid native code for the core pane manager until profiling proves the need.

## Core Interfaces

### Layout Engine

```ts
export interface LayoutEngine {
  openPane(request: OpenPaneRequest): PaneId
  closePane(paneId: PaneId): void

  splitPane(paneId: PaneId, direction: 'up' | 'down' | 'left' | 'right'): PaneId
  moveFocus(direction: 'up' | 'down' | 'left' | 'right'): void
  movePane(paneId: PaneId, direction: 'up' | 'down' | 'left' | 'right'): void

  resizeColumn(columnId: ColumnId, width: SizeSpec): void
  resizePane(paneId: PaneId, heightWeight: number): void

  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void
}
```

Rules:

- No React imports.
- No DOM imports.
- No Electron imports.
- No Pixi/WebGPU imports.
- Deterministic output for deterministic input.
- Unit tested heavily.

### Pane Render Item

```ts
export type PaneRenderItem = {
  paneId: PaneId
  surfaceId: SurfaceId
  surfaceKind: SurfaceKind

  x: number
  y: number
  width: number
  height: number
  z: number

  opacity: number
  visible: boolean
  focused: boolean
  moving: boolean
  resizing: boolean

  runtimeState: PaneRuntimeState
}
```

### Surface Adapter

```ts
export interface SurfaceAdapter {
  readonly surfaceId: SurfaceId
  readonly kind: SurfaceKind

  mount(host: HTMLElement): void
  unmount(): void

  setVisible(visible: boolean): void
  setFocused(focused: boolean): void

  setViewport(rect: Rect, reason: ViewportChangeReason): void

  freeze(reason: FreezeReason): void
  resume(reason: ResumeReason): void

  captureSnapshot?(): Promise<PaneSnapshot>
  destroy(): void
}
```

Surface adapters isolate implementation details:

```txt
ReactDomSurfaceAdapter
PixiCanvasSurfaceAdapter
WebGpuCanvasSurfaceAdapter
TerminalSurfaceAdapter
BrowserSurfaceProxyAdapter
SnapshotSurfaceAdapter
```

### Browser Surface Proxy

Renderer process:

```ts
export interface BrowserSurfaceProxyAdapter extends SurfaceAdapter {
  queueNativeBounds(rect: Rect): void
}
```

Main process:

```ts
export interface WebContentsViewRegistry {
  create(surfaceId: SurfaceId, options: BrowserPaneOptions): void
  destroy(surfaceId: SurfaceId): void
  setBoundsBatch(batch: NativeViewBoundsUpdate[]): void
  setVisible(surfaceId: SurfaceId, visible: boolean): void
  focus(surfaceId: SurfaceId): void
}
```

Rules:

- Batch bounds updates.
- Do not IPC per pane per event.
- Do not keep unlimited browser panes live.
- Do not depend on CSS transforms for browser panes.

## Presentation Engine

The Presentation Engine consumes `PaneRenderItem`s and applies them.

Responsibilities:

```txt
DOM host transform writes
DOM host size writes only when needed
native WebContentsView bounds batching
z-order synchronization
visibility synchronization
runtime state transitions
snapshot swaps
freeze/resume coordination
debug overlay updates
```

Non-responsibilities:

```txt
rendering React content
rendering browser content
rendering terminal glyphs
rendering Pixi/WebGPU scenes
running diff algorithms
running git graph layout
```

## Runtime State Policy

Every pane must have one runtime state:

```ts
export type PaneRuntimeState =
  | 'live'
  | 'live-throttled'
  | 'snapshot'
  | 'hidden'
  | 'destroyed'
```

Initial budget:

```ts
export const DEFAULT_PANE_BUDGET = {
  maxLiveBrowserPanes: 6,
  maxLiveWebGpuCanvases: 4,
  maxLiveHeavyDomPanes: 12,
  maxLiveTerminalRenderers: 8,
  maxSnapshotPanes: 64,
}
```

Policy priorities:

1. Focused pane stays live.
2. Visible light panes stay live.
3. Visible heavy panes stay live only within budget.
4. Near offscreen panes become snapshot or throttled.
5. Far offscreen panes become hidden or destroyed.
6. Browser panes are the most expensive and should be capped aggressively.
7. Hidden canvases pause rendering.
8. Hidden terminals pause rendering but may keep parser/session state.

## Resize Policy

During drag:

```txt
120 fps:
  update pane frame transform/overlay

30-60 fps or lower:
  resize heavy content surfaces

on pointerup:
  commit exact final dimensions
  unfreeze/resume affected surfaces
  remeasure once
```

Do not resize every heavy surface on every pointer event.

## CSS Rules for DOM/Canvas Hosts

```css
.pane-host {
  position: absolute;
  overflow: hidden;
  contain: layout paint size style;
}

.pane-host[data-moving='true'] {
  will-change: transform, opacity;
}
```

Rules:

- Movement uses `transform`.
- Fade uses `opacity`.
- Avoid animating `left`, `top`, `width`, `height`, grid, or flex during movement.
- Apply `will-change` only to panes that are moving or likely to move soon.
- Avoid expensive blur/backdrop/shadow effects during movement.

## React Rules

React is the control plane, not the frame loop.

Allowed React updates:

```txt
pane created/destroyed
surface mounted/unmounted
focus metadata changed
command palette opened
settings changed
user-visible structural state changed
```

Disallowed React updates:

```txt
per-frame pane x/y movement
per-frame animation interpolation
per-frame scroll-following layout
per-token chat rendering
per-terminal-chunk rendering
per-browser-bounds update
```

Use an external store for pane state snapshots. React reads stable snapshots for structural UI, while the presentation engine mutates DOM styles imperatively during animation.

## Snapshot Strategy

Snapshots are a performance tool, not a correctness source of truth.

Use snapshots for:

```txt
far offscreen panes
overview/minimap mode
non-focused browser panes during large movement
heavy canvas panes while not interactive
expensive DOM panes during transitions
```

Do not require perfect snapshots for v1. A simplified preview is acceptable for far/inactive panes.

## WebContentsView Strategy

Use `WebContentsView` for embedded browser panes.

Renderer process:

```txt
layout engine computes rects
presentation engine queues browser rects
one IPC batch per frame max
```

Main process:

```txt
own WebContentsView instances
apply changed bounds only
manage focus/z-order/visibility
create/destroy/hide views based on runtime policy
```

For overview/fancy transitions:

```txt
focused browser pane: live WebContentsView
non-focused browser panes: snapshot when possible
far browser panes: hidden or destroyed
```

## Implementation Phases

### Phase 0: Prototype boundary and teardown discipline

Build the niri workspace as the only active workspace presentation in this
branch, but keep it isolated from the app shell.

Deliverables:

```txt
NiriWorkspaceArea mount point
top bar preserved outside niri
project sidebar preserved outside niri
niri-only workspace presentation folder/module boundary
renderer-local prototype flag or direct prototype mount
explicit teardown API for animation loops, observers, workers, and surfaces
```

Allowed in this branch:

```txt
remove the old pane grid from the active workspace presentation path
leave old grid files in place if keeping them reduces merge/delete churn
use prototype-only fake panes before wiring real product surfaces
```

Avoid in this branch:

```txt
live classic-grid/niri switching
shared classic/niri layout state
backend preference contracts
generated contract changes
chat store rewrites
workspace sidebar rewrites
Pixi renderer rewrites owned by setta-3-pixi
API/CLI/backend discovery changes owned by setta-3-api-and-skills
```

Acceptance:

```txt
app starts directly into niri workspace presentation
top bar and project sidebar remain intact
niri teardown leaves no RAF loop, worker, observer, native view, or canvas renderer running
no backend/generated contract changes are needed
```

### Phase 1: Strict fake-pane shell

Build only fake lightweight panes.

Deliverables:

```txt
LayoutEngine
LayoutStore
PresentationEngine
FrameScheduler
AnimationClock
DebugOverlay
BenchmarkSceneGenerator
performance report writer
```

Acceptance:

```txt
500 total fake panes
40 visible fake panes
120 fps focus movement on target hardware
no React commits during movement
p95 shell frame time under 8.33 ms
p99 shell frame time recorded and reviewed
DOM transform writes are bounded to visible pane hosts
no pane-content render work occurs during movement
debug overlay shows frame time, visible pane count, transform writes, and long tasks
```

Stop if:

```txt
fake panes cannot meet frame budget in production renderer build
movement requires React state updates per frame
layout engine starts depending on React, DOM, Electron, Pixi, or pane content
```

### Phase 2: Heavy fake surfaces and lifecycle policy

Before wiring real app surfaces, prove that the shell can survive expensive
surface behavior with controlled fake workloads.

Deliverables:

```txt
PaneRuntimePolicy
SurfaceRegistry
FakeHeavyDomSurfaceAdapter
FakeCanvasSurfaceAdapter
SnapshotSurfaceAdapter
freeze/resume lifecycle hooks
visibility budget enforcement
runtime-state debug overlay
```

Acceptance:

```txt
500 total panes with mixed fake light/heavy surfaces
40 visible panes
heavy fake panes freeze or snapshot during large movement
hidden fake canvases stop rendering
runtime budgets are visible and enforceable
shell p95 remains under 8.33 ms with heavy fake surfaces degraded
```

Stop if:

```txt
surface lifecycle policy is heuristic-only and not inspectable
hidden or snapshotted surfaces continue doing frame work
budget enforcement causes visible focus or interaction bugs
```

### Phase 3: DOM surface adapters

Add React DOM surfaces carefully. Prefer wrapping existing app components over
rewriting chat, settings, or diff internals.

Deliverables:

```txt
ReactDomSurfaceAdapter
freeze/resume API
host-level transform/visibility control
stable React mount/unmount semantics
fake long-chat pane before real chat pane
real settings pane wrapper
real chat pane wrapper only after fake long-chat passes
```

Acceptance:

```txt
long DOM panes do not jank pane movement
real settings pane can be moved, focused, hidden, and restored
real chat pane can be moved, focused, hidden, and restored
chat streaming does not introduce per-token shell movement renders
DOM panes do not remeasure or relayout on every movement frame
React commits during shell movement remain zero or explicitly explained
```

Avoid:

```txt
chat store normalization rewrites
conversation/sidebar model rewrites
backend chat behavior changes
component refactors unrelated to surface mounting
```

### Phase 4: Browser panes

Add `WebContentsView` support.

Deliverables:

```txt
BrowserSurfaceProxyAdapter
WebContentsViewRegistry in main process
NativeViewBoundsBatcher
focus routing
visibility lifecycle
browser pane budget policy
native-view teardown verification
browser-pane benchmark scene
```

Acceptance:

```txt
4-8 live browser panes visible
20+ total browser panes with non-visible panes hidden/snapshotted
one native bounds IPC batch per frame max
no per-pane IPC spam
focus routing works between DOM panes and browser panes
hidden/destroyed browser views do not keep consuming active frame budget
```

Stop if:

```txt
native view bounds updates cannot be batched
browser focus routing requires broad app-shell rewrites
WebContentsView lifecycle leaks after workspace teardown
4 live browser panes already destroy shell frame budget
```

### Phase 5: Infinite canvas pane

Add Pixi/WebGPU canvas pane.

Treat existing or future Pixi prototype work as the renderer owner. The niri
system should provide a `PixiCanvasSurfaceAdapter` boundary and lifecycle
contract; it should not absorb the Pixi renderer implementation unless this
branch intentionally becomes the Pixi owner.

Deliverables:

```txt
PixiCanvasSurfaceAdapter
pause/resume rendering
viewport and focus lifecycle
draw-call stats surfaced to debug overlay
GPU memory estimate where available
optional worker/OffscreenCanvas path
```

Acceptance:

```txt
canvas pan/zoom does not jank shell
hidden canvas rendering pauses
far zoom uses simplified rendering
canvas pane can be snapshotted or hidden without breaking shell interaction
```

Stop if:

```txt
canvas rendering competes with shell movement without backpressure
hidden canvas panes continue rendering
adapter requires rewriting the pane manager around Pixi concepts
```

### Phase 6: Terminal and git graph

Deliverables:

```txt
TerminalSurfaceAdapter
dirty-row terminal rendering
scrollback virtualization
git graph worker
graph renderer selection by scale
backpressure for terminal output floods
```

Acceptance:

```txt
terminal flood does not block shell movement
git graph computation runs off main UI thread
large graph progressively renders
terminal/session state remains separate from terminal rendering lifecycle
```

### Phase 7: Optional advanced texture path

Only after profiling proves the normal architecture insufficient.

Explore:

```txt
Electron offscreen rendering
shared GPU texture import
browser snapshots/live texture experiments
native module for GPU interop
WebGPU overview compositor for snapshots
```

This should remain optional because it introduces platform-specific graphics, input remapping, accessibility, IME, popup, focus, and GPU-memory complexity.

Stop if:

```txt
advanced texture work becomes necessary before Phase 1-6 benchmark evidence exists
input/focus/accessibility behavior becomes approximate or heuristic
platform-specific GPU work starts contaminating the core layout engine
```

## Codex Implementation Guardrails

An implementation LLM should obey these constraints:

1. Never import React into the layout engine.
2. Never import Electron into the layout engine.
3. Never call `setState` from the animation frame loop.
4. Never create one IPC message per pane if batching is possible.
5. Never keep all browser panes live.
6. Never apply permanent `will-change` to every pane.
7. Never route normal DOM rendering through canvas/WebGPU.
8. Never add a Rust/WASM module without a clear data-only boundary.
9. Never optimize before the benchmark scene and debug overlay exist.
10. Never make the visible shell depend on completion of heavy pane rendering.
11. Never make the niri engine depend on the classic pane grid layout model.
12. Never implement live classic/niri switching in this prototype branch.
13. Never rewrite chat, sidebar, backend, generated contracts, or Pixi renderer internals to make Phase 1 or Phase 2 pass.
14. Never add browser/native-view IPC before fake-pane and heavy-fake-surface benchmarks pass.
15. Never add dependency or lockfile churn before a phase explicitly needs it.
16. Never hide performance failures behind lower benchmark counts without recording the failed result.

## Branch Interaction Rules

Other branches are expected to keep changing the app architecture, backend API,
and Pixi prototype. This experiment should avoid stepping on those areas until
there is benchmark evidence that the niri shell is worth deeper integration.

Treat these as external ownership boundaries:

```txt
setta-3:
  chat flow, sidebar model, store normalization, app architecture cleanup

setta-3-api-and-skills:
  backend discovery, CLI/API contracts, generated backend contracts, IPC expansion

setta-3-pixi:
  Pixi renderer implementation, visual tooling, MSDF/font/rendering details
```

The niri prototype may define adapters for those surfaces, but should not
rewrite the underlying owned systems unless the experiment intentionally changes
scope.

## Testing and Instrumentation

Required metrics:

```txt
frame time p50/p95/p99
dropped frames
React commits per second
DOM transform writes per frame
native bounds updates per frame
IPC messages per second
live browser pane count
live canvas pane count
snapshot pane count
hidden pane count
terminal dirty rows per frame
canvas draw calls
GPU memory estimate where available
long tasks
```

Required benchmark scenes:

```txt
Scene A: 500 fake panes, 40 visible
Scene B: 500 panes with fake heavy DOM/canvas surfaces and lifecycle degradation
Scene C: real DOM wrappers for settings/chat after fake long-DOM pane passes
Scene D: browser-pane scene with 4-8 live WebContentsView panes and 20+ total browser panes
Scene E: canvas-pane scene with pause/resume and debug draw stats
Scene F: mixed stress scene with terminal, chat, browser automation, canvas, and git worker active
```

Required reports:

```txt
append-only performance report for every phase gate
production renderer build results, not only dev-server results
clear failed benchmark records before tuning or lowering counts
visual inspection artifacts for UI-facing phases
teardown/leak verification notes for native views, workers, RAF loops, and canvases
```

## Final Recommendation

The old document is the right direction, but this prototype should be stricter
and more performance-focused:

```txt
Build a niri-like pane manager.
Use this branch as a prototype/reference branch if needed.
Keep top bar and project sidebar outside the engine.
Make niri the active workspace presentation in this branch.
Do not build live classic/niri switching here.
Preserve Chromium DOM rendering.
Use WebContentsView for browser panes.
Use Pixi/WebGPU only inside heavy visual panes.
Use TypeScript for orchestration.
Use Rust/WASM/native only behind narrow, measured boundaries.
Make every heavy surface freeze/throttle/snapshot/hide capable.
Do not integrate real app surfaces until fake benchmark gates pass.
```

This is cleaner for Codex to implement and maintain because responsibilities are separated by explicit interfaces. It is also the highest-performance path because the shell's animation loop stays tiny and predictable while pane contents render independently or degrade gracefully.

## References

- Electron WebContentsView: https://www.electronjs.org/docs/latest/api/web-contents-view
- Electron web embeds: https://www.electronjs.org/docs/latest/tutorial/web-embeds
- Electron offscreen rendering: https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering
- Chrome compositor-only animation guidance: https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
- MDN WebAssembly concepts: https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Concepts
- React useSyncExternalStore: https://react.dev/reference/react/useSyncExternalStore
- Niri redraw loop: https://github.com/niri-wm/niri/wiki/Development:-Redraw-Loop
- Niri animation timing: https://github.com/niri-wm/niri/wiki/Development:-Animation-Timing
- Niri layout configuration: https://github.com/niri-wm/niri/wiki/Configuration:-Layout
