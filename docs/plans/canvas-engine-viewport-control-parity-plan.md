# Canvas Engine Viewport Control Parity Plan

## Goal

Restore shared viewport controls and shortcuts on the `useCanvasEngineV1` path without forking the existing controls UI.

## Problem

- Shared viewport helpers in `forks/xyflow/core/hooks/useViewportHelper.ts` still assume `d3Zoom` and `d3Selection` exist.
- The experimental canvas engine syncs viewport state through `useReactFlow.transform`, but it does not mount the React Flow d3 runtime.
- The engine path also leaves `useReactFlow.domNode` unset, which weakens shared coordinate helpers that expect a workspace element.

## Scope

1. Register the canvas engine host element as the React Flow `domNode`.
2. Add store-backed fallback behavior to the shared viewport helpers when `d3Zoom` is unavailable.
3. Extend fit-view to use project top-level section layouts when node internals are absent.
4. Verify toolbar buttons on the engine path:
   - `zoom in`
   - `zoom out`
   - `reset zoom`
   - `fit view`

## Verification

- Add focused coverage for any extracted viewport math helpers if needed.
- Add Playwright coverage on `canvas-engine-host.spec.ts` for toolbar viewport controls.
- Run a live CDP check on the engine path and confirm camera changes after control clicks.

## Non-goals

- Replacing the controls UI.
- Reintroducing the React Flow d3 runtime on the engine path.
- Animating viewport transitions beyond what the current shared helpers already require.
