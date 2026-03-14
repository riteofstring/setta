# Canvas Engine Minimap Parity Plan

## Goal

Restore the workspace minimap on the `useCanvasEngineV1` path without depending on React Flow's node DOM renderer.

## Constraints

- The existing React Flow minimap cannot be reused directly on the engine path because `useNodeInternals` is empty there.
- The engine path already syncs camera state through the React Flow store, so that store should remain the viewport compatibility boundary.
- The first minimap slice should avoid introducing a second source of truth for camera state.

## Phase 1

1. Add an engine-native minimap component under `frontend/src/components/Pages/Project/`.
2. Render top-level section rects from the canvas-engine scene inputs instead of `useNodeInternals`.
3. Reuse the existing minimap placement and styling so the controls/UI remain familiar.
4. Drive the minimap viewport mask from the current React Flow transform and canvas size.
5. Support click-to-center and drag-to-pan by writing back through the React Flow transform store.

## Verification

- Add focused Vitest coverage for minimap coordinate conversion / viewport update behavior.
- Add Playwright coverage that enables `useCanvasEngineV1`, shows the minimap, and verifies a minimap interaction changes the viewport.
- Run a CDP visual check on a live engine-host page with the minimap visible.

## Follow-ups

- Restore minimap preview coloring parity with the normal React Flow path.
- Add edge-aware bounds if the engine path later wants them reflected in minimap framing.
- Evaluate whether minimap interactions should snap or animate like the React Flow path.
