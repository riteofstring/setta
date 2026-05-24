# GPU Flow Phase 3 DOM Transform Sync

Date: 2026-04-30

## Scope

Phase 3 owner change in `GpuNodeLayer` and `GpuFlow`:

- added a GPU node DOM transform sync cache owned by the frame path
- switched production DOM hit-target transform sync to visible quads plus the
  previous-visible set
- retained active, deferred, and suppressed restored nodes so active/settling
  DOM is not parked during final upload ordering
- skipped unchanged DOM transform writes from the cache

Command used for browser verification:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Screenshot:

- `perf/reports/frontend/gpu-flow-phase3-dom-transform-sync-2026-04-30.png`

## Before And After

Fresh code audit baseline before this change:

- `renderGpuNodeLayerFrame()` already culled to visible quads, but then called
  `syncGpuNodeDomTransforms()` with the full mounted `nodes` array.
- That helper resolved and checked every mounted node on every viewport frame,
  parking all culled nodes even when only visible and previous-visible hit
  targets could have changed.

Focused owner test after this change:

| Scenario | Mounted nodes | Visible next | Previous visible exits | Element resolutions | DOM updates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Old audited path | 1,000 | 3 | 1 | 1,000 | changed values only |
| Cached diff path | 1,000 | 3 | 1 | 4 | 3 visible, 1 parked |
| Cached identical frame | 1 | 1 | 0 | 1 | 0 |

The focused test also covers a retained previous-visible active node with no
current quad: it remains unparked with `pointer-events: all`.

## CDP Sample

Scenario: Settings -> All Settings, reset zoom to `1`, close the bottom chat
window, then dispatch a pane wheel-pan sample after warmup.

Injected browser probes:

- `GPUQueue.copyElementImageToTexture()`
- `GPUQueue.writeBuffer()`
- `requestAnimationFrame`
- long tasks
- `MutationObserver` for `style`, `class`, `data-gpu-flow-visible`, and
  `data-gpu-flow-interactive` changes on `[data-gpu-flow-node="true"]`

Observed after the pan sample:

| Metric | Value |
| --- | ---: |
| Mounted GPU node DOM elements | 5 |
| Visible GPU node DOM elements after pan | 3 |
| Frames sampled | 14 |
| Average frame interval | 8.3 ms |
| Worst frame interval | 33.4 ms |
| Long tasks | 0 |
| Texture uploads | 0 |
| `writeBuffer()` calls | 4 |
| `writeBuffer()` labels | camera uniform 3, node vertices 1 |
| GPU node attribute mutations | 15 |
| GPU node style mutations | 12 |
| Mutated GPU node ids | `settings-section__gui`, `settings-section__backend`, `settings-section__sectionSizingPolicy`, `settings-section__languageServer` |

The mutated ids match the visible/previous-visible transition set for this
small Settings sample rather than every mounted node. The single node vertex
buffer write came from the drawn node set changing as culling crossed a node
boundary; texture uploads stayed at zero.

Post-pan hit-test check:

- `elementFromPoint()` over the visible `settings-section__gui` node resolved to
  descendants whose closest GPU node was `settings-section__gui`.
- A CDP click on that node after the pan activated the same node as live
  teleported DOM with `data-gpu-flow-interactive="true"` and `pointer-events:
  all`.

## Focused Verification

```bash
pnpm -C frontend exec vitest run src/gpuFlow/GpuNodeLayer.test.tsx src/gpuFlow/GpuFlow.test.tsx src/gpuFlow/GpuFlow.activeNodePaint.test.ts --environment jsdom
```

The focused tests cover:

- visible/previous-visible DOM sync diffing on a 1,000-node mounted set
- unchanged transform frames producing no DOM transform rewrite
- retained active/restored nodes not being parked
- deferred/suppressed restored nodes being forced into the visible sync set
- adjacent active-node frame sync behavior in `GpuFlow`
