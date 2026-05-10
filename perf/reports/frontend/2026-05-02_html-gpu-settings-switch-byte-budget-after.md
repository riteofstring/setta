# HTML GPU Settings Switch Byte-Budget Check

Date: 2026-05-02

## Context

The prior real Settings-node switch reports showed the interaction path was
targeted to the `settings-section__gui` top-row tiles, but the project upload
budget still only capped count and duration. A high-zoom animation frame could
therefore upload more than one large tile in the same frame.

## Change Under Test

Project HTML surface uploads now use an explicit byte budget equal to one
default 2048x2048 RGBA tile, alongside the existing `maxUploads: 2` and
`maxDurationMs: 4` budget. The warped-mesh fixture uses the same byte cap.

## Scenario

- App/browser launched with
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`.
- Chrome DevTools MCP verified the Settings page and canvas were loaded.
- A headed Playwright client connected to the same DevTools Chrome on
  `http://127.0.0.1:9241`; it did not launch another browser.
- The production viewport was set to zoom `4` with transform
  `[-2882.819253733356, 1268.0072261849018, 4]`.
- The script clicked the first visible `settings-section__gui` switch through
  the GPU canvas at `(700, 428)`, waited for warm-up/resolution work to settle,
  reset counters, then clicked the same rendered switch again.
- Instrumented `GPUQueue.copyElementImageToTexture`,
  `HTMLCanvasElement.requestPaint`, `requestAnimationFrame`, long tasks, and
  `HtmlSurfaceTextureManager.markSurfaceTextureDirty`.

## Result

| Metric | Previous targeted pass | Byte-budget pass |
| --- | ---: | ---: |
| Steady switch texture uploads | 16 | 11 |
| 8-arg scaled source-subrect uploads | 16 | 11 |
| Max uploaded bytes per approximate frame | not capped | 16,777,216 |
| Total uploaded bytes | not captured | 170,393,600 |
| Request paint calls | 17 | 16 |
| RAF callbacks | 113 | 19 |
| Average sampled frame interval | 9.34 ms | 11.11 ms |
| Worst sampled frame interval | 91.30 ms | 50.10 ms |
| Sampled intervals over 50 ms | 1 | 1 |
| Max `copyElementImageToTexture` duration | 0.50 ms | 0.40 ms |
| Long tasks | 1 | 1 at 56.00 ms |
| Whole-surface paint dirty marks | 0 | 0 |
| Switch state transition | `false` -> `true` | `false` -> `true` |

Measured upload rects after the steady-state click:

- `0,0,256,256,2048,2048`
- `256,0,256,256,2048,2048`
- `512,0,40,256,320,2048`

Dirty tile sets stayed within:

- `settings-section__gui:1:0`
- `settings-section__gui:0:0|settings-section__gui:1:0|settings-section__gui:2:0`
- `settings-section__gui:1:0|settings-section__gui:2:0`

Screenshot:
`perf/reports/frontend/2026-05-02_html-gpu-settings-switch-byte-budget-after.png`

## Notes

The remaining long task is outside the measured upload calls; the longest HTML
texture copy was 0.40 ms. The active animation recapture path now has explicit
count, duration, and byte budgets, and the measured steady switch window did not
widen back to whole-surface dirty ownership.
