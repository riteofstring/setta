# Niri Workspace Large-Monitor Performance Plan

Date: 2026-06-18

## Goal

Make the workspace feel immediate on large desktop monitors. The target behavior is:

- Arrow-key niri navigation animates only the pane shells. Pane contents are visually frozen and look identical to their last live state.
- Pane splitter resize does not relayout or rerender pane contents during pointer movement. The user should see a lightweight preview, then one final layout commit on pointer-up.
- Chat transcript scrolling keeps the rendered DOM close to the visible rows, with only a small buffer above and below the viewport.
- Canvas, terminal, browser, git graph, and heavy DOM panes do no hidden work while they are supposed to be frozen.

This document describes what is currently happening before implementation changes.

## Current Frame Path

The workspace is already organized around a good shell/content split:

```txt
input
-> WorkspaceLayoutStore
-> WorkspaceLikeLayoutEngine
-> FrameScheduler
-> PaneRuntimePolicy
-> PresentationEngine
-> SurfaceRegistry / SurfaceAdapter
```

Key files:

- `desktop/src/renderer/src/workspace-layout/frame-scheduler.ts`
- `desktop/src/renderer/src/workspace-layout/runtime-policy.ts`
- `desktop/src/renderer/src/workspace-layout/presentation-engine.ts`
- `desktop/src/renderer/src/workspace-layout/surface-registry.ts`
- `desktop/src/renderer/src/workspace-layout/runtime-mode-options.ts`

`FrameScheduler` runs continuously with `requestAnimationFrame`. Each frame samples the stage viewport, advances scroll/overview animation, builds pane render items, applies runtime policy, and lets `PresentationEngine` write host transforms, sizes, opacity, z-index, pane chrome, and surface lifecycle changes.

That architecture is the right place to make niri movement cheap. The problem is that the production workspace mode currently does not use all of the freezing behavior that the benchmark mode uses.

## Current Movement Behavior

The benchmark scene enables movement degradation:

```ts
benchmark: {
  degradeDuringMovement: true,
  degradeOverview: true,
}
```

The real workspace mode disables it:

```ts
workspace: {
  degradeDuringMovement: false,
  degradeOverview: true,
}
```

That means the earlier performance reports prove the benchmark path can freeze or snapshot many surfaces during movement, but they do not prove the real workspace does this while the user navigates real panes.

Observed consequence:

- Real workspace arrow navigation can keep chat, workflow graph, terminal, browser proxies, git graph, and other pane contents live during the shell animation.
- This directly matches the sluggish large-monitor symptom. Larger monitors mean larger live panes, more pixels, more layout/paint, and more expensive inner surface work during each frame.

## Current Pane Resize Behavior

There are two different resize paths:

1. Window/stage resize.
2. Pane splitter resize.

The existing Phase 6.5 reports in `docs/reports/performance/niri-phase-performance.jsonl` cover active window resize. That path is tracked by `ResizePhaseTracker`, which samples stage viewport size and lets `SurfaceRegistry` defer heavy viewport writes until settle.

Pane splitter resize is different. `WorkspaceLayoutArea` calls `applyPaneResizePointerMove(...)` on every pointer move. That function mutates column width or pane split weights immediately, then `WorkspaceLayoutStore` notifies subscribers:

- `desktop/src/renderer/src/workspace-layout/WorkspaceLayoutArea.tsx`
- `desktop/src/renderer/src/workspace-layout/pane-resize-session.ts`
- `desktop/src/renderer/src/workspace-layout/layout-store.ts`

Because the stage viewport does not change during pane splitter resize, `ResizePhaseTracker` stays idle. So the existing resize deferral policy does not apply to pane splitter dragging.

Observed consequence:

- Pane splitter drag performs real layout updates continuously.
- `PresentationEngine` writes changing host widths/heights continuously.
- Surface adapters receive changing viewports as ordinary frame updates.
- xterm can fit and schedule backend resize repeatedly.
- canvas/git/browser/chat surfaces can relayout or repaint while the user is still dragging.

