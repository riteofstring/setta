# HTML GPU Settings Switch Targeted Recapture Check

Date: 2026-05-02

## Context

The prior real Settings-node pass in
`2026-05-02_html-gpu-animation-paint-aligned-after.md` still showed a high-zoom
switch window uploading the full tiled `settings-section__gui` surface:
72 scaled uploads, 65 `requestAnimationFrame` callbacks, a 17.50 ms average
sampled frame interval, and one 78.70 ms sampled frame.

The follow-up audit found three broad dirty sources:

- pointer begin/release and input/change marks did not carry the event target
  source rect;
- animation capture marks did not pass the animated target source rect into
  tiled dirty ownership;
- html-in-canvas direct source `paint.changedElements` events during the switch
  transition reported the source wrapper itself, widening dirty ownership back
  to all tiles after targeted animation marks.

## Change Under Test

- Interaction dirty marks now resolve the event target relative to the owning
  HTML source and pass `sourceRect` into `markSurfaceTextureDirty`.
- Animation capture leases publish the animated target rect and retain that rect
  for direct source paint events emitted during and immediately after the
  transition.
- Shared source-rect helpers are used by animation and paint invalidation so
  clipping and union behavior is consistent.

## Scenario

- App/browser launched with
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion" ./ai.sh`.
- Chrome DevTools MCP could not be used for this pass because the bridge timed
  out on page enumeration and the `./ai.sh` DevTools browser did not advance
  `requestAnimationFrame` reliably. The browser check used headed Playwright
  with the shared Chrome for Testing 149 binary:
  `/Users/kevin/Library/Caches/setta/chrome-for-testing/Canary/149.0.7822.0/mac-arm64/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
- Loaded `/settings`, selected the visible `settings-section__gui` HTML source,
  set the production viewport to zoom `4`, and clicked the rendered switch
  through the GPU canvas at `(700, 428)`.
- The first click warmed the deferred high-resolution tiled texture. Counters
  were reset after the upload path went quiet, then a second switch click was
  measured.
- Instrumented `GPUQueue.copyElementImageToTexture`,
  `HTMLCanvasElement.requestPaint`, `requestAnimationFrame`, long tasks, and
  `HtmlSurfaceTextureManager.markSurfaceTextureDirty` dirty tile summaries.

## Result

| Metric | Before | After |
| --- | ---: | ---: |
| Steady switch texture uploads | 72 | 16 |
| 8-arg scaled source-subrect uploads | 72 | 16 |
| Unique uploaded tile rects | 6 tiles | 3 top-row tiles |
| Whole-surface paint dirty marks | not measured | 0 |
| Request paint calls | 65 | 17 |
| RAF callbacks / samples | 65 / 44 | 113 |
| Average sampled frame interval | 17.50 ms | 9.34 ms |
| Worst sampled frame interval | 78.70 ms | 91.30 ms |
| Sampled intervals over 50 ms | 1 | 1 |
| Max `copyElementImageToTexture` duration | not captured | 0.50 ms |
| Switch state transition | `false` -> `true` | `false` -> `true` |

Measured upload rects after the steady-state click:

- `0,0,256,256,2048,2048`
- `256,0,256,256,2048,2048`
- `512,0,40,256,320,2048`

Dirty mark summary after the steady-state click:

- reasons: `animation`, `paint`, `pointer`;
- dirty tile sets stayed within `settings-section__gui:0:0`,
  `settings-section__gui:1:0`, and `settings-section__gui:2:0`;
- `wholeSurfacePaintMarks`: `0`.

Screenshot:
`perf/reports/frontend/2026-05-02_html-gpu-settings-switch-targeted-steady-after.png`

## Notes

The remaining single 91.30 ms sampled interval came from one page long task
during the measurement window, while the upload work itself stayed below 1 ms
per call and no bottom-row tiles were uploaded. The cold warm-up still includes
full tiled resolution work; the measured gate above isolates the steady
interaction/animation recapture path after the deferred high-resolution texture
has been populated.
