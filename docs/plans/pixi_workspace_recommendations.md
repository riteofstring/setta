# PixiJS Workspace Recommendations

**Date:** June 3, 2026  
**Context:** Interactive frontend workspace with pan/zoom, draggable nodes, edge drawing, labels, colorful fluid animations, physics-inspired motion, and no DOM requirement inside the workspace canvas.

## Executive Recommendation

Use **PixiJS v8 + pixi-viewport** as the core rendering stack.

PixiJS is the best fit because the workspace is primarily a high-performance **2D interactive scene**, not a conventional DOM/SVG editor and not yet a true 3D spatial environment. Pixi gives you a GPU-accelerated scene graph, sprites, vector-like graphics, filters, pointer interaction, text rendering, particles, and animation-friendly objects without needing to build directly on raw Canvas, WebGL, or WebGPU.

Recommended default stack:

```text
pixi.js
pixi-viewport
@pixi/react, if the app is React-based
GSAP and/or custom spring animation utilities
d3-force for organic graph physics/layout
ELK.js or Dagre for structured graph layout
RBush, quadtree, or a custom spatial index for hit testing and culling
Zustand, Redux, Jotai, Valtio, or equivalent for editor state
```

## Why Pixi Instead of DOM/SVG

DOM/SVG tools are strong for conventional node editors, forms, accessibility-first workflows, and business-process diagrams. They are less ideal for a workspace whose main differentiators are fluid animation, particles, glows, elastic motion, fast rendering, and custom canvas-native visuals.

Use Pixi because the workspace needs:

- A single canvas-based scene rather than thousands of DOM nodes.
- Smooth pan/zoom and drag behavior.
- Custom rendering of nodes, ports, edges, particles, shadows, glows, and animated effects.
- Text display without in-canvas DOM editing.
- A game-like or creative-tool-like interaction model.

The rest of the application can still use DOM/React normally: toolbars, inspectors, panels, menus, modals, command palettes, search, and settings should remain regular UI.

## Core Rendering Architecture

Mount a single canvas in the DOM, then manage the workspace contents as a Pixi scene.

```text
DOM / React app shell
└── Pixi canvas mount
    └── Pixi Application
        └── pixi-viewport camera/world
            ├── background layer
            │   └── grid, ambience, parallax, decorative effects
            ├── edge layer
            │   └── committed edges
            ├── node layer
            │   └── node containers, ports, labels
            ├── interaction layer
            │   └── temporary edge, selection marquee, hover outlines
            └── effects layer
                └── particles, pulses, shockwaves, glows, transitions
```

Keep layers explicit. This makes rendering order, hit testing, culling, and performance tuning much easier.

## State Architecture

Do **not** make Pixi objects the source of truth.

The authoritative model should live outside Pixi:

```ts
type Vec3 = {
  x: number
  y: number
  z: number // default 0; useful for future 2.5D/3D compatibility
}

type NodeModel = {
  id: string
  position: Vec3
  size: {
    width: number
    height: number
    depth?: number
  }
  label: string
  color?: string
  ports?: PortModel[]
}

type EdgeModel = {
  id: string
  sourceNodeId: string
  sourcePortId?: string
  targetNodeId: string
  targetPortId?: string
  kind: 'straight' | 'bezier' | 'orthogonal'
}

type GraphModel = {
  nodes: Record<string, NodeModel>
  edges: Record<string, EdgeModel>
}
```

Pixi should be a rendering projection of this model:

```text
Graph model -> renderer diff/update -> Pixi containers/graphics/text
```

Avoid this:

```text
Pixi container position is the saved node position
Pixi object identity is the app identity
Selection state is inferred from Pixi objects
Business rules live inside Pixi event handlers
```

Prefer this:

```text
Graph model owns positions and relationships
Controller owns interaction state
Renderer reflects model state
Pixi events dispatch controller actions
```

## Suggested Renderer Boundary

Create a narrow workspace renderer interface. It does not need to be perfectly generic, but it should prevent Pixi-specific details from leaking into business logic.

```ts
interface WorkspaceRenderer {
  mount(container: HTMLElement): void
  unmount(): void

  setGraph(graph: GraphModel): void
  setSelection(selection: SelectionState): void
  setCamera(camera: CameraState): void
  setInteraction(interaction: InteractionState): void

  screenToWorld(point: Vec2): Vec3
  worldToScreen(point: Vec3): Vec2
  hitTest(screenPoint: Vec2): HitResult | null
}
```

The interaction controller should operate in renderer-independent terms:

```text
Idle
Panning
DraggingNode
DrawingEdge
BoxSelecting
TransformingSelection
```

Pixi events should dispatch actions into this controller rather than directly performing product logic.

## Viewport, Pan, and Zoom

