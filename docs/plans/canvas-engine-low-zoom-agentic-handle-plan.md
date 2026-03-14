## Canvas Engine Low-Zoom Agentic Handle Plan

### Goal

Keep agentic-edge handle interactions usable on the canvas-engine path at low
zoom, using the same screen-space hit model we now use for data handles.

### Problem

Agentic handles still use a fixed world-space hit tolerance. After zooming far
out, that shrinks the effective screen hit area and makes real browser drags
much easier to miss than the equivalent top-level interaction at normal zoom.

### Scope

This slice covers low-zoom agentic handle connect parity.

In scope:

- agentic handle hit tolerance derived from screen pixels instead of world units
- host-level regression coverage using rounded low-zoom coordinates
- browser coverage that keeps agentic edge creation working after zooming out

Out of scope:

- agentic reconnect behavior
- cached nested agentic preview interactions
- non-agentic edge hit-testing changes beyond the shared low-zoom parity issue

### Implementation Steps

1. Replace the fixed world-space agentic handle tolerance with a zoom-scaled
   screen-space tolerance.
2. Add a host-level low-zoom regression.
   - Start an agentic edge drag at low zoom with rounded client coordinates.
   - Assert the preview stays valid and the edge persists on pointer-up.
3. Add a browser-level low-zoom regression.
   - Use the existing top-level agentic create flow.
   - Zoom out first, then complete the drag and assert persistence.

### Verification

- `vitest` for `CanvasEngineHost.test.tsx`
- targeted Playwright on `canvas-engine-host.spec.ts`
- CDP visual check on a live engine project after zooming out

### Exit Criteria

This slice is done when low-zoom agentic handle drags:

- still start reliably
- still resolve the intended target handle
- still persist the new agentic edge on pointer-up
