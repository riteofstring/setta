# GPU Flow Phase 8 Interaction Latency Probe

Date: 2026-04-30

## Scope

Added a reusable browser-side interaction latency probe under
`frontend/tests/e2e/`. The probe is isolated to tests/CDP and measures:

- first input event to visible DOM response
- active-node texture uploads before the visible response
- final node texture uploads after response/restore
- `writeBuffer()` counts and long tasks from the existing GPU flow performance
  probe

The helper intentionally reuses the Phase 1 performance probe for WebGPU queue
and long-task data instead of adding production state or a second queue wrapper.

## CDP Run

Command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Production `GpuFlow` fixture rendered in the live Vite app.
- Four visible nodes: text input, toggle button, range slider, and
  editor-like contenteditable control.
- Page-injected wrappers recorded `GPUQueue.copyElementImageToTexture`,
  `GPUQueue.writeBuffer`, node-layer frames, animation frames, and long tasks.
- Screenshot artifact:
  `perf/reports/frontend/gpu-flow-phase8-interaction-latency-2026-04-30.png`

## Results

| Control | Start event | First response latency | Active uploads before response | Final node uploads after response | Long tasks | `writeBuffer()` calls | End value |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Text input | `beforeinput` | 5.5 ms | 0 | 1 | 0 | 1 | `a` |
| Toggle | `pointerdown` | 7.1 ms | 0 | 1 | 0 | 2 | `true` |
| Slider | `pointerdown` | 7.6 ms | 0 | 1 | 0 | 2 | `72` |
| Editor-like contenteditable | `beforeinput` | 1.3 ms | 0 | 1 | 0 | 1 | `x` |

All samples ended with:

- no active teleport markers left in the document
- latest node-layer frame `activeNodeId: null`
- `remainingDirtyNodeCount: 0`
- `queueWrappersInstalled: true`
- visible node count `4`
- texture memory stable at `2,988,800` allocated/visible bytes for the fixture

## Verification

Focused tests:

```bash
pnpm -C frontend exec vitest run tests/e2e/gpuFlowInteractionLatencyProbe.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts --environment jsdom --reporter verbose
pnpm -C frontend exec eslint --no-warn-ignored -- tests/e2e/gpuFlowInteractionLatencyProbe.ts tests/e2e/gpuFlowInteractionLatencyProbe.test.ts vite.config.ts
```

## Remaining Work

- Extend Phase 8 browser evidence to additional first-party controls during the
  final verification pass: dropdown/color picker, chat input, spreadsheet,
  browser/iframe/media, and dropzone.
- Proceed to Phase 9 cleanup and authority audit after the Phase 8 representative
  latency surface remains stable.
