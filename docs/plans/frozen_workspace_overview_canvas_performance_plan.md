# Frozen Workspace Overview and Canvas Performance Plan

## Goal

Make overview and pane-to-pane movement behave like a frozen niri workspace snapshot: panes keep
their on-screen aspect ratio, terminal and canvas panes stop doing live rendering work during
movement, and large/maximized workflow graph panes do not drag the compositor below the target
frame cadence.

The target experience is:

- A maximized pane enters overview with the same visual aspect ratio it had in normal mode.
- Overview animates cached pane textures, not live terminals, xterm fits, Pixi renderer resizes, or
  large React/canvas work.
- Pane-to-pane navigation and overview transitions never wait for texture creation.
- When movement settles, the focused pane resumes exactly once at its final size.
- At 4K desktop sizes, a maximized workflow graph pane can be idle/live without continuous
  unnecessary GPU work.

The core invariant is that capture is never on the animation critical path. A transition may use a
slightly stale texture, but it must not synchronously create, resize, decode, upload, or wait for a
fresh texture before beginning motion.

Animations are the priority path. If texture readiness and animation smoothness conflict,
animation smoothness wins every time. Texture capture must degrade visually, not temporally: use an
old texture, use a lower-fidelity fallback, or show a static placeholder, but never make the
workspace wait.

## Findings

### Overview Geometry Is Recomputed Instead of Frozen

`FrameScheduler` currently renders two independent endpoints during zoom:

- normal endpoint: `engine.renderFrame({ presentationMode: "normal", renderAllColumns: true })`
- overview endpoint: `engine.renderFrame({ presentationMode: "overview" })`

That means overview is a second layout, not a frozen transform of the current workspace.

There is also a concrete maximized-pane bug in the overview path:

- normal layout passes `maximizedPaneId` through column geometry and `pushColumnItems`
- overview layout calls `columnGeometry(..., null, ..., true)`
- `renderOverviewLayoutFrame` calls `pushColumnItems` without `maximizedPaneId`

So a maximized pane gets full-size geometry in normal mode, but weighted stack geometry in overview.
That explains the observed aspect-ratio loss when entering overview.

### Runtime Policy Degrades Panes, but Snapshots Are Not a Complete Freeze Contract

`PaneRuntimePolicy` already assigns `snapshot` to movement and overview items for terminal,
workflow graph, browser, and heavy DOM panes. The policy is in the right direction.

The problem is lower in the stack:

- `SurfaceRegistry` swaps live adapters to `SnapshotSurfaceAdapter`.
- `SnapshotSurfaceAdapter.captureTexture()` clones DOM children.
- Canvas clones do not preserve rendered pixels.
- `captureBitmap()` is currently warmed only for selected DOM-heavy surface kinds, not
  `workflow-graph` or `terminal`.

So the current snapshot path is not a reliable frozen bitmap for canvas or terminal panes.

### Workflow Graph Can Keep Work Alive While Parked

`workflow-graph` uses `ReactDomSurfaceAdapter`, which parks the React root on unmount instead of
destroying it. That preserves app state, but it also means the Pixi renderer can remain alive in a
detached container when the live adapter is swapped out for a snapshot adapter.

The Pixi renderer currently:

- starts its own ticker
- increments frame timing every tick
- installs a `ResizeObserver`
- resizes the renderer and viewport whenever the host changes size
- initializes at `window.devicePixelRatio`

At maximized/4K sizes this can produce a very large backing store. During overview or niri-style
movement, resizing that backing store is exactly the kind of work we should avoid.

### Terminal Freeze Is Closer, but Needs Bitmap Snapshot Coverage

`TerminalSurfaceAdapter` already queues output while frozen and skips fit/resize while frozen.
That is good. The missing piece is making movement/overview reliably show a captured terminal
bitmap instead of forcing live xterm or a DOM clone.

## Proposed Design

### 0. Make Texture Readiness a Background Contract

The animation system should assume textures are already available. It should not request a fresh
capture and then wait before animating.

Every visible pane should maintain a texture slot:

```ts
interface PaneTextureSlot {
  captureKey: string;
  freshness: "fresh" | "stale" | "missing";
  lastUpdatedAt: number;
  texture: CapturedSurfaceTexture | null;
}
```

