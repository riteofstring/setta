# GpuFlow Retained Content Scroll Console Follow-Up

Date: 2026-05-06

## Scope

Follow-up verification for the retained-content scroll performance work on
`/settings`, after updating `@radix-ui/react-menubar` for React 19 compatibility.
This report closes the startup console error called out in
`2026-05-06_gpuflow-retained-content-scroll-performance-after.md`.

Chrome flags:

```sh
--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features
```

## Browser Check

- Route: `/settings`
- Viewport: `1200x672`
- CDP snapshot confirmed the Settings GpuFlow canvas and retained Settings
  surfaces were present.
- Console after navigation contained no React 19 `element.ref` errors and no
  retained/GPU runtime errors.
- Remaining console output:
  - Vite debug connection logs
  - React DevTools development info message
  - existing React Router v7 future-flag warning
  - existing form-field accessibility issue

The CDP page also imported the live GPU modules and resolved the target point
inside `settings-section__sectionSizingPolicy:param-content:unpinned`; the wheel
scroll resolver returned `changed: true` with the next retained offset
`{ x: 0, y: 120 }`.

## Verification

Focused tests:

```sh
pnpm -C frontend exec vitest run \
  src/components/AppHeader/ProjectNav.test.tsx \
  src/components/AppHeader/FollowAIToggleButton.test.tsx \
  src/components/Utils/atoms/menubar/menudropdown.test.tsx \
  src/gpuFlow/retainedContentScroll.test.ts \
  src/gpuFlow/interactions/retainedContentScroll.test.ts \
  src/gpuFlow/retainedContentScene.test.ts \
  src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx \
  src/gpuFlow/GpuRetainedContentSurfaces.test.tsx \
  src/gpuFlow/retainedContentScrollbar.test.ts
```

Result: `9 passed`, `60 tests passed`.

Filtered TypeScript check no longer reports errors in the touched retained
scroll or header/menubar files.

## Notes

The measured scroll-cadence results remain in
`2026-05-06_gpuflow-retained-content-scroll-performance-after.md`; this follow-up
only verifies that the prior React 19 menubar startup errors are gone. CDP
synthetic `requestAnimationFrame` callbacks did not fire in this session, so
this report does not supersede the earlier scroll FPS measurements.