Use **pixi-viewport** for the initial camera/infinite-canvas implementation.

It provides common workspace behaviors such as:

- Drag-to-pan.
- Pinch zoom.
- Mouse wheel zoom.
- Decelerated movement.
- Follow target.
- Snapping.
- Clamping.
- Bouncing at edges.

Start with pixi-viewport rather than writing your own camera. You can replace or wrap it later if your interaction model becomes highly custom.

Recommended camera state:

```ts
type CameraState = {
  x: number
  y: number
  zoom: number
  mode: 'topDown2D' | 'visual2_5D'
}
```

Keep this app-level camera state separate from pixi-viewport internals so that persistence, collaboration, undo/redo, minimaps, and future renderer changes are easier.

## Nodes

Represent each node as a Pixi `Container` with sub-elements:

```text
Node Container
├── background shape
├── border / highlight
├── label text
├── ports
├── badges / icons
└── optional effects
```

Use Pixi `Graphics` for early prototypes and moderate graph sizes. If rendering becomes a bottleneck, move repeated node visuals to textures, sprites, nine-slice sprites, or custom batched geometry.

Node interaction guidelines:

- Use larger invisible hit areas for small ports and handles.
- Separate visual hover state from logical selection state.
- Keep drag state in the controller, not inside Pixi containers.
- During drag, update the model or a transient interaction overlay, then render from state.
- Use a spatial index for large node counts.

## Edges

For small to medium graphs, draw edges using Pixi `Graphics`:

```text
straight lines
quadratic/cubic Bézier curves
orthogonal paths
arrow/wide strokes
hover strokes
animated glow overlays
arrowheads
```

For larger graphs, avoid one heavy `Graphics` object per edge if performance drops. Consider:

- Batching static edges into shared geometry.
- Separating animated/hover/selected edges into overlay layers.
- Culling edges whose bounding boxes are outside the viewport.
- Using simplified edge rendering while zoomed out.
- Rendering dense background edges differently from active foreground edges.

Temporary edge drawing should live in the interaction layer:

```text
pointer down on source port
-> create temporary edge
-> update endpoint on pointer move
-> hit-test compatible target on pointer up
-> commit EdgeModel if valid
```

## Text

Use Pixi text rendering rather than DOM labels inside the workspace.

Recommended approach:

- Use `Text` for high-quality labels that do not change every frame.
- Use `BitmapText` for many labels or frequently changing labels.
- Avoid `HTMLText` for this workspace because the requirement is no DOM-based content inside the canvas area.

Text editing is not needed, so keep label editing in an external DOM inspector, modal, side panel, or command palette if users need to rename nodes later.

## Animation

Use a combination of:

```text
GSAP for choreographed/timeline animations
custom spring utilities for elastic UI physics
d3-force for graph-like physical layout motion
Pixi ticker for frame updates
```

Good Pixi animation targets:

```text
container.x / container.y
container.scale
container.alpha
graphics tint/color-like properties
filter uniforms
particle positions
edge control points
selection outlines
hover halos
```

For physics-inspired elasticity, start with lightweight custom springs rather than a full physics engine.

Use a real physics engine only if you need actual collision constraints, rigid bodies, joints, or deterministic simulation. For a node editor, springs plus collision avoidance are usually enough.

## Layout and Physics

Use separate layout systems from rendering:

```text
d3-force: organic force-directed layouts, spring-like graph motion, collision avoidance
ELK.js: structured directed diagrams, ports, layered layouts
Dagre: simpler directed graph layouts
custom springs: micro-interactions, drag elasticity, snap-back, hover elevation
```

Layout engines should update the graph model. Pixi should only render the result.

## 2.5D Guidance

Pixi is still the right choice if 2.5D means **visual depth**:

```text
cards rise on hover
nodes tilt slightly during drag
parallax background layers
fake perspective grid
isometric-like layout
drop shadows and glows
depth-based scale/opacity/blur
particles at different apparent depths
```

In that case, treat `z` as a visual rendering hint:

```ts
function project2_5D(p: Vec3, camera: CameraState) {
  return {
    x: (p.x - camera.x) * camera.zoom + p.z * 0.15,
    y: (p.y - camera.y) * camera.zoom - p.z * 0.25,
    scale: camera.zoom * (1 + p.z * 0.01),
  }
}
```

Use Three.js instead if 2.5D becomes **navigation or manipulation**:

```text
camera tilt/orbit matters
objects have meaningful depth
users drag objects between depth layers
edges route through 3D space
occlusion matters
lighting/shadows are product features
users manipulate 3D objects directly
```

The rule of thumb:

```text
2.5D as style -> Pixi
2.5D as spatial interaction -> Three.js
```