This conflicts with the desired behavior. Pane splitter resize should preview during drag and commit exactly once when the pointer is released.

## Current Surface Freezing Risks

### DOM and chat

`chat-dom` is classified as heavy DOM, but movement degradation is disabled in workspace mode. Chat is therefore live during normal workspace movement.

`ChatTranscript` already uses `react-virtuoso`, which is the right basic strategy. Current settings:

- `increaseViewportBy={{ bottom: 800, top: 400 }}`
- `overscan={200}`
- `initialItemCount={Math.min(timeline.length, 30)}`

Risks:

- The buffer is fixed in pixels, so very tall windows can render more rows than intended.
- `transcriptTimelineRows(...)` and timestamp grouping scan full transcript-shaped arrays when their inputs change.
- `useChatViewState()` subscribes to many store slices and derives some arrays during render.
- Visible rows receive large map objects as props, so store identity changes can rerender more visible row content than expected.

### Workflow graph canvas

The workflow graph surface uses a React DOM adapter around a Pixi renderer. The Pixi renderer has its own ticker and `ResizeObserver`:

- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.js`

Workspace movement currently does not freeze it. If movement freezing is enabled later, we still need to verify the inner Pixi ticker actually pauses when the outer surface is parked or snapshotted. The React adapter can detach the container without destroying the React root, so visual replacement with a snapshot is not by itself proof that the inner renderer stopped doing work.

### Terminal

The terminal adapter uses xterm and has explicit `freeze` state, but terminal output handling does not check `frozen` before writing if the terminal remains mounted. In the normal snapshot path the adapter may be unmounted, but `live-throttled` or missed policy cases can leave a frozen terminal mounted and still processing output.

Pane splitter resize currently calls terminal viewport updates as normal frame work, so `fitAndResize()` can run while dragging.

### Browser panes

Browser panes are Electron native views controlled through `BrowserSurfaceProxyAdapter` and `NativeViewBoundsBatcher`.

The browser adapter stays mounted for `snapshot` runtime state so it can display a browser snapshot image in the renderer. It also queues native updates in `syncFrame()`. We need cumulative counters to prove hidden/snapshot browser panes are not sending unnecessary native IPC during movement.

### Git graph

`git-graph` currently returns live from runtime policy. Its viewport work is deferred during active window resize, but it is not degraded during movement. If git graph panes are visible on large monitors, they can keep canvas/DOM painting active during navigation.

## Snapshot Cost Risk

Snapshots are necessary for the target behavior, but capturing snapshots at the wrong time can cause the hitch we are trying to remove.

Current behavior includes clone or bitmap capture paths in `SnapshotSurfaceAdapter`. If workspace movement degradation is simply enabled, the first movement frame may pay snapshot capture cost for live DOM surfaces unless cached snapshots are already available.

Target behavior:

- Refresh visual snapshots only in idle or settled phases.
- Never clone DOM or capture large bitmaps in the first active navigation frame.
- Allow static fallback only as an explicit degraded state, not as accidental blank content.
- Track snapshot capture count, duration, and pixel area.

## Why Large Monitors Are Worse

The current benchmark reports mostly use a viewport around `1060x820`. That is not representative of wide desktop layouts.

Large desktop monitors amplify several costs:

- More pane area means larger layout, paint, bitmap capture, browser view bounds, and canvas resize costs.
- Tall chat panes can cause more virtualized rows to be mounted.
- High-DPI displays multiply canvas and bitmap memory.
- Wider visible workspace can keep more live heavy surfaces in the first viewport.
- Pane splitter drag changes large element sizes every pointer move.

We need a large-monitor performance matrix before and after changes.

Suggested baseline viewports:

- `1920x1080` at DPR 1 and DPR 2
- `2560x1440` at DPR 1 and DPR 2
- `3440x1440` at DPR 1
- `3840x2160` at DPR 1 and DPR 2, if practical

## Implementation Direction

### Phase 0: Baseline real workspace behavior

Add or extend a production Electron performance workflow that opens a real workspace, not just the benchmark scene.

Measure:

- Arrow-key navigation across chat, workflow graph, terminal, browser, git graph, and settings panes.
- Pane splitter drag.
- Chat transcript scroll with a large selected conversation.
- Streaming chat output while pinned to bottom.
- Overview enter/exit if affected.

Counters to add:

- React commits during movement and pane resize.
- Surface adapter switches during movement.
- React root mount/unmount count during movement.
- Snapshot clone/bitmap capture count, total milliseconds, and total pixel area.
- Pixi rendered frame count while the outer surface is frozen or snapshotted.
- Terminal fit count, output write count, backend resize count while frozen or during pane resize.
- Browser native update batch count and changed update count while snapshot/hidden.
- Chat transcript rendered row count, mounted message row count, and visible range.
- Pane splitter pointer move count versus layout store notify count.

Record baseline under `docs/reports/performance/`.

### Phase 1: Make pane splitter resize commit-on-release

Replace live pane splitter resize with a preview session:

- On pointer down, capture the resize target and starting layout.
- On pointer move, update a lightweight overlay or opaque guide only.
- Do not mutate `WorkspaceLayoutStore`.
- Do not call `persistLayout()`.
- Do not deliver surface viewport updates.
- On pointer up, compute the final width/weights and apply a single layout action.
- On cancel, discard the preview.

This should be the first implementation target because it directly addresses the sluggish resize symptom and has a clear success condition: pointer movement should produce zero layout store notifications until commit.

### Phase 2: Enable workspace movement freezing safely

Turn the target behavior into an explicit policy for real workspace mode:

- During navigation/overview movement, animate shell transforms only.
- Freeze or snapshot all pane contents, including focused content, so the visual state is stable during the animation.
- Resume live content once movement settles.
- Preserve focus semantics so the final focused pane receives input after the animation.

Do not simply flip `degradeDuringMovement` to true without snapshot scheduling. First make sure snapshots are warmed during idle or that static fallback is an explicit acceptable fallback.

### Phase 3: Pause inner renderers, not only outer adapters

Add explicit pause/resume hooks where the outer adapter cannot guarantee inner work stops:

- Workflow graph Pixi ticker and resize observer.
- Git graph paint loop and worker progress if the pane is frozen.
- Terminal fit/write/resize work while frozen or not visible.
- Browser native update queue while hidden or snapshot state is unchanged.

The success condition is that debug counters stay flat while the surface is frozen.

### Phase 4: Tighten chat virtualization

Keep `react-virtuoso`, but make the mounted row budget explicit:

- Reduce fixed overscan and viewport expansion to the smallest buffer that preserves smooth scroll.
- Prefer viewport-derived buffers over large fixed pixel buffers.
- Add a test or Electron probe that asserts mounted chat rows stay bounded for large transcript fixtures.
- Avoid full transcript-derived recomputation on every streaming chunk where possible.
- Avoid passing broad map objects into every visible row if narrower row-level inputs are enough.

### Phase 5: Large-monitor gates

Promote the large-monitor probes into repeatable checks for future workspace performance work.

Pass criteria should include:

- p95 frame time at or below 8.33 ms for shell navigation where practical.
- zero React commits during movement.
- zero pane splitter store notifications during pointer movement before commit.
- bounded chat row DOM count.
- no active Pixi/xterm/git/browser work while frozen unless explicitly allowed.
- one final pane resize commit after pointer-up.

## Verification Notes

Changes to chat behavior, renderer chat state, transcript UI, run lifecycle, queueing, steering, approvals, event streaming, or IPC/preload contracts require deterministic end-to-end app workflow tests through production Electron/main/preload/renderer/HTTP/store paths.

Live Codex E2E tests are required for touched chat workflow/provider behavior when local ChatGPT auth is available. If unavailable, record the skip explicitly and do not treat it as provider coverage.

Before source changes are committed, run:

```sh
./scripts/format.sh
./check_quality.sh --all
```

For this document-only change, no automated gate is required beyond diff inspection.
