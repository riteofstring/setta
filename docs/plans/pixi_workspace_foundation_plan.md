# Pixi Workspace Foundation Plan

**Date:** June 3, 2026  
**Scope:** Foundational Pixi workspace prototype for a pannable, zoomable, animated node/edge canvas.

## Goal

Lay the technical foundation for a high-performance PixiJS workspace inside the Electron renderer.

The first version should prove:

- Full-window Pixi workspace rendering behind a temporary feature flag.
- Smooth trackpad and mouse pan/zoom.
- Hard-coded starter nodes and edges.
- Dragging existing nodes.
- Drawing new edges between existing nodes.
- Basic selection, hover, and temporary interaction overlays.
- A path for colorful, fluid canvas-native animation.

Node creation is intentionally out of scope for this phase. There should be no context menu creation flow and no palette/toolbar drag-to-create flow yet.

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

## Feature Flag

Add a temporary renderer-side flag that switches the app into Pixi workspace prototype mode.

When enabled:

- The Electron renderer should mount only the Pixi workspace.
- Existing project, chat, right, and bottom panes should not render.
- The prototype should still run through the normal Electron renderer/preload environment.

Recommended shape:

```ts
const pixiWorkspacePrototypeEnabled = import.meta.env.VITE_PIXI_WORKSPACE_PROTOTYPE === "1";
```

Use the flag near the top-level app render boundary so the prototype remains decoupled from pane and chat lifecycle.

## Dependencies

Add the minimum Pixi stack:

```text
pixi.js
pixi-viewport
```

The repository requires exact dependency versions. Do not use floating ranges. If lockfile changes are needed, use the repository dependency update workflow.

Avoid `@pixi/react` for the first foundation slice. React should mount and unmount the workspace host element, but the Pixi application, viewport, scene graph, ticker, and interaction handlers should be owned imperatively by workspace code.

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

Do not put pan, zoom, pointer move, temporary edge drawing, or animation ticks through React state.

The hot path should be imperative:

- `pixi-viewport` owns camera movement during pan/zoom.
- Pixi pointer events drive hover, drag, and edge drawing.
- Pixi ticker drives animated visuals.
- React receives only coarse events if needed.

## Graph Model

Use a small hard-coded graph fixture as the source of truth for the prototype.

Suggested starter model:

```ts
type Vec2 = {
  x: number;
  y: number;
};

type WorkspaceNode = {
  id: string;
  label: string;
  position: Vec2;
  size: {
    width: number;
    height: number;
  };
  color: string;
};

type WorkspaceEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
};

type WorkspaceGraph = {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
};
```

Keep Pixi display objects separate from the graph model. Pixi objects may cache IDs, but they should not become the authoritative representation of nodes and edges.

## Initial Interactions

### Pan and Zoom

Support:

- Two-finger trackpad pan.
- Trackpad pinch zoom where Chromium/Electron exposes it.
- Mouse wheel zoom.
- Optional mouse drag pan when interacting with empty workspace space.

Pan/zoom should not trigger React renders.

### Node Dragging

Support dragging hard-coded nodes.

During drag:

- Update node position in the prototype graph/controller state.
- Update connected edge visuals.
- Keep movement smooth without React state updates.

### Edge Drawing

Support drawing edges between existing nodes.

Recommended first behavior:

- Each node has simple visible connection handles or ports.
- Pointer down on a source port starts a temporary edge.
- Pointer move updates the temporary edge endpoint.
- Pointer up on a valid target port commits a new edge.
- Pointer up elsewhere cancels the temporary edge.

Keep temporary edge rendering in the interaction layer.

### Selection and Hover

Add simple visual feedback:

- Node hover outline.
- Selected node outline.
- Edge hover or active styling if straightforward.
- Temporary edge highlight while drawing.

## Visual Foundation

Create enough visual richness to prove Pixi is the right rendering layer, without overbuilding product design.

Initial visuals:

- Dark workspace background.
- Subtle grid or spatial reference layer.
- Colored nodes.
- Curved or straight edges.
- Animated background accents or low-cost particles.
- Lightweight pulses/glows on selected or connected elements.

Avoid expensive filters on large containers until profiling supports them.

## Performance Rules

The prototype should establish these constraints from the beginning:

- No React state updates in pan/zoom, pointer move, animation, or temporary edge drawing hot paths.
- No DOM node per workspace node or edge.
- No full Pixi scene rebuild on every interaction.
- Reuse Pixi objects when practical.
- Keep layers explicit so later culling and batching are straightforward.
- Do not add polling.

For the first slice, `Graphics` objects are acceptable for nodes and edges. Later optimization can move repeated node visuals to textures/sprites and dense edges to batching or mesh-based rendering.

## Verification

Focused checks for the first implementation:

- Typecheck the desktop package.
- Run renderer/unit tests relevant to changed code.
- Run an Electron smoke workflow that launches the app with the Pixi flag enabled and verifies the canvas mounts.
- Manually verify trackpad pan and pinch zoom on a Mac trackpad.

Because this feature is performance-sensitive, add a short append-only report under `docs/reports/performance/` when meaningful baseline measurements are collected. The first report can be lightweight, but should record:

- Scenario tested.
- Approximate graph size.
- Device/environment.
- Measured or observed pan/zoom behavior.
- Any known bottlenecks.

This change should not require chat workflow E2E tests unless chat, run lifecycle, provider handling, IPC contracts, streaming, or transcript behavior are touched.

## Implementation Phases

### Phase 1: Isolated Canvas Prototype

- Add exact Pixi dependencies.
- Add the full-window prototype flag.
- Mount a Pixi application into a React host component.
- Add `pixi-viewport`.
- Render hard-coded nodes, edges, and a background grid.
- Verify canvas sizing and cleanup on unmount.

### Phase 2: Core Interactions

- Add trackpad/mouse pan and zoom.
- Add node hover and selection.
- Add node dragging.
- Redraw connected edges during drag.
- Add port-to-port temporary edge drawing.
- Commit edges between existing nodes.

### Phase 3: Visual Motion

- Add low-cost animated background or particle accents.
- Add selection/edge pulse animation.
- Confirm animations do not affect pan/zoom responsiveness.

### Phase 4: Guardrails

- Add focused tests for pure graph/controller helpers.
- Add Electron canvas-mount smoke coverage for prototype mode.
- Add manual or automated performance notes.
- Record any trackpad-specific behavior or limitations.

## Future Work

After the foundation is proven, evaluate node creation separately.

Likely options:

- Command palette creates a node at the viewport center or last pointer location.
- Toolbar item drag creates a node at the drop location.
- Inspector or side panel edits selected node properties.

Those flows should be layered on top of the graph/controller boundary rather than embedded directly in Pixi rendering code.
