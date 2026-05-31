# Pixi Workspace Foundation Plan

**Date:** June 3, 2026  
**Status:** Implemented except physical trackpad hardware verification
**Scope:** Complete the foundational Pixi workspace prototype for a pannable, zoomable, animated node/edge canvas.

## Goal

Finish the first Pixi workspace foundation slice inside the Electron renderer.

The prototype should prove:

- Full-window Pixi workspace rendering behind a temporary runtime flag.
- Smooth mouse and trackpad-oriented pan/zoom.
- Hard-coded starter nodes and edges.
- Dragging existing nodes.
- Drawing new edges between existing nodes.
- Basic selection, hover, and temporary interaction overlays.
- A path for colorful, fluid canvas-native animation.

Node creation is intentionally out of scope. There should be no context menu creation flow, no command-palette creation flow, and no palette/toolbar drag-to-create flow yet.

## Current State

The repository already has the initial Pixi/tooling foundation:

- `pixi.js` and `pixi-viewport` are installed with exact checked-in versions.
- `SETTA_PIXI_WORKSPACE_PROTOTYPE=1` switches the app into full-window Pixi prototype mode.
- `SETTA_PIXI_WORKSPACE_DEBUG=1` enables the Pixi debug snapshot API.
- `desktop/src/renderer/src/components/pixi-workspace-prototype.tsx` mounts the Pixi workspace host.
- `desktop/src/renderer/src/components/pixi-workspace-renderer.js` owns the imperative Pixi application, viewport, scene graph, ticker, and interaction handlers.
- Existing project, chat, right, and bottom panes do not render in prototype mode.
- The prototype renders a dark workspace background, grid, hard-coded nodes, curved edges, ports, labels, selected-node outline, and low-cost glow animation.
- Empty-space pointer drag pans the camera.
- Small pixel wheel deltas pan the camera for trackpad-style two-finger swipes.
- Large notched wheel deltas and Chromium pinch wheel events zoom the camera.
- Existing nodes can be dragged, and connected edges redraw during drag.
- Existing source ports can start temporary edges.
- Releasing a temporary edge on a valid target port commits a new edge.
- Releasing a temporary edge away from a valid target port cancels it.
- Pixi debug snapshots expose canvas, camera, graph, interaction, render, and visual sampling state.
- `./scripts/test_pixi_workspace_visual.sh` launches the built Electron app in prototype mode, captures screenshots, verifies a nonblank canvas, drives pan/zoom, drags a visible node, draws and cancels a temporary edge, commits an edge, and records artifacts.
- Baseline performance notes exist at `docs/reports/performance/pixi-workspace-visual-smoke.md`.

Do not create a second Pixi implementation. Extend the existing prototype path.

## Remaining Foundation Scope

The main missing evidence is physical Mac trackpad hardware verification.

Implemented:

- Port-to-port temporary edge drawing.
- Committing a new edge between existing nodes.
- Cancelling a temporary edge when released away from a valid target port.
- Debug snapshot fields and visual smoke coverage for edge drawing.
- Trackpad limitation notes for pan and pinch behavior.

Still required before claiming full hardware coverage:

- Manual Mac trackpad verification for two-finger pan.
- Manual Mac trackpad verification for pinch zoom where Electron/Chromium exposes it.

Keep the implementation scoped to the prototype. Do not add persistence, backend contracts, chat integration, undo/redo, semantic node types, node creation, deletion, or migrations.

## Non-Goals

- No node creation UI.
- No node deletion UI.
- No persistence.
- No undo/redo.
- No semantic node types.
- No integration with chat behavior.
- No generated backend contracts.
- No DOM labels or DOM content inside the Pixi workspace canvas.
- No migration or compatibility layer for future graph formats.

## Compatibility Policy

Do not add backward compatibility, legacy support, transitional code, migrations, dual-read/write paths, compatibility shims, or old-field aliases for this prototype. The foundation should use the intended new model and runtime shape directly.

## Runtime Flags

Prototype mode is controlled at runtime through preload-exposed app flags:

```text
SETTA_PIXI_WORKSPACE_PROTOTYPE=1
SETTA_PIXI_WORKSPACE_DEBUG=1
```

Do not switch this to a Vite build-time flag. The visual tooling needs to toggle prototype mode against the built Electron app without producing a separate build.

## Architecture

Use React as the lifecycle shell only:

```text
React component
└── DOM host div
    └── Pixi Application canvas
        └── pixi-viewport
            ├── background layer
            ├── edge layer
            ├── node layer
            ├── interaction layer
            └── effects layer
```

Do not put pan, zoom, pointer move, node drag, temporary edge drawing, or animation ticks through React state.

The hot path should stay imperative:

- `pixi-viewport` owns camera movement during pan/zoom.
- Pixi pointer events drive hover, drag, selection, and edge drawing.
- Pixi ticker drives animated visuals.
- React receives no high-frequency interaction updates.

## Graph Model

Use the existing hard-coded graph fixture as the prototype source of truth.

The current model shape is file-local in `pixi-workspace-renderer.js`:

```ts
type WorkspaceNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
};

type WorkspaceEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
};
```

Keep Pixi display objects separate from this model. Pixi objects may cache IDs, but they should not become the authoritative representation of nodes and edges.

For edge drawing, it is acceptable to extend the model with port IDs if that reduces ambiguity:

