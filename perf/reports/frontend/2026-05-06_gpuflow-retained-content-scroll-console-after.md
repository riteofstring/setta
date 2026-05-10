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

## Fresh Chrome Repro

- Recording:
  `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260506-225108`
- Recorder event count: `397`
- Wheel events on `/settings`: `92`
- Console levels in the bundle: `2 debug`, `2 info`, `2 warn`, `0 error`
- React 19 `element.ref` errors in the bundle: `0`
- Retained target resolved before input:
  `settings-section__sectionSizingPolicy:param-content:unpinned`
- First retained wheel segment:
  - Window: `904ms`
  - Frames: `27`
  - Viewport stayed fixed at `y=-110`, confirming retained-content handling
    rather than viewport pan.
  - GPU frame duration average / p95 / max: `0.43ms / 0.7ms / 0.7ms`
  - Upload diagnostics per frame: `1`
  - Long tasks during retained wheel segment: `0`
- After the retained surface reached its scroll boundary, later wheel events
  fell through to viewport pan by design.

This repro was CDP-driven with `Input.dispatchMouseEvent`, so the observed input
cadence was about `33ms` per wheel event. It is useful as a fresh console and
boundary-behavior artifact, but it does not replace the earlier scroll-FPS
measurement.

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
verifies that the prior React 19 menubar startup errors are gone and records a
fresh Chrome repro bundle after the fix. CDP synthetic `requestAnimationFrame`
callbacks did not fire in the MCP session, so this report does not supersede the
earlier scroll FPS measurements.
