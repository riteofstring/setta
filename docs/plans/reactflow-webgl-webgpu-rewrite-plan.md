# ReactFlow Ground-Up WebGL/WebGPU Rewrite Plan

## Decision
This is a full canvas-engine rewrite, not an optimization pass on the current ReactFlow stack.

We will replace the ReactFlow/XYFlow runtime for canvas rendering and interaction with a new GPU-first engine, then remove the legacy runtime from the active code path.

## Scope
- In scope:
  - Entire canvas runtime used by `UIPage`:
    - scene rendering
    - section and edge geometry
    - pan/zoom
    - selection
    - drag/resize
    - edge connect/reconnect
    - nested section layout rendering
  - Section content mount policy for canvas-rendered sections (DOM islands).
- Out of scope:
  - Overview pane, UI Editor pane, header, nav, home, launcher, app preview.

## Hard Constraints
1. No half-measures:
   - No incremental "optimize current NodeRenderer" strategy as the primary path.
   - No final architecture that keeps SVG edges as the main renderer.
   - No final architecture that mounts all section DOM continuously.
2. Ground-up means:
   - New scene graph.
   - New renderer pipeline.
   - New hit testing/input layer.
   - New virtualization model for section internals.
3. Legacy XYFlow stays only as temporary migration fallback and is deleted at cutover milestone.

## UX Preservation Requirements (Non-Negotiable)
The current user experience MUST be preserved.

1. No click-to-reveal model:
   - Visible sections at readable zoom must already show their normal content without requiring a click.
2. No empty visible sections:
   - A section that is in the visible interaction window must not render as an empty shell.
3. No added interaction friction:
   - Users must not need extra clicks/hovers/toggles to see content they can currently see today.
4. Behavioral parity:
   - Selection, activation, drag/resize, edge interactions, keyboard modifiers, nested/group behavior, and section-level editing flows must match current behavior.
5. Virtualization boundary:
   - DOM island virtualization is only for offscreen or non-interaction-window content, with viewport buffering to avoid visible pop-in during normal pan/zoom.

## Current Bottlenecks (Code Anchors)
- Top-level nodes are mounted as full React trees:
  - `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
  - `frontend/src/components/Section/Container/SectionContainer.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
  - `frontend/src/components/Section/Container/ManyNestedSections.tsx`
- Edges are DOM/SVG and depend on handle `getBoundingClientRect` measurements:
  - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`
  - `frontend/src/state/actions/edgeHandles.ts`
- Hot path state updates deep-clone node maps:
  - `frontend/src/state/actions/nodeInternals.ts`
- Camera/input currently tied to d3 zoom wrappers:
  - `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - `frontend/src/forks/xyflow/core/container/Viewport.tsx`

## Target Runtime Architecture

### 1) Canvas Engine Core
- New module boundary: `frontend/src/canvas-engine/`.
- Responsibilities:
  - scene graph ownership
  - GPU buffer lifecycle
  - render loop and frame scheduler
  - camera math and transforms
  - picking/hit testing

### 2) Renderer Backend
- WebGPU primary backend.
- WebGL2 fallback backend.
- Capability detection is explicit and deterministic:
  - try WebGPU adapter/device
  - if unavailable, use WebGL2
  - no heuristic keyword matching or behavior guessing.

### 3) Scene Graph Model
- Flat, typed scene records derived from authoritative project state.
- Record classes:
  - section frame record
  - section handle record
  - data edge record
  - agentic edge record
  - selection/hover overlay record
- Stable numeric ids for picking and GPU instance references.

### 4) DOM Island Overlay
- Separate overlay layer for full section internals.
- Only mount sections that satisfy deterministic mount criteria:
  - visible in viewport padding window
  - active or selected
  - currently editing, dragging, resizing, connecting
  - explicit always-mounted exceptions (if required)
- Keep section business state in existing stores, not in mount lifecycle.
- This is explicitly NOT click-to-reveal; visible sections in the interaction window remain fully rendered.

### 5) Interaction Pipeline
- Engine-native input controller replaces ReactFlow/d3 interactions:
  - pan/zoom
  - click/hover selection
  - marquee selection
  - drag move
  - resize drag
  - edge create/reconnect gestures
- State actions remain routed through existing business actions where possible, but geometry update ownership moves to engine scene state.

## What Gets Rewritten
1. Canvas host in `UIPage`:
   - Replace `ReactFlow` mount with `CanvasEngineHost`.
2. Node and edge render stack:
   - Replace current XYFlow node renderer and SVG edge renderers.
3. Geometry update path:
   - Replace `nodeInternals`/`edgeHandles` render-critical responsibilities with scene graph adapters and direct geometry channels.
4. Camera stack:
   - Replace d3 zoom stack with engine camera controller.
5. Nested section rendering:
   - Replace recursive DOM-first rendering for visible chrome with scene graph rendering.

## What Stays
1. Side panes/nav/home and non-canvas routes.
2. Section business/state semantics and backend endpoints.
3. Heavy content widgets as DOM internals, but mounted through virtualization policy.

## Program Milestones

### Milestone 0: Baseline and Budgets (mandatory prework)
1. Add deterministic heavy-canvas fixtures:
   - 100 mixed sections
   - 300 mixed sections
   - nested groups/list roots included
2. Capture baseline in `perf/reports/frontend/`:
   - FPS and frame-time distribution for pan/zoom
   - long tasks during drag/resize
   - DOM node count inside canvas subtree
   - main-thread scripting/rendering/painting split
