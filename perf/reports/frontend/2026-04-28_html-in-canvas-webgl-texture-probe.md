# HTML-in-Canvas WebGL Texture Probe

Date: 2026-04-28
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree
Related PR: n/a

## Goal

Verify that a WebGL-first `layoutsubtree` canvas can upload direct HTML children with `texElementImage2D()` and reuse those textures across pan/zoom frames without re-uploading unchanged HTML.

## Reference

- `docs/plans/html-in-canvas-webgl-texture-canvasflow-plan.md`
- https://github.com/fimbox/html-in-canvas/blob/main/plugins/html-cloth.mjs

## Method

- Runner: opt-in Playwright E2E probe `frontend/tests/e2e/canvasflow/html-in-canvas-webgl-texture-probe.spec.ts`.
- Browser: Chrome launched by Playwright with `--enable-blink-features=CanvasDrawElement`.
- Each case runs in a fresh page with a Node-side timeout so a hung renderer process is recorded as a result instead of losing the whole report.
- The probe creates the canvas with WebGL first, sets `layoutsubtree`, appends direct HTML children, tests direct `texElementImage2D()` uploads, then tests the cloth-demo-style `requestPaint()` upload path.
- Paint-upload cases upload inside the canvas `paint` event and draw/read WebGL pixels on the following animation frame, matching the demo pattern that keeps the paint callback as the HTML capture boundary.
- Empty no-child requestPaint cases are intentionally excluded because CanvasFlow's texture path is about direct child source elements and Chromium does not need to emit a paint event when no layoutsubtree child can change.
- Raw JSON artifact, ignored by git: `perf/artifacts/frontend/html-in-canvas-webgl-texture-probe.json`.

## Support

| requestPaint | texElementImage2D | WebGL |
| :--- | :--- | :--- |
| function | function | object |

## Results

| Case | Mode | Status | Sources | Text Chars | Initial Uploads | Pan Uploads | Pan Frames | First Pan Frame | Max Pan Frame | Non-BG Pixels Initial | Non-BG Pixels After Pan | Error |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| direct-upload-before-paint | direct | failed | 1 |  |  |  |  |  |  |  |  | Error: page.evaluate: InvalidStateError: Failed to execute 'texElementImage2D' on 'WebGLRenderingContext': No cached paint record for element.     at runDirectUpload (eval at evaluate (:302:30), <anonymous>:227:25)     at async runBrowserProbeCase (eval at evaluate (:302:30), <anonymous>:40:8)     at async <anonymous>:328:30 |
| demo-style-paint-upload | paint | passed | 1 | 36 | 1 | 0 | 30 | 0.20 ms | 8.50 ms | 28,760 | 23,198 |  |
| single-minimal-paint-upload | paint | passed | 1 | 36 | 1 | 0 | 30 | 0.40 ms | 8.50 ms | 28,760 | 23,198 |  |
| single-static-card-paint-upload | paint | passed | 1 | 60 | 1 | 0 | 30 | 1.50 ms | 9.40 ms | 28,760 | 23,198 |  |
| ten-static-cards-paint-upload | paint | passed | 10 | 602 | 10 | 0 | 30 | 0.20 ms | 9.40 ms | 192,888 | 154,672 |  |
| section-shaped-controls-paint-upload | paint | passed | 1 | 84 | 1 | 0 | 30 | 1.90 ms | 9.30 ms | 120,031 | 96,866 |  |

## Decision

- The standalone probe validates the API shape needed before app integration: WebGL context first, direct canvas child HTML sources, `texElementImage2D()` during `paint`, draw on the normal WebGL frame after upload, and texture reuse across viewport-only frames. Direct upload before a cached paint record fails as expected, which matches the WICG model and the demo scheduling.

## Verification

- The Playwright test asserts support APIs and writes a report for each progressive case.
- Passing cases verify initial upload counts, zero pan-frame uploads, source text, and nonblank WebGL pixels before and after pan frames.
