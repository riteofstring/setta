# Retained Canvas Texture Lifecycle Plan

## Goal
Make retained HTML-in-canvas section contents stable, sharp at zoom, and
operable after repeated zoom, scroll, hover, and control interactions.

This is a replacement plan, not a compatibility plan. Do not add legacy support,
dual paths, old-field aliases, transitional adapters, feature flags for old/new
texture behavior, or silent fallbacks. Replace the current mutable texture
lifecycle with a coherent committed/pending snapshot model and delete the old
ownership once the replacement is verified.

## Current Evidence
The latest Chrome recording analyzed for this plan is:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260510-140301`

The recording shows a systemic retained-surface lifecycle problem, not an
isolated switch-control bug.

- 764 GPU frames were recorded.
- 209 frames requested texture upload work.
- 113 texture-upload frames uploaded nothing.
- 107 no-op texture-upload frames were `manual+texture-upload` while the dirty
  node count was zero.
- Zoom ranged from `0.4` to `3.6`; visible retained section count dropped as
  expected during viewport culling, but texture uploads continued after zoom
  settled.
- Several zoom phases caused full resolution uploads and single-to-tiled layout
  transitions for retained settings surfaces.
- Hover redraws for `settings-section__gui:param-content:unpinned` expanded up
  to `552x168`, then those content uploads interleaved with resolution uploads.
- High-zoom content looked blurry before replacement uploads completed.

## External Example Repositories Reviewed
Relevant examples were reviewed under:

`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos`

Useful references:

- `html-in-canvas-official/README.md`
  - The WICG explainer states that child snapshots are recorded before the
    `paint` event, calls inside `paint` use the current-frame snapshot, calls
    outside `paint` use the previous snapshot, and drawing before an initial
    snapshot can throw.
  - Its basic example sizes the canvas backing grid from
    `ResizeObserverEntry.devicePixelContentBoxSize` to prevent blurriness.
- `html-in-canvas-cracks/README.md` and
  `html-in-canvas-cracks/src/main.js`
  - The demo documents "texture reflow, not geometry rescale": geometry remains
    in CSS pixels while the source texture reflows and resizes.
  - It explicitly handles fixed-size GPU texture allocation on resize; reusing a
    differently sized source against an old GPU allocation produces stretched or
    squished content.
  - It uses a first-paint readiness handoff so the scene never samples an
    uninitialized HTML texture.
- `html-in-canvas-dot-dev/src/content/demos/3d-room-live-content/demo.html`
  - The demo uses a `layoutsubtree` staging canvas and a regular mirror canvas
    for upload, separating browser paint capture from renderer texture upload.
  - It treats `requestPaint()` plus explicit pixel copy as the synchronization
    boundary before marking the GPU texture dirty.
- `html-in-canvas-dot-dev/src/content/demos/offscreen-canvas-worker/demo.html`
  - The demo measures the source element before mutating canvas dimensions, then
    waits for `onpaint` before reading pixels. This avoids invalidating layout
    mid-capture and reading stale pixels.
- `three-html-render/src/htmlTexture.ts`,
  `three-html-render/src/interactionManager.ts`, and
  `three-html-render/src/raycastInteractionManager.ts`
  - `HTMLTexture` keeps the source element identity separate from the captured
    image/canvas. That maps well to keeping Setta's logical retained surface
    identity separate from committed texture snapshots.
  - The interaction managers position real DOM elements from matrix or UV
    mapping so browser hit testing remains native and independent of texture
    upload freshness.
- `random-stuff/apps/curved-markup/src/App/index.tsx`
  - The demo manually owns the GL texture handle and uploads from
    `texElementImage2D`, while pointer interaction maps raycast UVs back to the
    real DOM element. The main idea to borrow is explicit upload ownership plus
    interaction decoupling, not the Three.js-specific implementation.
- `compiz-web/src/transitions/TransitionEngine.ts`
  - The transition engine waits for a paint-ready state before starting a
    texture-dependent transition. Setta should borrow the readiness gate, not
    the demo's every-frame full-page upload loop.

Ideas not to borrow:

- Do not add a polyfill, SVG `foreignObject` fallback, Three.js renderer, or
  compatibility path. Setta already targets Chromium's HTML-in-canvas/WebGPU
  path.
- Do not upload full retained pages every frame. Several demos do this because
  they are visual experiments; Setta needs typed dirty work, upload budgets, and
  stable committed snapshots.
- Do not make DOM overlays the source of truth for retained settings controls.
  The useful idea is native interaction decoupling; Setta's retained scene and
  Go-owned settings contracts remain the owner.

## Root Cause
The retained canvas pipeline currently lets multiple concerns mutate or consume
the same texture record at different lifecycle phases.

- `frontend/src/gpuFlow/htmlSurfaces/textures.ts` mutates live texture metadata
  such as CSS dimensions when a surface is registered at a new resolution.
- `frontend/src/gpuFlow/htmlSurfaces/surfaceVisuals.ts` computes texture
  coordinates from the live texture record used by the renderer.
- Pending resolution uploads can exist at the same time the committed texture is
  still the only complete visual resource.
- Retained source windows are derived from scroll and clip state in
  `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`, but source-window
  changes are not represented as an atomic visual snapshot.
- Content redraws, hover redraws, switch animation redraws, resolution changes,
  source-window changes, upload scheduling, and interaction hit testing are all
  coupled through mutable surface state.

That means old pixels can be sampled with new dimensions or source coordinates
while a pending replacement is still uploading. The user-visible result is
brief disappearance, apparent content reset, stale or blurry content, no-op
upload churn, and occasional interaction instability after zoom or scroll.

## Desired Model
Treat every retained content texture as a versioned snapshot.

Each retained surface should have:

- a logical surface identity, such as
  `settings-section__gui:param-content:unpinned`
- a committed visual snapshot used by the renderer
- zero or one pending visual snapshot being uploaded
- explicit dirty work items targeting a snapshot version
- explicit interaction state that does not depend on texture upload freshness

A committed snapshot owns all visual sampling metadata:

- texture tiles and layout
- CSS dimensions
- pixel dimensions
- resolution scale and zoom bucket
- source window and source rect
- content version
- geometry version
- last fully uploaded frame

A pending snapshot owns the same fields independently. The renderer must not
read pending metadata until the pending snapshot is complete and committed.

## Non-Negotiable Invariants
- A visible surface is rendered only from a complete committed snapshot.
- The committed snapshot descriptor is immutable after commit.
- The pending snapshot descriptor is not used for visual sampling until commit.
- A resolution or source-window replacement commits atomically.
- The old committed snapshot remains visible while a replacement uploads.
- Hit testing and switch clicks use logical retained scene data, not texture
  upload completion.
- Texture upload work reads only from a paint-ready source snapshot. If the
  browser has not produced a current paint record, work is explicitly blocked
  on paint rather than treated as uploaded or empty.
- A texture-upload frame is requested only when uploadable work exists, or the
  frame diagnostics explicitly report the deferral owner.
- No texture-upload loop may continue with zero dirty work and zero deferred
  work.
- Zoom-resolution upgrades improve sharpness without blanking or resetting
  committed content.

## Zoom Resolution Policy
Zoom blur should be fixed by making resolution an explicit policy, not by
forcing arbitrary repaint on every wheel event.

Use an effective content scale:

`targetScale = clamp(devicePixelRatio * viewportZoom, minScale, maxScale)`

The WICG examples size canvas backing buffers from
`devicePixelContentBoxSize` to avoid baseline blur. Setta should use the same
principle, then add viewport zoom on top: the committed snapshot descriptor
must record both CSS size and pixel size so the renderer can tell whether a
surface is merely scaled temporarily or has actually been upgraded to a sharper
texture.

Convert that scale into stable zoom buckets with hysteresis. The exact bucket
values should be chosen from measured upload cost, but the policy should avoid
thrashing near boundaries. A surface only needs a new resolution snapshot when
it crosses a bucket boundary outside the hysteresis band.

During active wheel zoom:

- keep rendering the current committed snapshot, even if it is temporarily
  scaled and blurry
- keep pointer hit testing based on logical scene geometry
- defer non-interactive resolution upgrades until viewport interaction settles
- allow only small interactive content updates for active controls if needed

After zoom settles:

- schedule visible retained surfaces for higher-resolution pending snapshots
- prioritize the hovered, focused, or active retained surface first
- upload visible-window tiles before offscreen cache tiles
- commit each pending snapshot only when all required visible tiles are ready
- optionally continue uploading offscreen cache tiles after the visible commit

At extreme zoom or under memory pressure, prefer a high-resolution visible
window over a lower-resolution full content cache. The policy should keep the
screen sharp where the user is looking before spending budget on offscreen
retained rows.

## Replacement Architecture

### 1. Snapshot Types
Replace the current mutable `HtmlSurfaceTextureRecord` shape with explicit
snapshot records.

Suggested concepts:

- `HtmlSurfaceTextureHandle`: stable per-surface owner record
- `CommittedHtmlSurfaceTextureSnapshot`: immutable renderer-facing snapshot
- `PendingHtmlSurfaceTextureSnapshot`: independently uploaded replacement
- `HtmlSurfaceTextureWorkItem`: content, animation, hover, resolution, or
  source-window work tied to a target snapshot version

The handle can mutate its pointer to the committed snapshot. The committed
snapshot itself cannot mutate.

Delete direct mutation of committed CSS dimensions, pixel dimensions,
resolution scale, zoom bucket, tile layout, and source rect during registration.
Registration should produce either no work or a pending snapshot request.

### 2. Atomic Commit
Resolution and source-window changes must stage into a pending snapshot.

The commit sequence should be:

1. Resolve target descriptor from logical surface, source window, viewport zoom,
   device pixel ratio, and texture constraints.
2. If the committed descriptor already matches, schedule only content work.
3. If descriptor differs, create or reuse a pending snapshot with its own tiles.
4. Upload pending visible tiles under the upload budget.
5. Keep rendering the previous committed snapshot while pending is incomplete.
6. Commit by swapping the committed snapshot pointer to the pending snapshot.
7. Destroy the previous snapshot after the renderer no longer references it.

Do not mutate the committed snapshot halfway through this sequence.

### 3. Source Window Ownership
Represent retained source-window changes as first-class descriptor changes.

`GpuRetainedContentTextureWindow` should become part of the snapshot descriptor.
Scroll and zoom may propose a new window, but the renderer keeps using the
committed window until a compatible pending snapshot is ready.

Add cache-window hysteresis:

- minor scroll inside the current cache window should update transforms and
  source rects without recreating the whole texture
- crossing a cache threshold should request a pending source-window snapshot
- cache movement should be row-aligned where possible
- source-window descriptors should be stable enough that small wheel deltas do
  not repeatedly invalidate pending work

Follow the `html-in-canvas-cracks` lesson of texture reflow rather than geometry
rescale: retained surface geometry remains in CSS pixels, while the source
window and pixel buffer are updated through descriptors. If the pixel dimensions
change, allocate a matching pending GPU texture instead of uploading a new-size
source into an old-size allocation.

### 4. Paint-Ready Source Staging
Make browser paint readiness an explicit prerequisite for texture upload.

The official examples and the dot-dev worker demo both rely on this ordering:
measure source geometry first, request paint when needed, draw/capture inside
`paint`, then upload or transfer pixels. Setta should model this as scheduler
state instead of incidental control flow.

Rules:

- a dirty work item that needs fresh source pixels starts as `blocked-on-paint`
  until the matching source surface has painted
- changing a source canvas backing size invalidates its paint readiness
- upload diagnostics must identify blocked-on-paint surfaces
- the renderer keeps using the previous committed snapshot while source paint
  is pending
- first-visible retained surfaces use an explicit first-paint handoff so the
  visual scene never samples an uninitialized texture

For Setta's WebGPU path, the source canvas can remain the authoritative staging
surface. A separate mirror canvas should be added only if Chromium's
`layoutsubtree` source canvases prove unreliable under WebGPU upload in our
verification. Do not add a mirror as a compatibility fallback preemptively.

### 5. Dirty Work Separation
Replace broad dirty booleans with typed work items.

Required work categories:

- `content`: source pixels changed without changing descriptor
- `hover`: row hover visual changed
- `animation`: switch or retained-control animation changed
- `resolution`: zoom bucket or DPR changed
- `source-window`: scroll/cache window changed
- `geometry`: CSS size changed

Rules:

- `content`, `hover`, and `animation` target the committed snapshot unless a
  compatible pending snapshot already exists and needs the same source pixels.
- `resolution`, `source-window`, and `geometry` target a pending snapshot.
- A pending replacement is allowed to incorporate content changes, but content
  changes must not restart already uploaded resolution tiles unless the
  descriptor changed.
- Dirty source rects should remain row-bounded for hover. Do not let recent
  hover history expand into large stale upload regions after zoom or scroll.

### 6. Scheduler State Machine
Replace implicit frame reasons with an upload scheduler that knows whether work
is uploadable, deferred, or blocked.

The scheduler should expose:

- uploadable work count
- deferred work count and reason
- blocked work count and owner, such as waiting for browser paint
- pending visible replacement count
- pending offscreen/cache work count
- next requested frame reason

Frame requests should obey:

- request `texture-upload` when uploadable work exists
- request `paint` when source canvas paint is required before upload
- request `viewport` for viewport transform changes
- request no frame when all queues are empty

No-op texture-upload loops should be impossible by construction. Add an
assertion or diagnostic that fires if a texture-upload frame completes with no
uploaded work, no deferred work, and no blocked work.

### 7. Interaction Decoupling
Retained interaction should operate from the logical retained scene and committed
layout geometry, not from texture upload state.

Switch clicks, hover detection, row selection, retained scrollbars, and DOM
islands should remain operable while high-resolution texture replacement is
pending. A missing or incomplete pending snapshot must never make a retained
control stop accepting input.

Borrow from `three-html-render` and `curved-markup` at the architectural level:
keep the real interactive target mapped from logical geometry, and treat the
texture as a visual copy. Setta does not need their Three.js raycasting, but it
does need the same separation between source element identity, visual snapshot,
and interaction ownership.

### 8. Renderer Read Boundary
Make the renderer accept committed snapshots only.

`buildTexturedGpuNodeQuads` and `buildHtmlSurfaceVisuals` should receive a
renderer-facing committed snapshot descriptor. They should not be able to see
pending descriptor fields. This boundary is the main guard against old pixels
being sampled with new dimensions.

## Implementation Phases

### Phase 1: Add Diagnostics And Invariant Tests
Before changing behavior, add diagnostics that prove the current failure mode
and protect the replacement.

Add frame/app-state fields for:

- committed snapshot version and descriptor
- pending snapshot version and descriptor
- target descriptor requested by the current frame
- dirty work counts by type
- uploadable/deferred/blocked work counts
- source-window/cache-window descriptor
- zoom bucket and target content scale
- no-op texture-upload reason, if any

Add Vitest coverage for the texture manager invariants:

- registering a new resolution does not mutate the committed descriptor
- pending descriptor uploads progress monotonically across repeated
  registrations
- content dirtiness does not restart completed pending resolution tiles when the
  descriptor is unchanged
- a completed pending snapshot commits atomically
- no texture-upload frame is requested when all queues are empty

### Phase 2: Introduce Snapshot Records And Remove Mutable Commit State
Refactor the texture manager around committed and pending snapshots.

Expected owner files include:

- `frontend/src/gpuFlow/htmlSurfaces/textures.ts`
- `frontend/src/gpuFlow/htmlSurfaces/texturePendingResolution.ts`
- `frontend/src/gpuFlow/htmlSurfaces/textureTiles.ts`
- `frontend/src/gpuFlow/htmlSurfaces/textureDirtyTiles.ts`
- `frontend/src/gpuFlow/htmlSurfaces/surfaceVisuals.ts`
- `frontend/src/gpuFlow/htmlSurfaces/frame.tsx`

Delete the old behavior where live texture records are partially updated during
registration. The first replacement milestone is passing unit tests with the
renderer still receiving only committed snapshots.

### Phase 3: Promote Source Window To Snapshot Descriptor
Move retained source-window and cache-window state into the descriptor used for
snapshot comparison.

Expected owner files include:

- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/gpuFlow/GpuFlow/retainedContentSources.tsx`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllerSurfaceUpdates.ts`

Add hysteresis for cache-window movement and ensure small scroll deltas do not
invalidate full retained content textures unnecessarily.

### Phase 4: Implement Zoom-Aware Resolution Buckets
Add the stable zoom-resolution policy.

Requirements:

- high zoom schedules higher-resolution visible retained surfaces
- active zoom does not blank committed content
- post-zoom upgrades improve sharpness once uploads complete
- bucket hysteresis prevents repeated resolution churn
- upload budget prioritizes visible tiles and active/hovered surfaces
- memory policy prefers sharp visible-window tiles over low-value offscreen
  cache tiles

Measure before and after on the settings GUI zoom sequence. Record results under
`perf/` if the implementation materially changes upload volume or frame cost.

### Phase 5: Replace Dirty Queue And Frame Scheduler Semantics
Replace generic dirty booleans and ambiguous frame reasons with typed work and
explicit scheduler state.

Acceptance for this phase:

- no `manual+texture-upload` loop with zero work
- deferrals are visible in diagnostics
- paint-unavailable work reports the blocked surface and requested paint
- upload-budget exhaustion reports remaining uploadable work
- frame requests stop when all work queues are empty

### Phase 6: Decouple Retained Interaction From Texture Freshness
Audit retained interactions so they use logical scene state during pending
texture work.

Expected owner paths include:

- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/interactions/retainedContentInteraction.ts`
- `frontend/src/gpuFlow/nodeInteractionDirty/interactionController.ts`
- retained settings param adapters under
  `frontend/src/components/Pages/Project/GpuProjectSurface/`

