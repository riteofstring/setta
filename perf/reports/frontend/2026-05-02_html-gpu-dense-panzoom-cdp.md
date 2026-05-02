# HTML GPU Dense Pan/Zoom CDP Verification

Date: 2026-05-02

## Scope

Follow-up verification for
`docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md`, covering the
remaining dense pan/zoom performance gate.

The browser run used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

The live `/settings` All Settings route in this local state exposed only a
small GPU graph, so the CDP harness rendered the checked-in large graph fixture
from `frontend/tests/e2e/gpuFlowLargeGraphStressFixture.ts` through the
production `GpuFlow` component on `/settings`.

Fixture shape:

| Metric | Value |
| --- | ---: |
| Nodes | 1,000 |
| Edges | 1,427 |
| Source DOM nodes | 1,000 |
| Representative node content | title, status pill, rows, progress bar, checkbox |

Instrumentation wrapped `GPUQueue.copyElementImageToTexture`,
`GPUQueue.writeBuffer`, `HTMLCanvasElement.requestPaint`, source DOM attribute
mutations, viewport store subscription updates, RAF intervals, long tasks, and
event dispatch duration.

## Isolated Viewport Store

Direct viewport-store updates isolate the renderer hot path from browser input
handling. The run used warmed visible textures and drove 62 pan/zoom transforms.

| Metric | Value |
| --- | ---: |
| Duration | 780.0 ms |
| RAF frames / intervals | 123 / 122 |
| Avg / p95 / worst frame interval | 4.17 / 8.40 / 8.40 ms |
| Intervals over 16.7 ms / 33.3 ms | 0 / 0 |
| Long tasks | 0 |
| Texture uploads | 0 |
| `requestPaint` calls | 0 |
| Source mutations / transform writes | 0 / 0 |
| Store updates / transform updates / flag updates | 61 / 61 / 0 |
| Direct `setTransform` avg / worst duration | 0.102 / 0.400 ms |

GPU writes:

| Buffer label | Calls | Bytes |
| --- | ---: | ---: |
| `setta-html-surface-camera-uniform` | 61 | 1,952 |
| `setta-html-surface-flat-vertices` | 16 | 82,368 |

Latest frame summary: 1,427 drawn edges, 56 drawn nodes, 95 resident textures,
95 visible source DOM nodes, no missing textures, no remaining dirty nodes, no
texture eviction.

## End-To-End Gestures

The end-to-end measurement dispatched wheel-line pan, trackpad-equivalent pixel
pan, pointer pan, and ctrl-wheel pinch zoom through the production pan/zoom
controller. CDP synthetic `PointerEvent` dispatch cannot establish browser
pointer-capture ownership, so pointer capture methods were neutralized only
during that synthetic pointer segment. The production event handlers, viewport
store, frame requests, WebGPU writes, and texture upload paths still ran.

Gesture counts:

| Gesture | Events |
| --- | ---: |
| Wheel line pan | 18 |
| Trackpad pixel pan | 24 |
| Pointer pan down / move / up | 1 / 20 / 1 |
| Ctrl-wheel zoom | 20 |

Final traced run:

| Metric | Value |
| --- | ---: |
| Duration | 1,059.9 ms |
| RAF frames / intervals | 168 / 167 |
| Avg / p95 / worst frame interval | 5.33 / 9.30 / 167.70 ms |
| Intervals over 16.7 ms / 33.3 ms | 2 / 1 |
| Long tasks | 0 |
| Event dispatch avg / p95 / worst duration | 0.501 / 1.000 / 2.900 ms |
| Texture uploads | 40 passive |
| `requestPaint` calls | 40 |
| Source mutations / transform writes | 0 / 0 |
| Store updates / transform updates / flag updates | 87 / 81 / 6 |
| Visible source DOM nodes at end | 99 |
| Drawn nodes / edges at end | 20 / 1,427 |

GPU writes:

| Buffer label | Calls | Bytes |
| --- | ---: | ---: |
| `setta-html-surface-camera-uniform` | 81 | 2,592 |
| `setta-html-surface-flat-vertices` | 36 | 126,336 |

The zoom portion increased the target texture resolution, so the traced
end-to-end run includes passive GPU texture recapture after the gesture burst.
The important source-mutation counter stayed at zero: pan/zoom did not move or
rewrite the source DOM during the measured interaction path. The single
33.3 ms+ RAF interval occurred during post-gesture burst settling and was not
paired with a browser long task; p95 frame interval stayed under 10 ms.

## CDP Artifacts

Trace artifact:
`perf/artifacts/frontend/html-gpu-dense-panzoom-cdp-trace-2026-05-02.json.gz`.

Warmup trace artifact:
`perf/artifacts/frontend/html-gpu-dense-panzoom-cdp-trace-warmup-2026-05-02.json.gz`.

Viewport screenshot:
`perf/reports/frontend/2026-05-02_html-gpu-dense-panzoom-cdp.png`.

DevTools trace summary for the final run reported `CLS: 0.00` and no available
performance insights for the no-navigation trace set.

Console after the clean rerun had only the pre-existing React Router future flag
warning and React 19 `element.ref` warnings/errors. No harness errors,
`color.trim` errors, or pointer-capture errors were present after the final
rerun.

CDP visual check: done (`./ai.sh`, `/settings` with production `GpuFlow`
large-graph fixture, final zoom 1.567, 40 passive uploads, 117 WebGPU writes,
0 source transform writes).
