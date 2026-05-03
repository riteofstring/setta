# GpuFlow Retained Content Final Stabilization

Date: 2026-05-06

## Recording

- Final recording:
  `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260506-181252`
- Route: `/settings`
- Chrome flags:
  `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`
- Markers:
  - `phase7-final-r7-scroll-1200-start` / `phase7-final-r7-scroll-1200-end`
  - `phase7-final-r7-scroll-1440-start` / `phase7-final-r7-scroll-1440-end`
  - `phase7-final-r7-scrollbar-drag-start` / `phase7-final-r7-scrollbar-drag-end`
  - `phase7-final-r7-switch-start` / `phase7-final-r7-switch-end`
  - `phase7-final-r7-text-edit`
  - `phase7-final-r7-long-wrap`

## Results

- Retained/GPU console matches: `0`
- Page errors: `0`
- 1200x672 retained wheel window:
  - Retained offset: `y=0` to `y=800`
  - Frames: `22`
  - Approximate FPS over marked window: `16.39` for intentionally spaced
    wheel events
  - Frame gap average / median / p95 / max: `61.0ms / 66ms / 68ms / 70ms`
  - GPU frame duration average / median / p95 / max:
    `0.45ms / 0.2ms / 1.76ms / 2.0ms`
  - Uploads: max `1` uploaded node, total `1`; max `2` upload diagnostics,
    total `4`.
- 1440x900 retained wheel window:
  - Retained offset: `y=800` to `y=0`
  - Frames: `20`
  - Approximate FPS over marked window: `15.0` for intentionally spaced wheel
    events
  - Frame gap average / median / p95 / max: `66.68ms / 67ms / 70.2ms / 72ms`
  - GPU frame duration average / median / p95 / max:
    `0.35ms / 0.3ms / 0.62ms / 1.0ms`
  - Uploads: max `0` uploaded nodes, total `0`; max `0` upload diagnostics,
    total `0`.
- Scrollbar drag:
  - Retained offset: `y=0` to `y=373.296`
  - No retained scene source-metadata page errors after the metadata
    preservation fix.
- Switch animation:
  - Sampled progress moved through an intermediate active frame
    (`progress=0.586`, active source rect present) before settling at the final
    state.
- Text editing:
  - First activation focused CodeMirror retained editing content and inserted
    text (`text: "zqr"` in the marker).
- Long text:
  - `Section Tag Color Choices` was visible with a bounded retained preview
    after retained scroll offset `y=237`; row value length `336`.
  - Screenshot: `/tmp/gpuflow-phase7-r7-long-wrap.png`.

## Focused Verification

```sh
pnpm -C frontend exec vitest run src/gpuFlow/retainedContentScroll.test.ts src/gpuFlow/interactions/retainedContentScroll.test.ts src/gpuFlow/interactions/retainedContentInteraction.test.ts src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx src/gpuFlow/retainedContentScrollbar.test.ts src/gpuFlow/retainedContentScrollbarCanvas.test.ts src/gpuFlow/retainedContentTextLikeCanvas.test.ts src/gpuFlow/retainedContentSwitchCanvas.test.ts src/gpuFlow/retainedContentSwitchAnimation.test.ts src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/gpuFlow/GpuFlow/flowSurface.test.tsx src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamInteractionAdapter.test.tsx src/components/Pages/Project/GpuProjectSurface/projectGpuActiveParamDomIslandDeactivation.test.ts
```

Result: `13 passed`, `122 tests passed`.

Additional focused source-metadata regression:

```sh
pnpm -C frontend exec vitest run src/gpuFlow/retainedContentScrollbar.test.ts src/gpuFlow/retainedContentScene.test.ts
```

Result: `2 passed`, `26 tests passed`.