Texture updates should happen opportunistically:

- after live content first settles
- after final viewport resize commits
- after scroll/camera changes settle
- when terminal output drains
- when workflow graph camera or graph content changes
- during idle frames, never during transition startup

When a transition starts:

- use the current texture slot immediately
- prefer fresh texture
- fall back to stale texture
- fall back to static lightweight placeholder only if no texture has ever been captured
- record a metric when fallback happens
- never block the first animation frame
- never extend an active animation because capture work is pending

This is more important than texture freshness. A stale-but-immediate texture feels better than a
perfect texture that causes a hitch.

The implementation should make this hard to violate:

- transition code should not `await` capture promises
- texture capture should run through background jobs or idle callbacks
- animation scheduling should consume only already-resolved texture slots
- capture completion should request a later visual refresh, not mutate the current animation path
- tests should fail if a transition startup depends on async capture resolution

### 1. Add a Frozen Workspace Frame Boundary

Introduce a small module, likely `workspace-frozen-frame.ts`, that owns the geometry contract for
overview transitions.

It should capture the current normal-mode render items before entering overview:

```ts
interface FrozenWorkspaceFrame {
  capturedAtRevision: number;
  capturedViewport: Rect;
  items: PaneRenderItem[];
  maximizedPaneId: PaneId | null;
}
```

Then derive the overview endpoint by scaling and positioning those captured item rectangles as a
group. Do not ask the layout engine to recompute pane sizes for the overview endpoint.

This makes overview a transform of the current workspace, which preserves maximized pane aspect
ratio by construction.

Short-term local bug fix:

- Pass `input.maximizedPaneId` into overview geometry and `pushColumnItems`.
- Add a regression test that a maximized pane keeps the same width/height ratio between normal and
  overview.

Long-term correct fix:

- Replace overview endpoint recomputation with the frozen-frame endpoint.
- Keep the old overview layout only for non-transition layout if we still need a fallback.

### 2. Build a Real Surface Snapshot Coordinator

Create a snapshot coordinator inside the presentation/surface layer. It should own these concerns:

- capture or reuse pane textures outside movement/overview startup
- expose whether a pane has a fresh texture, stale texture, or static fallback
- keep stale textures usable until a newer capture is ready
- avoid blocking the animation on async capture
- record metrics for capture count, capture latency, stale fallback use, and missing texture use

The coordinator should support three capture paths:

- DOM bitmap via `window.setta.app.captureRendererRegion`
- canvas bitmap via the rendered canvas or Pixi extraction path
- native browser view snapshot via the existing browser snapshot path

`SnapshotSurfaceAdapter` should become a renderer for a captured texture, not the owner of all
capture policy.

Texture capture should be cancellable and versioned. If a pane changes size or content while a
capture is in flight, the result should be discarded unless its capture key still matches the
current texture slot target.

### 3. Make Workflow Graph a Dedicated Adapter

Stop treating `workflow-graph` as a generic React DOM surface for runtime control. Add a
`WorkflowGraphSurfaceAdapter` or an adapter specialization with a narrow control surface:

```ts
interface WorkflowGraphRuntimeHandle {
  captureTexture(): Promise<CapturedSurfaceTexture | null>;
  setFrozen(frozen: boolean): void;
  setViewport(rect: Rect, reason: ViewportChangeReason): void;
}
```

The renderer should get an explicit frozen state, not infer it from dataset attributes.

When frozen:

- stop or pause the Pixi ticker
- pause viewport deceleration
- cancel active interactions
- ignore pointer/wheel input
- skip renderer resize work
- keep the last rendered canvas/texture visible through the snapshot layer

When resumed:

- apply at most one deferred resize
- restart the ticker only if the graph is visible/live
- restore pointer/wheel input

### 4. Cap Huge Canvas Backing Stores

Even when the graph is focused and live, a maximized 4K pane should not blindly allocate a
device-pixel-ratio backing store if that hurts interaction.

Add a renderer resolution policy:

```ts
resolution = min(devicePixelRatio, sqrt(maxBackingPixels / (cssWidth * cssHeight)))
```

The exact cap should be measured, but a starting guardrail is 8-12 million backing pixels per live
workflow graph pane. This keeps a 4K/fullscreen graph from becoming a massive continuous GPU load.

