# HTML GPU Surface Animation Paint-Aligned Check

Date: 2026-05-02

## Context

Manual testing found pan/zoom performance was good, but a switch thumb animation
inside a GPU-rendered HTML node looked choppy. The pre-change animation lease
marked the surface dirty and scheduled a texture-upload frame directly from each
`requestAnimationFrame` tick. That could race ahead of the fresh
html-in-canvas `paint` event and upload an older source paint record.

## Change Under Test

Animation lease dirties still call `HTMLCanvasElement.requestPaint()`, but they
no longer schedule `texture-upload` frames directly. The upload is driven by the
subsequent canvas `onpaint` frame, matching the paint-then-copy ordering used by
the html-in-canvas example projects.

## Scenario

- App/browser launched with
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`.
- Mounted `HtmlSurfaceWarpedMeshFixture` in the live Vite app.
- Instrumented `HTMLCanvasElement.requestPaint`,
  `GPUQueue.copyElementImageToTexture`, `requestAnimationFrame`, and long tasks.
- Clicked the fixture `role=switch` source and waited for the transition window
  to settle.

## Result

| Metric | Result |
| --- | ---: |
| Initial texture uploads | 2 |
| Initial `requestPaint` calls | 2 |
| Switch-window texture uploads | 25 |
| Switch-window `requestPaint` calls | 27 |
| Copy interval average | 8.15 ms |
| Copy interval worst | 9.40 ms |
| Max `copyElementImageToTexture` duration | 2.60 ms |
| Long tasks during switch window | 0 |
| Final `aria-checked` | `true` |

Screenshot:
`perf/reports/frontend/2026-05-02_html-gpu-animation-paint-aligned-after.png`

## Notes

This verifies the paint-aligned capture order on the checked-in warped mesh
fixture. It is not a substitute for a visual pass on a real Setta settings node,
because larger real nodes can still make whole-node texture recapture expensive.

## Settings Node CDP Follow-Up

A follow-up pass exercised a real high-zoom Settings switch through the GPU
canvas hit path. The click was dispatched at the rendered switch position on the
canvas after wheel-zooming into the `gui` node.

| Metric | Result |
| --- | ---: |
| Changed switch index | 10 |
| Switch state transition | `false` -> `true` |
| Toggle-window texture uploads | 72 |
| Toggle-window 8-arg scaled source-subrect uploads | 72 |
| Toggle-window requestAnimationFrame calls | 65 |
| Animation frame samples | 44 |
| Average sampled frame interval | 17.50 ms |
| Worst sampled frame interval | 78.70 ms |
| Sampled intervals over 50 ms | 1 |

Screenshot:
`perf/reports/frontend/2026-05-02_settings-cdp-toggle-after.png`

This verifies that real Settings switch interaction still reaches the underlying
HTML control and recaptures the GPU texture through the scaled tiled path. The
single 78.70 ms sampled frame interval means the real-node animation path still
deserves follow-up profiling even though the paint-aligned fixture path is clean.
