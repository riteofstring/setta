# GPU Flow Live DOM Final Verification

Date: 2026-04-29
Area: frontend GPU flow
Route: `http://127.0.0.1:3019/settings`, Settings -> All Settings
Browser: Chrome 147.0.0.0 on macOS, DPR 2
Chrome flags: `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`

## Scope

This verifies the completed active-node DOM teleport path:

- passive nodes stay on cached WebGPU textures
- the active node is the same React-owned DOM instance moved to the active overlay
- the active GPU quad is suppressed while live DOM is mounted
- active node texture uploads are deferred while teleported
- the node is restored under the canvas before the final snapshot upload

Reference baseline from `2026-04-29_gpu-flow-node-interactivity.md`:

- active overlay absent in the normal path
- `copyElementImageToTexture`: 37 calls over one filter/switch sample
- switch visual feedback depended on repeated active full-node texture uploads

## Browser Evidence

Native API support in the flagged browser:

| API | Result |
| --- | --- |
| `navigator.gpu` | present |
| `<canvas layoutsubtree>` | present |
| `HTMLCanvasElement.requestPaint()` | present |
| `GPUQueue.copyElementImageToTexture()` | present |
| `CanvasRenderingContext2D.drawElementImage()` | present |

Artifacts:

- Normal zoom screenshot: `perf/reports/frontend/gpu-live-dom-final-settings-normal-2026-04-29.png`
- After zoom/pan screenshot: `perf/reports/frontend/gpu-live-dom-final-settings-after-zoom-2026-04-29.png`
- Raw CDP trace: `perf/reports/frontend/gpu-live-dom-final-settings-trace-2026-04-29.json.gz`

Console check:

- No `copyElementImageToTexture(...)` or WebGPU runtime errors.
- Remaining messages were pre-existing dev warnings/errors: React Router future flag warning, React 19 `element.ref` warning, and existing accessibility issues.

## Interaction Results

The probe wrapped `copyElementImageToTexture()` and `requestPaint()` in-page, observed long tasks, and drove pointer/focus/zoom events through the Settings canvas.

| Interaction | Active DOM lifecycle | Active node uploads | Notes |
| --- | --- | --- | --- |
| Switch first-click handoff | `CANVAS` -> active overlay on `pointerdown`; restored to `CANVAS` after settle | 1 final node upload, 0 while teleported | `aria-checked` changed on first handoff; thumb CSS transition duration was `0.15s`; 11 distinct transform samples were observed during the transition window. |
| Text input/caret | focus moved node to active overlay; blur restored it | 1 final node upload, 0 while teleported | typed `live-dom`; visible value update max was `0.2ms`; caret ended at selection `8..8`; value survived restore. |
| Pan/zoom while active | node stayed teleported during zoom and wheel pan; transform tracked viewport | 2 final node uploads, 0 while teleported | measured 120.1 fps average during the active pan/zoom window, max frame interval `9.4ms`; no long tasks in this window. |

Upload counts by interaction:

| Window | `requestPaint()` calls | all texture copies | copies for active node | active-node copies while teleported | max observed long task |
| --- | ---: | ---: | ---: | ---: | ---: |
| switch handoff/settle | 3 | 1 | 1 | 0 | 259ms |
| text focus/type/settle | 32 | 1 | 1 | 0 | 97ms |
| active pan/zoom/settle | 41 | 10 | 2 | 0 | 0ms |

The switch and text windows include React/dev-build work triggered by the synthetic browser probe. The key architectural metric is that active-node copies stayed at `0` while the node was teleported; copies only happened after restore.

## Availability Notes

The reset Settings -> All Settings workspace had:

- `0` range sliders (`input[type="range"]` or `[role="slider"]`)
- `0` CodeMirror editors
- `0` terminal surfaces

Those component families are covered by the active target/component audit and unit tests. This CDP pass could not exercise live slider drag, CodeMirror editing, or terminal input on the reset Settings page because those controls were not present.

## Result

The final active DOM path no longer relies on repeated full-node texture uploads for switch and text input feedback. The active browser DOM stays visible during interaction, the GPU quad is suppressed during the live/finalizing period, and the restored node receives one final texture snapshot before the passive GPU quad returns.
