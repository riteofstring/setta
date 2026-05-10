# GpuFlow Retained Content Scroll Performance After

Date: 2026-05-06

## Scope

This report covers the retained-content wheel scroll hot path on `/settings`
after commit `5cef308a3`:

- `settings-section__sectionSizingPolicy:param-content:unpinned`
- `settings-section__backend:param-content:unpinned`

The probe used continuous synthetic wheel events at an `8ms` interval over the
GpuFlow canvas. It was installed before app startup and recorded wheel listener
ownership, `requestAnimationFrame` gaps, long tasks, `requestPaint`, and
`GPUQueue.copyElementImageToTexture` calls.

Chrome flags:

```sh
--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features
```

## Code Changes Under Test

- Retained-content wheel flushes now request `texture-upload` frames instead
  of `viewport` frames.
- The wheel hot path computes a single changed surface offset and avoids
  cloning the full offset map per wheel event.
- Retained scene scroll updates reuse cached source metadata: row metrics, row
  order, content rect, and vertical-gap state.
- The project layout adapter keeps transient wheel offsets in a ref, so wheel
  scroll does not update React state for durable scene recomputation.
- Scroll-adjacent type guards were tightened for DOM islands, interaction
  options, and scrollbar visual targets.

## Results

| Viewport | Surface | Wheel events | Retained / pan handled | FPS | Frame gap p95 / max | Long tasks >50ms | Uploads |
| --- | --- | ---: | --- | ---: | --- | ---: | --- |
| `1200x672` | `sectionSizingPolicy` | 20 | `20 / 0` | `60.0` | `16.7ms / 16.7ms` | 0 | 10 full retained-source uploads, `25.6MB` |
| `1200x672` | `backend` | 10 | `10 / 0` | `60.0` | `16.8ms / 16.8ms` | 0 | 5 full retained-source uploads, `12.8MB` |
| `1440x900` | `sectionSizingPolicy` | 10 | `10 / 0` | `60.0` | `16.8ms / 16.8ms` | 0 | 5 full retained-source uploads, `28.8MB` |
| `1440x900` | `backend` | 10 | `10 / 0` | `60.0` | `16.8ms / 16.8ms` | 0 | 4 full retained-source uploads, `23.0MB` |

All clean retained samples uploaded only the affected retained-content source.
Boundary samples intentionally are not counted in the table because once a
retained surface hits its scroll boundary, later wheel events fall through to
viewport pan by design.

## Verification

Focused tests:

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow/retainedContentScroll.test.ts \
  src/gpuFlow/interactions/retainedContentScroll.test.ts \
  src/gpuFlow/retainedContentScene.test.ts \
  src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx \
  src/gpuFlow/GpuRetainedContentSurfaces.test.tsx \
  src/gpuFlow/retainedContentScrollbar.test.ts
```

Result: `6 passed`, `52 tests passed`.

Filtered TypeScript check no longer reports errors in the touched retained
scroll files. The repo still has unrelated ProjectGpu TypeScript failures, so a
full typecheck/quality gate is not clean yet.

CDP visual check: done on `/settings` at `1200x672` and emulated `1440x900`.
Retained scroll movement was visible and scrollbar thumbs stayed aligned.

## Remaining Risks

- The page still logs three React 19 `element.ref` errors at startup. They were
  present before this scroll slice, but they keep the broader "no page errors"
  acceptance gate red.
- Sustained retained scrolling still performs full retained-source uploads
  rather than dirty-strip uploads. The measured cost meets frame cadence for
  these Settings surfaces, but this remains the next risk if larger retained
  surfaces or higher-DPR windows regress.
- This report used an in-page CDP probe rather than a full Chrome repro bundle.
  A final sentinel pass should still record a Chrome repro bundle once the page
  error and source-rect upload questions are resolved.