## Future 3D Guardrails

Starting with Pixi does not block future 3D, but a true move to 3D navigation/manipulation will require rewriting the renderer and much of the interaction math.

Design now so that these can survive a future renderer change:

```text
graph model
node and edge IDs
positions, including z even if default 0
ports and connection rules
selection state
undo/redo commands
keyboard shortcuts
layout algorithms
physics parameters
persistence format
collaboration protocol
business logic
```

Expect these Pixi-specific pieces to be replaced if you move to Three later:

```text
Pixi containers
Pixi graphics drawing code
Pixi text objects
Pixi filters
Pixi hit areas
pixi-viewport camera implementation
Pixi event handlers
Pixi-specific render layering
```

A future Three.js layer can also be mixed in for limited 3D features, such as 3D previews or backgrounds, without rewriting the full Pixi workspace immediately. Treat that as an integration path, not a substitute for a true Three-based workspace if 3D becomes central.

## Performance Guidelines

Start simple, then optimize when profiling shows a real bottleneck.

Initial implementation:

```text
Pixi Containers for nodes
Pixi Graphics for node backgrounds and edges
Pixi Text for labels
pixi-viewport for pan/zoom
simple culling based on viewport bounds
```

Likely later optimizations:

```text
convert repeated node visuals to textures/sprites
use BitmapText for many labels
batch or mesh-render many edges
separate static and animated layers
cache expensive containers when static
hide labels at low zoom
simplify edges at low zoom
use spatial indexing for hit testing
avoid updating every Pixi object every frame
reuse objects instead of constantly creating/destroying them
```

Watch for:

```text
too many independent Graphics objects
frequent text re-rendering
unbounded particles
filters applied to huge containers
large offscreen objects still being updated
layout and rendering coupled in the same frame path
```

## Implementation Phases

### Phase 1: Technical Prototype

Build:

```text
Pixi Application
pixi-viewport pan/zoom
node rendering
node dragging
a few edge types
temporary edge drawing
basic labels
selection state
simple hover/active styling
```

Goal: prove interaction quality and rendering feel.

### Phase 2: Editor Model

Add:

```text
external graph model
renderer adapter boundary
interaction state machine
undo/redo command model
keyboard shortcuts
hit testing strategy
port compatibility rules
viewport persistence
```

Goal: prevent Pixi from becoming the product architecture.

### Phase 3: Visual System

Add:

```text
node themes
edge themes
particles
hover glows
elastic drag motion
spring-based snap behavior
animated edge creation
selection transitions
2.5D visual depth if desired
```

Goal: create the distinctive fluid experience.

### Phase 4: Scale and Polish

Add:

```text
culling
spatial index
edge batching if needed
label optimization
minimap
zoom-level detail rules
performance budgets
profiling instrumentation
```

Goal: keep the workspace smooth as graph size grows.

## Main Risks

### Risk: Pixi-specific logic spreads through the app

Mitigation: keep Pixi behind a renderer boundary and keep interaction logic in a controller.

### Risk: edge rendering becomes expensive

Mitigation: batch static edges, cull offscreen edges, use simplified rendering at low zoom, and isolate animated edges.

### Risk: text becomes a bottleneck

Mitigation: use `BitmapText` where appropriate, reduce label updates, and hide or simplify labels at low zoom.

### Risk: future 3D becomes a product requirement

Mitigation: keep model coordinates 3D-capable, keep camera state abstract, and avoid storing Pixi objects in app state.

## Decision Summary

Use PixiJS when the workspace is fundamentally:

```text
2D
canvas-based
highly animated
colorful
fluid
node/edge oriented
text display only
not DOM-dependent
```

Use Three.js instead only if the workspace becomes fundamentally:

```text
spatial
tiltable/orbitable
occlusion-aware
3D-manipulable
lighting/shadow dependent
object-depth dependent
```

For the current requirements, PixiJS is the right starting point.

## References

- [PixiJS Introduction](https://pixijs.com/8.x/guides/getting-started/intro)
- [PixiJS Events / Interaction](https://pixijs.com/8.x/guides/components/events)
- [PixiJS Text Guide](https://pixijs.com/8.x/guides/components/scene-objects/text)
- [pixi-viewport API Documentation](https://viewport.pixijs.io/jsdoc/index.html)
- [PixiJS + Three.js Mixing Guide](https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi)
- [PixiJS v8.16.0 Update: Experimental Canvas Renderer and Text Improvements](https://pixijs.com/blog/8.16.0)
- [GSAP Documentation](https://gsap.com/docs/v3/)
- [GSAP GitHub: Canvas/WebGL/Generic Object Animation](https://github.com/greensock/GSAP/)
- [d3-force Documentation](https://d3js.org/d3-force)
