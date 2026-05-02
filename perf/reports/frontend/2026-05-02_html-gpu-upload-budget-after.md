# HTML GPU Upload Budget Enforcement

Date: 2026-05-02

## Context

Fresh audit found that `HtmlSurfaceTextureManager` skipped the per-frame upload
budget whenever a record was resolution-dirty. That let tiled first-visible
surfaces and resolution upgrades upload every tile in one frame. Passive
first-visible records also ignored active viewport deferral because records with
`lastUploadFrame < 0` were always considered uploadable.

## Change Under Test

- Passive first-visible surfaces registered during deferred viewport frames are
  queued without `requestPaint` and are not uploadable until the gesture window
  ends.
- Tiled first-visible uploads spend the normal count/duration/byte budget; the
  surface record is not exposed as render-ready until the full first texture
  layout has uploaded.
- Resolution upgrades stage into pending texture resources and spend the normal
  upload budget. The old texture remains active until the pending resolution is
  fully uploaded, and pending texture memory is counted in memory snapshots.

## Focused Verification

Command:

`pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/textures.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx --environment jsdom`

Result: 48 tests passed.

## CDP Browser Probe

App/browser launched with:

`CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`

The live `/settings` route loaded under Chrome for Testing 149 with WebGPU and
CanvasDrawElement available. This session's route did not mount a production
GpuFlow canvas, so the CDP probe imported the actual Vite-served
`/src/gpuFlow/htmlSurfaces/textures.ts` module in the browser and exercised the
texture owner directly with a mock WebGPU device.

| Probe window | Result |
| --- | --- |
| Passive first-visible during deferred viewport window | `0` `requestPaint`, `0` uploads, dirty surface remained queued, `budgetExhausted: false` |
| Tiled first-visible with `maxUploads: 2` | `2` uploads, `131,072` uploaded bytes, `108,928` skipped bytes, `lastUploadFrame: -1` |
| Tiled resolution upgrade with `maxUploads: 2` | old texture remained active, old pixel width stayed `300`, `131,072` uploaded bytes, `828,928` skipped bytes |
| Pending memory accounting during staged resolution | `1,200,000` allocated bytes, `2` visible texture versions |

Screenshot:

`perf/reports/frontend/2026-05-02_html-gpu-upload-budget-cdp.png`

CDP visual check: done (`./ai.sh`, `/settings` loaded with required
CanvasDrawElement/WebGPU flags; browser-executed texture-manager probe showed
0 active-window requestPaint/upload calls, 2 budgeted first-visible tile
uploads, and 2 budgeted staged resolution tile uploads while the old texture
remained active).