Tests should prove switches, hover, scrollbars, text/numeric DOM islands, and
dropdowns remain operable while a high-resolution pending snapshot is uploading.

### Phase 7: Remove Old Code Paths
Once the snapshot architecture owns rendering, remove obsolete helpers and tests
that encode the previous mutable lifecycle.

Deletion targets likely include:

- pending-resolution mutation helpers that update live records
- dirty flags that mix content and resolution state without target version
- tests that assert mutable live-record behavior
- local guards added only to avoid restarting pending uploads

Do not keep compatibility wrappers around the old model.

## Test Plan

### Unit Tests
Add focused Vitest coverage beside texture manager and retained-surface modules.

Required cases:

- committed descriptor immutability
- pending descriptor creation and reuse
- atomic pending commit
- visible committed snapshot remains renderable during pending uploads
- zoom bucket hysteresis
- source-window hysteresis
- dirty work routing by type
- no-op scheduler prevention
- tile upload progress across repeated zoom registration

### Integration Tests
Add a deterministic GPU flow stress test for the settings retained surface:

1. Open settings GUI retained content.
2. Hover across several retained rows.
3. Toggle a switch.
4. Zoom in to a high bucket.
5. Scroll retained content.
6. Zoom out and back in.
7. Toggle the same switch again.

Assertions:

