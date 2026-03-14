## Canvas Engine Cached Nested Edge Parity Plan

### Goal

Make cached nested edges behave like real canvas edges after DOM islands unmount:

- still render on the GPU canvas
- still hover/select correctly
- still expose correct data-edge endpoint anchors for reconnect flows

### Problem

The current cached nested edge path is only partially wired:

- the host can keep nested preview rects and nested data-handle positions cached
- the scene adapter can keep nested data edges in the scene snapshot
- but several edge consumers still resolve geometry from top-level rects only

That leaves a mismatch where cached nested edges may be counted as resolved, but:

- the renderer can skip drawing them
- edge hover/select hit testing can miss them
- data-edge endpoint hit testing and anchor queries can fail for reconnect

### Scope

This slice covers cached nested preview geometry for edge rendering and interaction.

In scope:

- scene-adapter edge geometry lookup for top-level or nested preview rects
- data-edge endpoint rebuilding from cached nested geometry
- edge hover/select hit testing from cached nested geometry
- renderer support for drawing cached nested data/agentic edges
- focused unit tests
- a Playwright case that proves the post-unmount edge path works visually/behaviorally

Out of scope:

- full recursive scene-graph replacement
- nested section drag/edit parity without mounted DOM
- cached nested handle creation for agentic edges

### Implementation Steps

1. Add a single shared scene-adapter helper for resolving a section rect by id from either:
   - `rectById`
   - `nestedPreviewRectById`
2. Use that helper in:
   - `getDataEdgeAnchorsById(...)`
   - `hitTestEdgeAtWorldPoint(...)`
   - `rebuildDataEdgeEndpoints()`
3. Update the renderer to build its edge rect lookup from:
   - visible top-level rects
   - visible nested preview rects
4. Keep the changes structural:
   - no heuristic geometry estimation beyond the existing explicit edge-anchor logic
   - no new DOM probing in the render/hit-test path
5. Add tests for:
   - scene-adapter nested data-edge hit testing
   - scene-adapter nested data-edge endpoint anchor resolution
   - renderer or browser-level proof that cached nested edges still hover/select after unmount

### Verification

- `vitest` for scene-adapter and host coverage
- targeted Playwright on `canvas-engine-host.spec.ts`
- CDP visual check on a disposable project:
  - create nested edge
  - zoom out until DOM islands unmount
  - confirm the edge is still visible and interactive

### Exit Criteria

This slice is done when, after nested DOM islands unmount:

- cached nested data edges still render
- hovering/clicking a cached nested edge updates host hovered-edge state and backend selection
- data-edge endpoint resolution still works from cached geometry