The visual tradeoff is acceptable for giant live panes, and frozen overview snapshots should still
look stable because they are scaled textures.

### 5. Tighten Terminal Snapshot Behavior

For terminal panes:

- prewarm a bitmap texture while idle
- on movement/overview, show the bitmap texture immediately
- keep queuing terminal output while frozen
- defer xterm fit and backend resize until resume/settled
- drain pending output once after resume

The existing terminal freeze primitives are already close. The main work is making the snapshot
path bitmap-based and proving that live xterm is not mounted or fitting during overview movement.

### 6. Add Focused Performance Harnesses

Add deterministic Electron performance workflows for the exact complaints:

1. `workflow-graph-maximized-4k-overview`
   - viewport: at least `3840x2160`
   - open/focus workflow graph
   - maximize pane
   - enter overview
   - leave overview
   - assert geometry aspect ratio and frame metrics

2. `terminal-maximized-4k-overview`
   - maximized terminal with streaming output
   - enter overview while output is active
   - assert terminal output queues while frozen and drains after resume

3. `workflow-graph-maximized-idle-4k`
   - maximized graph, no input
   - assert renderer frame count/ticker does not advance unnecessarily while idle or frozen
   - record backing-store pixel count

Suggested metrics:

- workspace frame p95/p99/max
- missed 8.33ms and 16.67ms frame budgets
- Pixi renderer resize count
- Pixi ticker frames while frozen
- canvas backing-store pixels
- snapshot capture latency
- stale snapshot usage count
- terminal pending output count while frozen
- terminal fit/resize count while frozen

## Implementation Order

1. Add focused regression tests for maximized overview aspect ratio.
2. Patch the immediate overview maximized geometry bug.
3. Add texture slot state and metrics, initially backed by existing snapshot behavior.
4. Add frozen-frame geometry and convert overview transitions to use it.
5. Move texture capture to idle/background refresh and make transitions use current slots only.
6. Add bitmap capture for terminal/workflow graph texture slots.
7. Add workflow graph freeze controls and pause the Pixi ticker/resize observer work while frozen.
8. Add backing-store pixel cap for maximized workflow graph panes.
9. Add 4K Electron performance workflows and append before/after results under
   `docs/reports/performance/`.

## Success Criteria

- Maximized pane aspect ratio is unchanged between normal and overview endpoints.
- Transition startup does not await any texture capture promise.
- First-frame transition latency is independent of pane surface kind.
- Stale texture fallback is allowed; blocking for fresh texture is not.
- Pending texture capture never delays, restarts, lengthens, or cancels an active animation.
- During overview/movement, live workflow graph canvas count is zero or explicitly frozen.
- Pixi ticker frame count does not advance while the graph surface is frozen.
- Renderer resize count during overview animation is zero.
- Terminal fit/resize count during overview animation is zero.
- 4K maximized overview p95 frame time is under 8.33ms on a 120Hz machine or under 16.67ms on a
  60Hz machine, with no long tasks.
- The settled focused pane resumes once and receives exactly one final viewport resize.

## Risks and Tradeoffs

- Capturing a fresh bitmap can itself be expensive. The coordinator should prefer already-warmed
  textures and never block animation startup waiting for a capture.
- Stale textures can briefly show content from before the latest scroll/camera/output update. This
  is acceptable during motion; refresh the texture after the live pane settles.
- Parking React roots preserves state but can keep background work alive. Workflow graph likely
  needs a dedicated runtime adapter instead of a generic React DOM adapter.
- Lowering canvas backing-store resolution can reduce crispness on huge monitors. Use a pixel cap
  only for large live canvases, and measure before choosing the final cap.
- Destroying Pixi on every overview transition would be too expensive. Prefer pausing and
  snapshotting over teardown/recreate.

## Validation Notes

Run narrow tests first:

```bash
pnpm -C desktop exec vitest run src/renderer/src/workspace-layout/layout-engine.test.ts src/renderer/src/workspace-layout/presentation-engine.test.ts src/renderer/src/workspace-layout/runtime-policy.test.ts
```

Then run targeted Electron performance harnesses with `--skip-build` after a fresh desktop build.
Only run the full quality gate once the implementation is stable and ready to merge.
