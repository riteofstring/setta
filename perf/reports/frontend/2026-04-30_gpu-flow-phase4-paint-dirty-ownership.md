# GPU Flow Phase 4 Paint Dirty Ownership

Date: 2026-04-30

## Scope

Phase 4 changed paint dirty owner resolution in `GpuNodeLayer` so normal
changed-child paint events resolve through stable GPU node DOM ancestry instead
of scanning every mounted node.

## Before

- `findNodeIdForChangedElement()` iterated `elementByNodeId` for every changed
  element.
- Normal child-control paint events were therefore O(mounted nodes).
- A paint event whose changed element was the GPU node wrapper itself returned
  no owner and did not mark the node dirty.

## After

- Normal paint ownership uses
  `closest('[data-gpu-flow-node="true"]')` plus `data-id` validation against the
  runtime node element map.
- Whole-node paint events now dirty that node.
- The only ancestor fallback accepts a non-surface changed subtree containing
  exactly one registered GPU node.
- Canvas/surface-level paint events do not dirty every mounted node.

## Focused Verification

Passed:

```bash
pnpm -C frontend exec vitest run src/gpuFlow/GpuNodeLayer.test.tsx src/gpuFlow/GpuFlow.activeNodePaint.test.ts --environment jsdom
./gcf.sh
./scripts/quality/check.sh
```

Test coverage added:

- child changed-element resolution marks the owning node dirty without iterating
  a 2,500-entry mounted-node map
- whole-node changed-element resolution marks the node dirty
- single-node ancestor fallback marks that node dirty
- omitted, unrelated, and canvas/surface changed-elements do not dirty visible
  nodes
- active pending-paint clearing still resolves child, node, canvas, and
  unspecified paint shapes

## CDP Browser Check

Command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario: Settings -> All Settings GPU flow surface.

Probe summary:

- mounted GPU node DOM count: 5
- probed node: `settings-section__backend`
- child-style paint changed-elements: node wrapper
  `settings-section__backend`
- node-wrapper paint changed-elements: node wrapper
  `settings-section__backend`
- surface paint changed-elements: empty
- `GPUQueue.prototype.copyElementImageToTexture` calls observed during the
  synthetic paint probes: 0
- console errors/warnings: 0

Artifact:

- `perf/reports/frontend/gpu-flow-phase4-paint-dirty-ownership-2026-04-30.png`

## Notes

The browser probe validated the html-in-canvas changed-element shapes that this
owner resolver relies on and confirmed that a surface-level request did not
present node changed-elements that would dirty the full graph.