3. Add automated guardrails:
   - Playwright large-canvas perf scenario
   - Vitest scene-data adapter perf tests

Exit gate:
- Baseline report committed.
- Perf tests exist and are runnable in CI.

### Milestone 1: Engine Skeleton
1. Add `canvas-engine` package structure and host component.
2. Implement capability negotiation (WebGPU/WebGL2).
3. Render test primitives and camera transform.
4. Add temporary runtime flag for migration.

Exit gate:
- Engine renders and can pan/zoom independently.
- No non-canvas regressions.

### Milestone 2: Scene Data Adapter
1. Build adapter from project state to scene records.
2. Implement patch/diff updates for:
   - section move
   - section resize
   - z-index changes
   - edge add/remove/update
3. Add spatial index for culling and picking.

Exit gate:
- Scene updates are incremental and avoid deep clones.
- Adapter correctness and update tests pass.

### Milestone 3: GPU Section and Edge Rendering
1. Render section chrome, outlines, highlights, handles in GPU.
2. Render data and agentic edges in GPU (remove SVG dependency in engine path).
3. Render selection and hover overlays.

Exit gate:
- Visual parity for shell-level canvas presentation.
- Measured frame pacing improves vs baseline at 100+ sections.

### Milestone 4: Input and Interaction Parity
1. Implement engine hit testing and selection policy.
2. Implement drag move and resize interactions.
3. Implement edge connect/reconnect interactions.
4. Preserve keyboard modifier behavior.

Exit gate:
- Existing section interaction flows pass Playwright parity suite on engine path.

### Milestone 5: DOM Island Virtualization
1. Build mount policy service.
2. Add mount pooling for expensive section internals.
3. Integrate all section types through island adapter:
   - Code, Terminal, Browser, Chat, IFrame, Spreadsheet, Draw, Plugin, etc.

Exit gate:
- Canvas DOM count drops significantly on 300-section fixture.
- No behavior regressions for active or interacted sections.
- No empty sections in the visible interaction window at readable zoom.
- No new click required to reveal content that is currently visible in legacy UX.

### Milestone 6: Nested Section and Group Semantics
1. Move nested/group/list-root shell rendering to scene graph.
2. Preserve DnD and containment semantics.
3. Preserve overflow/clipping behavior contracts.

Exit gate:
- Nested DnD and layout E2E tests pass on engine path.

### Milestone 7: Minimap and Final Parity
1. Implement minimap from scene buffers.
2. Complete visual parity checks with CDP.
3. Close remaining parity gaps.

Exit gate:
- Minimap and primary canvas flows are parity-complete.

### Milestone 8: Hard Cutover and Legacy Deletion
1. Make new engine default.
2. Remove XYFlow canvas runtime from active app path.
3. Delete migration flag after soak period.
4. Remove dead render-path code and stale tests.

Exit gate:
- Legacy ReactFlow runtime is no longer used in production canvas path.
- Perf budgets met on large fixtures.

## Performance Budgets (Acceptance Criteria)
1. Pan/zoom (300 mixed sections):
   - 95th percentile frame time under 16ms on target dev machine profile.
2. Drag/resize interactions:
   - no repeated long tasks greater than 50ms in normal operation.
3. DOM footprint:
   - at least 70 percent reduction of canvas subtree DOM nodes vs baseline in large fixture.
4. Update scaling:
   - section move/resize/selection update cost scales near-linearly and remains stable with fixture growth.

## Test and Verification Strategy
1. Automated:
   - Expand Playwright coverage under `frontend/tests/e2e/sections/` for large-canvas interactions and parity.
   - Add Vitest coverage for scene adapter, culling, picking, and geometry diff application.
2. Profiling:
   - Use `chrome-devtools-mcp` for each milestone before/after measurements.
   - Append results to `perf/reports/frontend/YYYY-MM-DD_<slug>.md`.
3. Visual:
   - CDP visual verification required for canvas behavior changes.

## Migration Strategy
1. Keep legacy and new paths in parallel only during migration milestones.
2. Use shared business actions where stable, but do not keep renderer-level dual architecture longer than necessary.
3. Require milestone gates before progressing to avoid long-lived mixed ownership.

## Expected File-System Impact
- New:
  - `frontend/src/canvas-engine/**`
  - `frontend/src/components/Pages/Project/CanvasEngineHost.tsx`
  - new tests and perf reports
- Retired or heavily reduced after cutover:
  - `frontend/src/forks/xyflow/core/container/**` (canvas runtime parts)
  - legacy node/edge render wrappers and related CSS tied to old runtime
  - render-critical geometry logic currently in `nodeInternals.ts` and `edgeHandles.ts` (moved to engine adapters)

## Risks and Controls
1. Risk: heavy section internals still dominate.
   - Control: strict virtualization with deterministic mount policy and pooling.
2. Risk: parity regressions in interaction semantics.
   - Control: dedicated parity suite and milestone gates.
3. Risk: long migration with dual runtime complexity.
   - Control: explicit hard cutover milestone with deletion requirement.
4. Risk: backend/cross-browser capability differences.
   - Control: explicit capability negotiation path and fallback backend.

## Definition of Done
1. New GPU engine is default canvas runtime.
2. Legacy XYFlow canvas runtime is removed from production path.
3. Large-canvas performance budgets are met and documented.
4. Existing behavior contracts for canvas interactions are preserved.
5. Current section-content UX is preserved:
   - no click-to-reveal behavior
   - no empty visible sections
   - no added interaction steps for normal canvas usage