- no visible retained surface has a missing committed snapshot
- no renderer frame samples a snapshot with mismatched descriptor/pixels
- no texture-upload loop runs with empty work queues
- switch interaction still reaches the retained control handler
- high-zoom committed content eventually reaches the expected resolution bucket

### Browser Verification
Use Chrome recording and CDP visual verification for the real settings path.

Required checks:

- section contents remain visible during zoom and scroll
- switch remains clickable after zoom and scroll
- high-zoom section contents become sharper after the post-zoom upload settles
- no long no-op texture-upload loop appears in `app_state.ndjson`
- upload diagnostics explain every texture-upload frame that uploads no bytes

## Acceptance Criteria
- The latest recording scenario no longer shows disappearing/resetting section
  contents after zoom and scroll.
- Retained settings controls remain interactive while high-resolution texture
  upgrades are pending.
- High-zoom retained content resolves to an intentionally higher content scale
  instead of staying blurry.
- Renderer code cannot access pending descriptor state.
- Texture descriptors are committed atomically.
- No no-op texture-upload loops remain.
- `pnpm -C frontend exec vitest run <touched-gpu-flow-tests>` passes.
- The relevant Playwright or CDP settings scenario passes.
- `./scripts/quality/check.sh` passes before the final change is considered
  complete.
