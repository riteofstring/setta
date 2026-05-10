# GpuFlow Wheel Scroll Ownership Verification

Date: 2026-05-06

Branch: `go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan-full-scene`

Implementation commit: `88e3a35c6 gpuflow-scroll: fix wheel scroll ownership`

Plan: `docs/plans/gpuflow-wheel-scroll-ownership-plan.md`

## Commands

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow/interactions/retainedContentScroll.test.ts \
  src/gpuFlow/interactions/sceneScroll.test.ts \
  src/gpuFlow/interactions/panZoom.test.ts \
  src/gpuFlow/retainedContentScroll.test.ts \
  src/gpuFlow/sceneScroll.test.ts
```

Result: passed, 5 files, 57 tests.

```sh
./scripts/quality/check.sh --files \
  frontend/src/gpuFlow/interactions/retainedContentScroll.ts \
  frontend/src/gpuFlow/interactions/sceneScroll.ts \
  frontend/src/gpuFlow/interactions/wheelOwnership.ts \
  frontend/src/gpuFlow/retainedContentScroll.ts \
  frontend/src/gpuFlow/sceneScroll.ts \
  frontend/src/gpuFlow/interactions/retainedContentScroll.test.ts \
  frontend/src/gpuFlow/interactions/sceneScroll.test.ts \
  frontend/src/gpuFlow/retainedContentScroll.test.ts \
  frontend/src/gpuFlow/sceneScroll.test.ts
```

Result: passed.

```sh
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Browser target: `http://127.0.0.1:3019/settings`

## CDP Retained-Content Evidence

Target retained surface:
`settings-section__sectionSizingPolicy:param-content:unpinned`

Target surface geometry:

```json
{
  "rect": { "x": 0, "y": 661, "width": 552, "height": 291 },
  "clipRect": { "x": 0, "y": 661, "width": 551, "height": 290 },
  "viewportRect": { "x": 0, "y": 0, "width": 552, "height": 291 },
  "contentRect": { "x": 0, "y": 0, "width": 552, "height": 5072 },
  "maxOffset": { "x": 0, "y": 4781 }
}
```

Active viewport pan continued over retained content:

```json
{
  "beforeTransform": [339.68852124875036, -550.0113192360529, 0.997180673333085],
  "afterEmptyWheelTransform": [339.68852124875036, -590.0113192360529, 0.997180673333085],
  "afterRetainedWheelTransform": [339.68852124875036, -630.0113192360529, 0.997180673333085],
  "beforeRetainedOffset": { "x": 0, "y": 0 },
  "afterRetainedOffset": { "x": 0, "y": 0 },
  "retainedWheelDefaultPrevented": true,
  "pass": true
}
```

Retained boundary wheel did not fall through to viewport pan:

```json
{
  "beforeExtraTransform": [339.68852124875036, -630.0113192360529, 0.997180673333085],
  "afterExtraTransform": [339.68852124875036, -630.0113192360529, 0.997180673333085],
  "beforeExtraOffset": { "x": 0, "y": 4781 },
  "afterExtraOffset": { "x": 0, "y": 4781 },
  "extraWheelDefaultPrevented": true,
  "pass": true
}
```

## CDP Section-Scene Evidence

The current `/settings` scene did not expose section-scene scroll candidates:

```json
{
  "sectionSceneCandidateCount": 0,
  "sectionSceneCandidates": []
}
```

To verify the section-scene controller in-browser, a temporary harness on the
same `/settings` page imported the production Vite modules for
`attachGpuSectionSceneScrollController`, `attachGpuPanZoomController`,
`resolveGpuFlowSceneLayout`, and `createGpuFlowViewportStore`. The harness used
a vertical parent scene with three children and max section scroll offset
`y = 66`.

Active viewport pan continued over a section-scene target:

```json
{
  "beforeTransform": [0, 0, 1],
  "afterTransform": [0, -30, 1],
  "beforeSectionOffset": { "x": 0, "y": 0 },
  "afterSectionOffset": { "x": 0, "y": 0 },
  "wheelDefaultPrevented": true,
  "pass": true
}
```

Section-scene boundary wheel did not fall through to viewport pan:

```json
{
  "beforeTransform": [0, 0, 1],
  "afterTransform": [0, 0, 1],
  "beforeSectionOffset": { "x": 0, "y": 66 },
  "afterSectionOffset": { "x": 0, "y": 66 },
  "wheelDefaultPrevented": true,
  "pass": true
}
```

## Console

Final repro page console after reload:

- Vite connected debug messages.
- React DevTools informational message.
- React Router future flag warning.
- Accessibility issue: form fields missing id/name.
- No console errors, retained-content errors, or GPU errors during the final
  repro run.

## Notes

Viewport screenshots were captured locally during the CDP visual check:

- `perf/reports/frontend/gpuflow-wheel-scroll-ownership-settings-before.png`
- `perf/reports/frontend/gpuflow-wheel-scroll-ownership-settings-after.png`

Those screenshot files are ignored by git, consistent with existing screenshot
artifact handling in `perf/reports/frontend`.
