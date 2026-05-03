# GpuFlow Visual Fidelity Checkpoint Review

Generated: 2026-05-05T15:15:52.583Z

## Summary

- Compared: baseline-primary vs candidate
- Fixtures compared: 30
- Pass: 28
- Blocking regression: 2
- Capture blocked: 0
- Runtime page error groups: 2

## Runtime Signals

- baseline-primary: 30 captures, 70 page errors, 5 console warnings/errors.
  - page error x70: TypeError: Failed to execute 'copyElementImageToTexture' on 'GPUQueue': The provided value is not of type 'GPUImageCopyTextureTagged'. at uploadHtmlSurfaceTextureRecord (http://127.0.0.1:3077/src/gpuFlow/htmlSurfaces/textureTiles.ts:58:40) at HtmlSurfaceTextureManager.uploadRecord (http://127.0.0.1:3077/src/gpu
  - console x3: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x2: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
- candidate: 30 captures, 66 page errors, 7 console warnings/errors.
  - page error x66: TypeError: Failed to execute 'copyElementImageToTexture' on 'GPUQueue': The provided value is not of type 'GPUImageCopyTextureTagged'. at uploadHtmlSurfaceTextureRecord (http://127.0.0.1:3077/src/gpuFlow/htmlSurfaces/textureTiles.ts:58:40) at HtmlSurfaceTextureManager.uploadRecord (http://127.0.0.1:3077/src/gpu
  - console x3: Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.
  - console x2: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
  - console x2: Failed to load resource: the server responded with a status of 403 (Forbidden)

## Fixture Results

| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |
| --- | --- | --- | --- | ---: | ---: |
| project-surface | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| param-controls-closed | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| dense-param-dict | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0186 | 1.46 |
| callable-edge-handles | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0186 | 1.46 |
| selection-resize | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| dropdown-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| color-picker-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| date-calendar-open | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| native-text-island | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| drag-preview | desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0035 | 0.28 |
| project-surface | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| param-controls-closed | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| dense-param-dict | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0186 | 1.46 |
| callable-edge-handles | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0186 | 1.46 |
| selection-resize | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| dropdown-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| color-picker-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| date-calendar-open | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| native-text-island | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| drag-preview | compact-desktop | pass | Automated pixel diff is within checkpoint tolerance. | 0.0059 | 0.46 |
| project-surface | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |
| param-controls-closed | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |
| dense-param-dict | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0268 | 2.10 |
| callable-edge-handles | narrow | blocking-regression | Automated pixel diff exceeds checkpoint tolerance. | 0.0268 | 2.10 |
| selection-resize | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |
| dropdown-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |
| color-picker-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |
| date-calendar-open | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |
| native-text-island | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |
| drag-preview | narrow | pass | Automated pixel diff is within checkpoint tolerance. | 0.0140 | 1.10 |

## Prioritized Visual-Fix List

- dense-param-dict / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- callable-edge-handles / narrow: blocking-regression - Automated pixel diff exceeds checkpoint tolerance.
- baseline-primary: runtime page error x70 - TypeError: Failed to execute 'copyElementImageToTexture' on 'GPUQueue': The provided value is not of type 'GPUImageCopyTextureTagged'. at uploadHtmlSurfaceTextureRecord (http://127.0.0.1:3077/src/gpuFlow/htmlSurfaces/textureTiles.ts:58:40) at HtmlSurfaceTextureManager.uploadRecord (http://127.0.0.1:3077/src/gpu
- candidate: runtime page error x66 - TypeError: Failed to execute 'copyElementImageToTexture' on 'GPUQueue': The provided value is not of type 'GPUImageCopyTextureTagged'. at uploadHtmlSurfaceTextureRecord (http://127.0.0.1:3077/src/gpuFlow/htmlSurfaces/textureTiles.ts:58:40) at HtmlSurfaceTextureManager.uploadRecord (http://127.0.0.1:3077/src/gpu

## Notes

- `pass` means the automated pixel diff is within the temporary tolerance.
- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.
- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.
