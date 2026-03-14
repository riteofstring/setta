## Canvas Engine Cached Nested Reconnect Parity Plan

### Goal

Make cached nested data-edge reconnects work end-to-end on the experimental
canvas-engine path after nested DOM islands unmount.

### Problem

The previous slice fixed the data source of truth for cached nested handles and
proved that reconnect targets remain cached after DOM unmount. That is necessary
but not sufficient for parity.

We still need to prove the real reconnect gesture works after DOM unmount:

- pointer-down can start a reconnect session from a cached nested endpoint
- pointer-move can resolve a cached nested target handle
- pointer-up persists the new endpoint through the normal reconnect action

Without that, cached nested edges are still weaker than top-level edges and the
canvas-engine path is not actually equivalent for nested projects.

### Scope

This slice covers cached nested reconnect parity for data edges only.

In scope:

- host-level reconnect completion coverage after DOM-island unmount
- browser coverage that reconnects a cached nested edge to another cached nested
  target after DOM-island unmount
- any narrow runtime fixes needed to make that gesture persist correctly

Out of scope:

- new cached nested drag/edit affordances unrelated to data-edge reconnect
- agentic-edge reconnect behavior
- replacing DOM-bridge nested previews with a full recursive scene graph

### Implementation Steps

1. Strengthen the host regression test.
   - Start from the existing cached-nested reconnect setup.
   - Complete the gesture through pointer-up.
   - Assert the reconnect endpoint is persisted instead of only checking preview
     validity.
2. Add a real browser reconnect test for the cached state.
   - Use exact cached world coordinates from the shared edge-handle registry.
   - Dispatch pointer events directly on the host so the test exercises the
     engine path without DOM-target flake.
3. Tighten the runtime only if the stronger tests expose a gap.
   - Keep the fix narrow.
   - Do not introduce heuristic hit targeting.

### Verification

- `vitest` for `CanvasEngineHost.test.tsx`
- targeted Playwright on `canvas-engine-host.spec.ts`
- CDP visual check on a disposable project:
  - create a nested edge inside a Group
  - zoom out until DOM islands unmount
  - reconnect the cached nested edge to a different cached nested target
  - confirm the persisted edge target updates

### Exit Criteria

This slice is done when, after nested DOM islands unmount:

- a cached nested data edge can start reconnect from its endpoint
- the reconnect preview can resolve another cached nested target handle
- pointer-up persists the new target through the normal reconnect pathway
