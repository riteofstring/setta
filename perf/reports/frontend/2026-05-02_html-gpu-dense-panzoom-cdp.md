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

## Separated Gesture Window Follow-Up

The initial end-to-end table above mixed the active gesture burst with passive
post-gesture resolution recapture. A follow-up run separated those windows so
the pure pan/zoom gate is directly measurable.

CDP was attempted first, but this loop's DevTools bridge stopped resolving
`requestAnimationFrame` and timer waits even on `about:blank` while the page
reported `document.visibilityState === "visible"`. The browser renderer itself
was usable through the required shared Chrome for Testing 149+ binary, so the
separated counter run used Playwright with the same html-in-canvas/WebGPU flags
plus background-throttling disables. This is a CDP bridge blocker, not a
renderer-support blocker.

Artifact:
`perf/artifacts/frontend/html-gpu-dense-panzoom-separated-windows-2026-05-02.json`.

Screenshot:
`perf/reports/frontend/2026-05-02_html-gpu-dense-panzoom-separated-windows.png`.

Fixture shape was unchanged: 1,000 nodes, 1,427 visible edges, representative
node content, production `GpuFlow`, and the checked-in large-graph fixture. The
active gesture burst stayed within the warmed resident viewport so new
first-visible node uploads were not counted as pan/zoom work.

| Window | Texture uploads | `requestPaint` | Source mutations / transform writes | Store updates / transform / flag | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Active gestures | 0 | 0 | 0 / 0 | 86 / 81 / 5 | 0 |
| Deferred resolution recapture | 32 passive | 272 | 0 / 0 | 1 / 0 / 1 | 0 |
| Combined active + deferred | 32 passive | 272 | 0 / 0 | 87 / 81 / 6 | 0 |

Active gesture frame and handler counters:

| Metric | Value |
| --- | ---: |
| Duration | 707.7 ms |
| RAF frames / intervals | 166 / 165 |
| Avg / p95 / worst frame interval | 4.24 / 8.60 / 10.30 ms |
| Intervals over 16.7 ms / 33.3 ms | 0 / 0 |
| Event dispatch avg / p95 / worst duration | 0.39 / 0.60 / 4.90 ms |
| WebGPU writes | 98 |
| Camera uniform writes | 81 calls / 2,592 bytes |
| Flat vertex writes | 17 calls / 94,944 bytes |
| Drawn nodes / edges at active-window end | 32 / 1,427 |

Deferred resolution frame counters:

| Metric | Value |
| --- | ---: |
| Duration | 550.5 ms |
| RAF frames / intervals | 41 / 41 |
| Avg / p95 / worst frame interval | 13.42 / 9.60 / 158.30 ms |
| Intervals over 16.7 ms / 33.3 ms | 2 / 2 |
| WebGPU writes | 0 |
| Drawn nodes / edges at settled end | 32 / 1,427 |

The separated active gesture window satisfies the pure pan/zoom invariant:
zero texture uploads, zero `requestPaint`, and zero source transform writes
while real wheel, trackpad-equivalent, pointer-pan, and ctrl-wheel zoom events
flow through the production surface. The passive uploads and requestPaint calls
are isolated to the post-gesture resolution upgrade window.

CDP visual check: not run for the separated follow-up (DevTools bridge
RAF/timer waits timed out); Playwright visual check done with shared Chrome for
Testing 149+ on the production `GpuFlow` large-graph fixture, final zoom 1.741,
0 active-window uploads/requestPaint/source transform writes, 32 deferred
passive uploads.
