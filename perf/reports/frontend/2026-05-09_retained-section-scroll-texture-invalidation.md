# Retained Section Scroll Texture Invalidation

Date: 2026-05-09

## Code Paths

- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentSources.tsx`
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/gpuFlow/htmlSurfaces/paintInvalidation.ts`
- `frontend/src/gpuFlow/htmlSurfaces/sourceLayer.tsx`
- `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`

## Scenario

Settings page GPU flow view, scrolling retained parameter content inside settings sections.

## Before

Chrome recording:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260509-155123`

Follow-up Chrome recording after the retained-only fix:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260509-160143`

The final section scrolls repeatedly refilled the texture dirty backlog during retained-content scroll/draw work:

- `remainingDirtyNodeCount` jumped back toward `46`.
- Follow-up frames drained only two texture uploads per frame.
- Upload diagnostics showed unrelated settings section surfaces with `reasons: ["paint"]`, not only the scrolled retained content surface.
- The follow-up recording still showed `remainingDirtyNodeCount=46` on the last section scrolls, with unrelated settings section surfaces queued by wrapper paint invalidation.

Focused regression before the fix:

- One retained source redraw dirtied `dict-a:param-content:unpinned`, then the emulated native full-paint path dirtied both `dict-a:param-content:unpinned` and `dict-b:param-content:unpinned`.
- Observed dirty sequence: `["dict-a:param-content:unpinned", "dict-a:param-content:unpinned", "dict-b:param-content:unpinned", "dict-b:param-content:unpinned", "dict-a:param-content:unpinned", "dict-b:param-content:unpinned"]`.

## After

Focused regression after the fix:

- One retained source redraw dirties only `dict-a:param-content:unpinned`.
- Stable sibling retained canvases do not redraw when the scene wrapper changes but their own retained scene and geometry are unchanged.
- Retained scroll redraws request texture upload directly and do not request a broad native canvas paint.
- Direct browser paint events on GPU HTML source wrappers are ignored when the source is explicitly dirty-owned, while descendant content paints and active source-rect hints still mark real content dirty.

Behavioral regression after the final source-host fix:

- `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts` opens `/settings`, switches to `All Settings`, waits for many retained rows, wheels over `settings-section__sectionSizingPolicy:param-content:unpinned`, samples browser frames during the gesture, and inspects GPU frame summaries.
- Before the source-host fix, the same test failed with `maxDirtyBacklog=46`.
- After the source-host fix, the test passed with the dirty backlog threshold `<=3`, no unrelated retained uploads, and sampled frame intervals below the guardrail.

Verification:

`pnpm -C frontend exec vitest run src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/gpuFlow/GpuFlow/retainedContentSources.test.tsx src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx src/gpuFlow/interactions/retainedContentScroll.test.ts src/gpuFlow/retainedContentScroll.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts`

Result: 7 files, 74 tests passed.

`pnpm -C frontend exec vitest run src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/gpuFlow/GpuFlow/retainedContentSources.test.tsx src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx src/gpuFlow/interactions/retainedContentScroll.test.ts src/gpuFlow/retainedContentScroll.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts src/components/Pages/Project/GpuProjectSurface/projectGpuFramePerformance.test.ts`

Result: 9 files, 79 tests passed.

`./scripts/run-playwright-e2e.sh settings/settings-retained-scroll-performance.spec.ts`

Result: 1 test passed.

`./scripts/quality/check.sh`

Result: passed.

## Long-Term Texture Window Fix

The latest follow-up recording showed the broad retained-section invalidation was no longer the dominant problem, but the final section scrolls still redrew and reuploaded the full retained canvas on each scroll step.

The retained section source now renders into a larger scroll window and keeps the DOM/canvas texture stable while the visible source rect moves through that window. Scrolls that stay inside the window update the visual texture coordinates and redraw only the scrollbar strip, so the next frame uploads a small source rect instead of the full retained content texture. Both the React-driven surface layout path and the imperative wheel-scroll path update the same texture source rect metadata before requesting a frame.

The HTML surface renderer now carries `textureSourceRect` through flat and tiled visuals. Flat quads get source-rect UV coordinates, tiled quads clip to the visible source rect, and dirty texture uploads can use the same source rect for both single-texture and tiled records.

Behavioral guardrail:

- `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts` now performs the user action directly: open `/settings`, switch to `All Settings`, wheel-scroll a retained overflow section repeatedly, sample browser frame intervals, and inspect GPU frame summaries.
- The test fails if the scroll burst refills the texture backlog, uploads unrelated retained sections, uploads a full target retained texture, or produces a worst sampled frame over the guardrail.

Final verification:

`pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/gpuPipelines.test.ts src/gpuFlow/htmlSurfaces/textures.test.ts src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/gpuFlow/GpuFlow/retainedContentSources.test.tsx src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/surfaceVisuals.test.ts src/gpuFlow/retainedContentScene.test.ts src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx`

Result: 9 files, 119 tests passed.

`./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`

Result: 1 test passed.

`./scripts/quality/check.sh`

Result: passed.

`git diff --check`

Result: passed.

## Visual Regression Follow-Up

The 2026-05-09 17:16 Chrome recording and screenshot showed the retained `shortcuts` section visually compressing a large retained source into the visible section area.

Cause:

- `GpuHtmlSurfaceOverlayLayout` carried `textureCssHeight`, `textureCssWidth`, and `textureSourceRect`.
- `toGpuHtmlSurfaceOverlayNodeLayouts` preserved those values.
- `collectVisibleGpuNodeQuads` then dropped them while converting layouts into visible quads.
- The texture manager therefore registered the retained source using the visible section size even though the real retained source canvas was a larger texture window. The upload path scaled the larger source into the smaller registered texture, producing the “entire content fit into the displayed area” artifact.

Fix:

- `collectVisibleGpuNodeQuads` now preserves retained texture metadata when it emits visible quads.
- `frame.test.tsx` now asserts retained overlay texture metadata survives culling.
- The settings retained scroll Playwright test now takes before/after screenshot crops of the retained scroll target, attaches them to the test, and checks text-band density so visually compressed retained content is covered along with the frame/upload assertions.

Verification:

`pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/gpuPipelines.test.ts src/gpuFlow/htmlSurfaces/textures.test.ts src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/gpuFlow/GpuFlow/retainedContentSources.test.tsx src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/surfaceVisuals.test.ts src/gpuFlow/retainedContentScene.test.ts src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx`

Result: 9 files, 120 tests passed.

`./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`

Result: 1 test passed and captured retained target screenshots.

`./scripts/quality/check.sh`

Result: passed.

CDP visual check:

- Screenshot: `/tmp/setta-settings-retained-scroll-fixed.png`
- Zoomed screenshot: `/tmp/setta-settings-retained-scroll-fixed-zoomed.png`
- `settings-section__shortcuts:param-content:unpinned` retained source reported `canvasCssHeight: "1488px"` and `canvasAttrHeight: 2976`, confirming it is registered as a texture window rather than a viewport-sized squashed texture.
