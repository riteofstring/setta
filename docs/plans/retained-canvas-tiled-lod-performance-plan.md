# Retained Canvas Tiled LOD Performance Plan

## Goal
Make retained HTML-in-canvas pan and zoom performance independent of
high-resolution texture recomputation.

Pan and zoom must be transform-only interactions. Higher-resolution retained
content should arrive as background refinement after interaction settles, with
stable low-resolution committed content used as fallback until sharper tiles are
ready.

This is a replacement plan, not a compatibility plan. Do not add legacy support,
dual paths, old-field aliases, transitional adapters, feature flags for old/new
texture behavior, or silent fallbacks. Replace the current retained surface
texture model with a tiled LOD page cache and delete the old whole-surface
resolution upload ownership after verification.

## Current Evidence
The latest Chrome recording analyzed for this plan is:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260510-153545`

The recording shows a texture-upload pressure problem introduced by coupling
zoom sharpness to retained surface recomputation.

- 1,008 GPU-flow frames were recorded.
- 634 frames were viewport frames and 613 frames had viewport interaction
  active.
- 270 frames uploaded retained texture work.
- 176 frames reported exhausted upload budget.
- Total uploaded texture bytes were about `1.21 GiB`.
- Maximum allocated retained texture memory reached about `370 MiB`.
- The worst retained upload frame took `144.5ms` at zoom `3.4`; upload work
  accounted for `144.2ms`.
- Zoom ranged from `0.1` to `3.4`.
- The largest zoom bucket produced retained source scales up to `8`.
- 416 upload diagnostics were recorded.
- 345 upload diagnostics had no `dirtySourceRect`, accounting for about
  `1.08 GiB` uploaded.
- 49 tiled uploads with no dirty rect accounted for about `535 MiB`.
- Top upload-heavy surfaces were retained settings content surfaces:
  `settings-section__gui:param-content:unpinned`,
  `settings-section__shortcuts:param-content:unpinned`, and
  `settings-section__sectionSizingPolicy:param-content:unpinned`.

The key failure mode is not that high-resolution content exists. The failure is
that high-resolution content is represented as large whole-surface replacement
work and that small invalidations can degrade into full texture uploads.

## Existing Code Problems
- `frontend/src/gpuFlow/textureResolution.ts` chooses whole-surface resolution
  buckets from viewport zoom. At high zoom this asks every visible retained
  surface for a larger complete texture.
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx` sizes retained source
  canvas backing stores from `textureScale = devicePixelRatio * zoomBucket`.
  A zoom bucket change therefore resizes and redraws the whole retained source
  canvas.
- `frontend/src/gpuFlow/htmlSurfaces/textureTiles.ts` uses `2048x2048` texture
  tiles and allows a single tile upload of roughly `16 MiB`; on the recorded
  machine one upload frame took `144ms`.
- `frontend/src/gpuFlow/dirtyTracking.ts` merges dirty source rects by dropping
  the current rect when a later dirty mark has no rect. This lets row-sized
  content dirtiness become full-surface dirtiness.
- Resolution work, content work, hover work, source-window work, paint
  readiness, upload scheduling, and interaction responsiveness still share one
  dirty queue. The queue can identify work kinds for diagnostics, but it does
  not yet schedule them as independent work items with separate budgets and
  invalidation semantics.

## External Example Repositories Reviewed
Relevant examples were reviewed under:

`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos`

Ideas to borrow:

- `html-in-canvas-official/README.md`
  - Treat `paint` as the synchronization boundary for browser-owned snapshots.
  - Use device-pixel sizing to avoid baseline blur, but do not imply that every
    viewport zoom change must synchronously resize every retained texture.
  - The `captureElementImage` and `OffscreenCanvas` example shows that capture
    and raster work can be separated from the main renderer.
- `html-in-canvas-cracks/README.md` and
  `html-in-canvas-cracks/src/main.js`
  - Keep geometry in CSS pixels and reflow texture content behind stable
    geometry. Setta should keep pan and zoom as transform-only geometry work.
  - Explicitly reallocate GPU texture storage when dimensions change. Setta
    should make texture page allocation explicit and never upload differently
    sized content into an old allocation.
  - Do not copy the demo's full-page upload loop.
- `html-in-canvas-dot-dev/src/content/demos/3d-room-live-content/demo.html`
  - Separate `layoutsubtree` staging from renderer upload with a regular mirror
    surface. Setta should borrow the staging/upload ownership boundary.
  - Keep staging canvases paintable and laid out so cached paint records exist.