```ts
type WorkspaceEdge = {
  id: string;
  sourceNodeId: string;
  sourcePortId?: string;
  targetNodeId: string;
  targetPortId?: string;
};
```

Do not add a persistence format yet.

## Required Interactions

### Pan and Zoom

Already implemented enough for automated smoke coverage:

- Mouse drag pan on empty workspace space.
- Mouse wheel zoom.
- Trackpad-style pixel wheel pan.
- No React renders in the pan/zoom hot path.

Still required:

- Manual verification on a Mac trackpad for two-finger pan.
- Manual verification on a Mac trackpad for pinch zoom where Electron/Chromium exposes it.
- Record any trackpad-specific limitation in the implementation notes or performance report.

### Node Dragging

Already implemented:

- Existing hard-coded nodes can be dragged.
- Node positions update in prototype graph/controller state.
- Connected edge visuals redraw during drag.
- Drag updates do not go through React state.

Maintain this behavior while adding edge drawing.

### Edge Drawing

Implemented in the Pixi prototype path and covered by the visual smoke workflow.

Required behavior:

- Each node has visible connection handles or ports.
- Pointer down on a source port starts a temporary edge.
- Pointer move updates the temporary edge endpoint in the interaction layer.
- Pointer up on a valid target port commits a new edge to the prototype graph.
- Pointer up elsewhere cancels the temporary edge.
- Temporary edge drawing should not pan the viewport.
- Temporary edge drawing should not trigger React renders.
- Connected edge rendering should update after a committed edge.

Recommended controller state:

```ts
type EdgeDrawingState = {
  sourceNodeId: string;
  sourcePortId?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};
```

Add edge drawing details to the debug snapshot:

```ts
interaction: {
  selectedNodeId: string | null;
  drawingEdge: boolean;
};
graph: {
  nodeCount: number;
  edgeCount: number;
  nodes: ...;
  edges?: Array<{ id: string; sourceNodeId: string; targetNodeId: string }>;
};
```

### Selection and Hover

Already implemented:

- Node hover outline.
- Selected node outline.

Still useful if straightforward:

- Edge hover or active styling.
- Temporary edge highlight while drawing.

## Visual Foundation

Already implemented:

- Dark workspace background.
- Grid.
- Colored nodes.
- Curved edges.
- Lightweight glow/pulse animation.

Maintain these visuals. Do not add expensive filters on large containers unless profiling supports them.

## Performance Rules

Keep these constraints:

- No React state updates in pan/zoom, pointer move, animation, node drag, or temporary edge drawing hot paths.
- No DOM node per workspace node or edge.
- No full Pixi scene rebuild on every interaction.
- Reuse Pixi objects where practical.
- Keep layers explicit so later culling and batching are straightforward.
- Do not add polling.

For this prototype, Pixi `Graphics` objects are acceptable for nodes and edges. Later optimization can move repeated node visuals to textures/sprites and dense edges to batching or mesh-based rendering.

## Verification

After implementation, run:

```sh
pnpm -C desktop typecheck
pnpm -C desktop test
pnpm -C desktop build
./scripts/test_pixi_workspace_visual.sh --skip-build --keep-artifacts
./scripts/format.sh
./check_quality.sh --all
```

For dependency manifest or lockfile changes, also run:

```sh
./scripts/check_supply_chain.sh
```

The Pixi visual smoke workflow should be extended to cover edge drawing:

- Launch prototype mode.
- Verify a nonblank canvas.
- Drive pan and zoom.
- Drag one visible node.
- Drag from one visible port to another visible port.
- Assert `edgeCount` increases.
- Capture screenshots and summary artifacts.

Manual verification:

- Test two-finger pan on a Mac trackpad.
- Test pinch zoom on a Mac trackpad.
- Record the outcome and any limitation under `docs/reports/performance/` or in implementation notes.

This work should not require chat workflow E2E tests unless chat, run lifecycle, provider handling, IPC contracts, streaming, or transcript behavior are touched. `./check_quality.sh --all` will still run deterministic chat workflows as part of the broad gate.

## Implementation Phases

### Phase 1: Edge Drawing State

Completed.

- Add edge drawing state to the Pixi renderer/controller.
- Separate node-body dragging from port edge drawing.
- Pause viewport drag while drawing a temporary edge.

### Phase 2: Temporary Edge Rendering

Completed.

- Render the temporary edge in the interaction layer.
- Update its endpoint on pointer move.
- Show clear visual feedback while drawing.
- Cancel cleanly on invalid release.

### Phase 3: Edge Commit

Completed.

- Hit-test valid target ports.
- Commit a new `WorkspaceEdge`.
- Redraw committed edges.
- Update debug snapshot `edgeCount`.

### Phase 4: Visual Smoke Coverage

Completed.

- Extend `desktop/tests/electron/pixi-workspace-smoke.test.mjs` with port-to-port edge drawing automation.
- Assert the committed edge count increases.
- Save before/after snapshots and screenshots.

### Phase 5: Trackpad Notes

Limitation documented; physical hardware verification remains.

- Manually verify Mac trackpad pan/pinch.
- Record pass/fail results and limitations.

## Future Work

After the foundation is proven, evaluate node creation separately.

Likely options:

- Command palette creates a node at the viewport center or last pointer location.
- Toolbar item drag creates a node at the drop location.
- Inspector or side panel edits selected node properties.

Those flows should be layered on top of the graph/controller boundary rather than embedded directly in Pixi rendering code.
