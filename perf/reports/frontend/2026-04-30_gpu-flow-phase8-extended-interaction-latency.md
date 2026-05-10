# GPU Flow Phase 8 Extended Interaction Latency

Date: 2026-04-30

## Scope

Extended Phase 8 browser evidence beyond the initial text/toggle/slider/editor
run. The reusable interaction latency probe remains isolated under
`frontend/tests/e2e/`, and this pass added drag/drop start events so the same
probe can measure dropzone controls without production-only instrumentation.

## CDP Run

Command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Production `GpuFlow` fixture rendered in the live Vite app through dynamic
  imports.
- Seven visible nodes: combobox/dropdown, color picker, dropzone, chat input,
  spreadsheet-style cell, browser/iframe, and media control.
- Page-injected wrappers recorded `GPUQueue.copyElementImageToTexture`,
  `GPUQueue.writeBuffer`, node-layer frames, animation frames, and long tasks.
- Screenshot artifact:
  `perf/reports/frontend/gpu-flow-phase8-extended-interaction-latency-2026-04-30.png`

The fixture used scripted browser events to keep the sequence deterministic.
Pointer samples dispatched pointerdown/pointerup/click so active nodes could
restore and produce final uploads. Text-like samples activated the node before
the measured `beforeinput` event, matching the first meaningful input after
native handoff. The dropzone sample used the new `dragenter` start event.

## Results

| Control | Start event | First response latency | Active uploads before response | Final node uploads after response | Long tasks | `writeBuffer()` calls | End value |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Combobox/dropdown | `pointerdown` | 1.0 ms | 0 | 1 | 0 | 2 | `true` |
| Color picker | `pointerdown` | 3.0 ms | 0 | 1 | 0 | 2 | `#00aaee` |
| Dropzone | `dragenter` | 4.5 ms | 0 | 1 | 0 | 0 | `ready` |
| Chat input | `beforeinput` | 1.2 ms | 0 | 1 | 0 | 1 | `hi` |
| Spreadsheet cell | `beforeinput` | 0.8 ms | 0 | 1 | 0 | 1 | `B2` |
| Browser iframe | `pointerdown` | 1.7 ms | 0 | 3 | 0 | 2 | `focused` |
| Media control | `pointerdown` | 2.7 ms | 0 | 2 | 0 | 2 | `playing` |

All samples ended with:

- no `.setta-gpu-flow__node--teleported` node left in the document
- latest node-layer frame `activeNodeId: null`
- `remainingDirtyNodeCount: 0`
- `queueWrappersInstalled: true`

Final fixture memory snapshot:

| Metric | Value |
| --- | ---: |
| Visible nodes | 7 |
| Texture count | 7 |
| Allocated texture bytes | 4,308,800 |
| Visible texture bytes | 4,308,800 |
| Largest texture bytes | 720,000 |

## Verification

Focused tests:

```bash
pnpm -C frontend exec vitest run tests/e2e/gpuFlowInteractionLatencyProbe.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts --environment jsdom --reporter verbose
```