- `html-in-canvas-dot-dev/src/content/demos/offscreen-canvas-worker/demo.html`
  - Capture source content, transfer work to a worker, and synchronize results
    back explicitly. Setta should use this as the model for future off-main
    raster work, especially for retained command-rendered content.
- `three-html-render/src/htmlTexture.ts`,
  `three-html-render/src/interactionManager.ts`, and
  `three-html-render/src/raycastInteractionManager.ts`
  - Keep source element identity separate from captured texture identity.
  - Keep interaction mapping independent of texture freshness.
- `random-stuff/apps/curved-markup/src/App/index.tsx`
  - Own texture uploads explicitly and map pointer interaction back through UV
    or logical coordinates. Setta should keep retained hit testing logical.
- `compiz-web/src/transitions/TransitionEngine.ts`
  - Gate texture-dependent work on paint readiness before starting visual work.
  - Do not copy its every-frame page upload pattern.

Ideas not to borrow:

- Do not add a polyfill, SVG `foreignObject` fallback, Three.js renderer, or
  WebGL compatibility path. Setta targets Chromium HTML-in-canvas and WebGPU.
- Do not upload full retained pages or full retained sections every frame.
- Do not make DOM overlays the source of truth for retained settings controls.
  Interaction state remains owned by the retained scene and settings contracts.

## Desired Model
Represent retained content as virtual texture pages with level-of-detail
fallback.

The renderer should draw a retained surface from the best committed texture page
available for each visible page. Missing high-resolution pages must fall back to
lower-resolution committed pages. A high-resolution page is an enhancement, not
a prerequisite for rendering or interaction.

Core concepts:

- `RetainedSurfaceId`: stable logical retained content identity.
- `RetainedContentVersion`: changes only when retained scene content changes.
- `RetainedSourceWindow`: CSS-pixel window into the retained scene.
- `RetainedTexturePageKey`: `surfaceId + contentVersion + sourceTile + lod`.
- `CommittedRetainedTexturePage`: complete GPU texture page used by renderer.
- `PendingRetainedTexturePage`: rasterized or uploading page not yet drawable.
- `RetainedTexturePageCache`: LRU cache across surfaces, pages, and LODs.
- `RetainedTextureWorkItem`: typed work for content, hover, animation,
  source-window, and LOD refinement.

Renderer behavior:

- Pan and zoom update transforms and visible page selection only.
- Visible surfaces render immediately from committed pages.
- If the target LOD page is missing, render the nearest lower LOD page.
- If no page exists yet, render a stable placeholder only for first visibility;
  never blank an already committed surface because a higher LOD is pending.
- Hit testing and switch interaction use retained scene geometry, not texture
  upload completion.

## Non-Negotiable Invariants
- Viewport pan and zoom must not synchronously allocate retained textures.
- Viewport pan and zoom must not synchronously resize retained source canvases.
- Viewport pan and zoom must not synchronously rasterize whole retained
  sections.
- A high-resolution upgrade is background refinement and cannot block input.
- A committed low-resolution page remains drawable while a sharper page is
  pending.
- Dirty rects are preserved unless an explicit full-surface invalidation is
  created.
- Resolution or LOD work must not erase content, hover, animation, or
  source-window dirtiness.
- Upload scheduling uses hard per-frame time and byte budgets.
- If a single upload exceeds budget, future work must be split into smaller
  pages.
- Texture memory has a hard cap, with offscreen high-LOD pages evicted before
  visible low-LOD pages.

## Replacement Architecture

### 1. Baseline And Guardrails
Before changing the architecture, create an append-only performance report in
`perf/` from the current latest recording and one fresh reproduction.

Record at minimum:

- pan/zoom interaction duration
- GPU-flow frame count
- viewport frame count
- upload frame count
- uploaded bytes
- max upload frame duration
- p95 and p99 GPU-flow frame duration
- retained texture memory high-water mark
- dirty work counts by kind
- upload diagnostics grouped by dirty rect present vs absent
- top surfaces by uploaded bytes

Add a small parser script or test helper for Chrome recording bundles so these
numbers are repeatable.

Performance budgets for the replacement:

- no retained resolution uploads during active pan or wheel zoom
- p99 GPU-flow frame duration under `8ms` during pan/zoom on the settings
  reproduction
- no single retained texture upload above `4ms` in the post-settle refinement
  phase
- no more than `32 MiB` uploaded in the first second after zoom settles for the
  settings reproduction
- retained texture memory under a measured cache cap, initially `192 MiB`,
  unless a later perf report justifies a different number

