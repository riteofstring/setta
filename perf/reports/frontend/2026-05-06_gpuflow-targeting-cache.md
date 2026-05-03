# GpuFlow Targeting Cache

Date: 2026-05-06

## Scope

Investigated pan/zoom and node-interaction hot paths for dense HTML-in-canvas scenes, with the All Settings page shape in mind: many nested controls, scroll regions, switches, text fields, and sliders inside a small number of large section surfaces.

The current pan/zoom path already follows the key html-in-canvas invariant: viewport-only movement does not upload textures, request paint, force React renders, or rewrite every source DOM transform during the active gesture. The main remaining local interaction cost was target discovery before native event handoff.

## External Examples Reviewed

- `html-in-canvas-official`: direct canvas children, explicit `requestPaint`, `paint.changedElements`, and `copyElementImageToTexture`; CSS transforms are ignored for rendering but affect hit testing/accessibility.
- `webgpu-jelly-slider`: input handlers update DOM and call `canvas.requestPaint()` for live slider feedback.
- `multi-element-composition`: native DOM hit testing walks topmost canvas children and skips form controls during drag gestures.
- `3d-room-live-content`: source/staging DOM must remain laid out and painted; `display:none`, `visibility:hidden`, `opacity:0`, offscreen positioning, and clipping strategies can produce blank paint records.
- `html-cloth`: projects pointer coordinates into source-local DOM, handles sliders explicitly, and reasserts focus when the WebGL canvas steals it.
- `three-html-render`: matrix transforms live DOM for native events, useful for 3D, but not appropriate for Setta's current pan/zoom invariant because it would rewrite source transforms every frame.

## Baseline And After

Local jsdom benchmark: one visible node with 1,500 nested inputs, one explicit wheel region, one scrollable descendant containing 1,500 children, and 50 repeated pointer + wheel handoff pairs at the same locations.

| Version | Elapsed | Root `querySelectorAll` calls |
| --- | ---: | ---: |
| Before | 5732.90 ms | 100 |
| After candidate-list cache | 4350.19 ms | 2 |
| After candidate-list + last-target cache | 1609.87 ms | 2 |

Notes:

- The root selector counter intentionally measured the expensive repeated node-root scans. The wheel-region descendant scan is also cached; regression tests assert that repeated wheel handoffs reuse the existing scroll target.
- This microbenchmark is not a browser rendering benchmark. It isolates the DOM-targeting work that happens before source projection and native event dispatch.

## Changes

- Cached node ID maps and hit scenes by stable node/visual-scene object identity.
- Cached sorted hit-surface entries per hit-scene object.
- Cached interactive, explicit wheel, and descendant candidate lists per source root with `MutationObserver` invalidation and synchronous `takeRecords()` flushing before reuse.
- Cached the last resolved interactive target and wheel/scroll target when the next event is still inside the same element.
- Reused the source root rect within a targeting pass instead of reading it once per candidate.
- Cleared source-root targeting cache when a GpuFlow node source is removed.

## Remaining Work

- Add a browser benchmark project that combines the All Settings page density with sliders, text fields, and nested scroll regions. Use the existing CDP/probe path to record p95/p99 handoff latency, frame time, upload counts, and paint requests.
- Evaluate an `elementsFromPoint` path only for projected pointerdown/click handoff. It may avoid scanning all controls, but it should not be used for passive hover unless profiling shows source projection is cheaper and does not violate the no-transform-rewrite pan/zoom path.
- Continue the larger scene-ownership work: highly repeated parameter rows and scroll regions should eventually become renderer-owned primitives with DOM only for active editing islands.
