# HTML Surface Display List Composition After Report

Date: 2026-05-10

Change under test:

- Replaced pass-partitioned HTML surface draw order with an explicit display
  list sorted by layer, z-index, source order, and command ID.
- Split renderer execution into contiguous display-list batches so `flat`,
  `tiled-flat`, `mesh`, `effect`, and solid commands do not globally reorder
  composition by pipeline kind.
- Clipped generic section shell visuals around retained content page rects
  before they enter the display list.
- Added frame diagnostics for render command counts and retained-content
  occlusion risk.

## Automated Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/displayList.test.ts src/gpuFlow/htmlSurfaces/surfaceVisuals.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/gpuPipelines.test.ts src/gpuFlow/framePerformance.test.ts`
  - 5 files passed
  - 70 tests passed
- `pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/hitScene.test.ts src/gpuFlow/activeNodeTargeting.test.ts src/gpuFlow/GpuFlow/sourceInteraction.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/retainedTexturePageVisuals.test.ts src/gpuFlow/GpuRetainedContentSurfaces.test.tsx`
  - 6 files passed
  - 42 tests passed
- `pnpm exec vitest run $(rg --files src/gpuFlow -g '*.test.ts' -g '*.test.tsx' | rg -v 'helpers\\.test\\.(ts|tsx)$')`
  - 101 files passed
  - 650 tests passed
- `./scripts/quality/check.sh`
  - File length checks passed
  - Frontend quality checks passed
  - Frontend test complexity checks passed
  - Frontend boundary checks passed

## Chrome Recording

Live app session:

- Frontend: `http://127.0.0.1:3019/`
- Backend: `127.0.0.1:8019`
- Chrome flags:
  - `--enable-blink-features=CanvasDrawElement`
  - `--enable-unsafe-webgpu`

Recording bundle:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260510-215322`

Flow:

1. Opened the generated `spare_wise` project.
2. Used the in-app zoom-in control until the control disabled at max zoom.
3. Verified `window.settaGpuFlowZoom === 10`.
4. Captured a high-zoom viewport screenshot.

Recording summary:

- 143 browser events.
- 9 `gpu-flow-frame` events.
- 5 recorded click events.
- Zoom range in frame diagnostics: `4.3` to `10`.
- Max frame render duration in `gpu-flow-frame`: `7.5 ms`.
- High-zoom retained page missing count max: `0`.
- High-zoom retained-content occlusion risk max: `0`.
- Render command count max: `1`.
- Render batch count max: `1`.
- Uploaded generic texture bytes: `19,533,824`.
- Uploaded texture count: `2`.
- Top uploaded surface: `gen-python-section`, tiled layout, one dirty
  resolution upload.
- Chrome DevTools console showed no runtime errors. Recorded console output was
  limited to Vite/React development messages and a React Router future flag
  warning.

Screenshots:

- `/tmp/setta-display-list-before-zoom.png`
- `/tmp/setta-display-list-zoomed.png`
- `/tmp/setta-display-list-recording-zoom10.png`

## Remaining Reproduction Gap

This recording verifies high-zoom display-list composition in the GPU-flow
canvas, but it is not the exact user settings-switch workflow. A settings-switch
recording should still be captured when that manual reproduction is available.