### 2. Replace Dirty Queue Semantics
Delete the current merged dirty-state model for retained textures and replace it
with typed work items.

Required work item fields:

- `surfaceId`
- `contentVersion`
- `kind`
- `sourceRect`
- `sourceWindow`
- `targetLod`
- `priority`
- `createdFrame`
- `sequence`

Work item kinds:

- `content-rect`
- `hover-rect`
- `animation-rect`
- `source-window`
- `lod-refinement`
- `first-visible`
- `full-content`

Rules:

- A missing `sourceRect` is allowed only for `full-content`,
  `first-visible`, or explicit source-window replacement work.
- A new work item never discards another work item's rect.
- Rect work for the same surface, content version, source window, and LOD may
  coalesce by union only when both items have rects.
- LOD refinement may be canceled or reprioritized without touching content
  dirty work.
- Active interaction may pause `lod-refinement` and `source-window` prefetch
  work, but it must not pause required interactive content updates.

### 3. Introduce Retained Texture Pages
Replace whole retained surface snapshots with page snapshots.

Suggested page descriptor:

```ts
type RetainedTexturePageDescriptor = {
  readonly surfaceId: string;
  readonly contentVersion: number;
  readonly sourceRectCss: GpuRect;
  readonly lodScale: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly tileColumn: number;
  readonly tileRow: number;
};
```

Use page sizes chosen from measured upload cost, not from max GPU texture size.
Initial target:

- `512x512` or `1024x1024` pixels for high-LOD pages
- larger pages may be allowed only after measured upload durations stay inside
  budget
- low-LOD bootstrap pages may cover a larger CSS area because they are small in
  pixels

The page cache owns:

- committed pages
- pending raster pages
- pending upload pages
- GPU texture handles
- last-used frame
- byte cost
- source content version
- LOD scale

Delete the current assumption that one retained source surface has one current
texture descriptor plus one pending replacement.

### 4. Build The Interest Map
Each frame should derive an interest map from the viewport, visible retained
surfaces, active/hovered control state, and memory pressure.

The interest map outputs desired pages:

- visible pages at current target LOD
- one lower fallback LOD for newly visible regions
- interactive control pages at highest priority
- near-viewport prefetch pages at lower priority
- no offscreen high-LOD work while memory or upload budget is pressured

During active pan/zoom:

- update the interest map for renderer sampling
- do not enqueue LOD refinement uploads
- optionally cancel obsolete pending LOD work that is no longer visible
- keep low-LOD pages alive as fallback

After interaction settles:

- enqueue LOD refinement only for visible pages
- prioritize hovered, focused, and active pages
- upload at most the frame budget allows
- expand to prefetch only after visible pages are sharp

### 5. Rasterize Pages, Not Whole Sections
Retained settings content is command-rendered canvas content, so Setta does not
need to resize and redraw an entire retained source canvas for each LOD.

Add a retained page rasterizer that renders a CSS source rect into a scratch
canvas or `OffscreenCanvas`:

- set scratch canvas pixel size to page descriptor pixel size
- set transform to `lodScale`
- translate by `-sourceRectCss.x` and `-sourceRectCss.y`
- execute retained scene draw commands clipped to the page source rect
- return a paint-ready page image for GPU upload

This should replace full-source-canvas resizing for retained command-rendered
content. Generic HTML-in-canvas DOM surfaces can keep a staging path, but they
must implement the same page work API before they are allowed into the retained
pan/zoom path.

Borrowed example guidance:

- From `html-in-canvas-cracks`: geometry stays in CSS pixels; texture reflows
  behind it.
- From `html-in-canvas-dot-dev`: staging and upload ownership are separate.
- From the WICG worker example: page raster output can later move off-main via
  `OffscreenCanvas` without changing renderer semantics.

### 6. Upload Scheduler
Replace upload scheduling with a small explicit work scheduler.

Scheduler queues:

- `interactive`: switch animation, active control edits, focused control
  updates
- `visible`: visible page content and visible LOD refinement after settle
- `prefetch`: near-viewport pages and offscreen fallback pages
- `eviction`: GPU resource cleanup

Scheduler budgets:

- `maxFrameUploadMs`
- `maxFrameRasterMs`
- `maxFrameUploadedBytes`
- `maxUploads`
- `maxTextureMemoryBytes`

Scheduling rules:

- No `visible` LOD refinement while `viewportInteractionActive` is true.
- `interactive` work may run during interaction only when bounded to small
  rects or pages.
- A job that exceeds budget records its page size, duration, bytes, and queue.
- Repeated budget misses reduce future page dimensions for that LOD bucket.
- Budget exhaustion schedules one follow-up frame only when uploadable work
  remains.
- Deferred work must be attributed to a concrete owner in diagnostics.

### 7. Renderer Changes
The renderer must draw retained surfaces from page grids.

Implementation options:

- Generate per-page quads for visible retained pages.
- Use instanced quads grouped by texture page where practical.
- Keep low-LOD fallback pages drawable under high-LOD pages.
- Avoid one giant mesh that assumes one texture per retained surface.

Sampling rules:

- Prefer exact LOD page for a visible CSS tile.
- Fall back to lower LOD page covering the same CSS region.
- Fall back to ancestor page or bootstrap low-res surface page.
- Never sample pending pages.
- Never stretch a page across CSS regions it does not own.

### 8. Memory Policy
Use an explicit retained texture memory budget.

Eviction order:

1. obsolete pending pages
2. offscreen high-LOD pages
3. offscreen prefetch pages
4. visible high-LOD pages that have lower-LOD fallback
5. visible low-LOD fallback pages only under extreme pressure

Keep diagnostics for:

- committed page count by LOD
- pending page count by LOD
- bytes by priority
- evicted page count and bytes
- visible fallback rate
- visible sharp page rate

### 9. Delete Old Whole-Surface Resolution Ownership
After page rendering is verified, remove the old whole-surface retained
resolution model.

Delete or rewrite:

- whole retained source canvas resizing on viewport zoom
- whole-surface pending resolution replacement for retained command-rendered
  content
- dirty queue behavior that merges all work into one surface state
- diagnostics that imply one texture descriptor per retained source surface
- tests that require whole-surface resolution upload behavior

Keep only the generic primitives that still make sense after the replacement:

- logical retained scene hit testing
- retained content command drawing
- HTML-in-canvas paint readiness checks for DOM-backed surfaces
- WebGPU texture upload helpers, rewritten around pages

## Implementation Order

1. Add recording parser and perf baseline.
2. Add dirty work item model and tests that prove rect dirtiness is never lost.
3. Add retained page descriptors, page keys, and page cache unit tests.
4. Add retained command page rasterizer with tile clipping tests.
5. Add upload scheduler with deterministic budget tests.
6. Add renderer support for page-grid drawing with lower-LOD fallback tests.
7. Wire settings retained content to the page cache.
8. Remove whole-source retained canvas resizing for zoom buckets.
9. Remove retained whole-surface pending resolution uploads.
10. Add browser verification for pan/zoom, scrolling, hover, switch animation,
    and high-zoom sharpness.
11. Record after metrics in `perf/` and compare against the baseline.
12. Delete any leftover unused old texture lifecycle code.

## Test Plan

Unit tests:

- dirty work item coalescing preserves rects
- no missing rect can overwrite an existing rect unless it is explicit
  full-content work
- LOD work cancellation does not clear content work
- page keys are stable across pan/zoom transforms
- page rasterizer draws only commands intersecting the page source rect
- page cache chooses the best available fallback page
- memory eviction preserves visible fallback pages
- scheduler respects byte and time budgets
- scheduler schedules no LOD refinement during active viewport interaction

Integration tests:

- settings retained content renders from page grids
- switch animation updates only the affected page or rect
- hover redraw updates only affected rows/pages
- scrolling changes visible page interest without full-section upload
- zooming in keeps interaction frames upload-free and later refines visible
  pages
- zooming out does not trigger high-LOD re-upload churn

Browser verification:

- run `./scripts/record-chrome-repro.sh` for the settings pan/zoom scenario
- confirm no retained resolution uploads during active pan/wheel zoom
- confirm no section content disappears during pan/zoom
- confirm high-zoom content sharpens progressively after interaction settles
- confirm switches remain clickable while refinement is pending
- confirm no console errors
- capture before/after perf report in `perf/`

## Acceptance Criteria
- Pan and zoom on settings remain responsive while retained content is visible.
- During active pan/zoom, retained high-resolution texture work is zero or only
  explicitly bounded interactive rect work.
- The settings reproduction uploads less than `32 MiB` in the first second
  after zoom settles.
- No single retained upload frame exceeds `4ms` in the measured reproduction.
- Retained texture memory remains below the configured cache cap.
- High-zoom content sharpens after settle without blanking or resetting.
- Switch hover/click behavior does not depend on texture upload freshness.
- The old whole-surface retained resolution path is removed.
