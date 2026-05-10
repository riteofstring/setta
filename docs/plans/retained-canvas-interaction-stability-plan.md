# Retained Canvas Interaction Stability Plan

## Goal

Make retained settings section rows visually stable, interactive, and fast under
hover, control clicks, scroll, pan, and fast zoom.

This plan is the consolidated long-term fix for the current retained-canvas
visual bugs:

- row hover highlight only covers part of the apparent section row
- retained section content can disappear after clicking a switch
- pan and zoom degrade after fast zoom bursts because retained LOD work
  overwhelms frame planning and texture uploads

This is a replacement plan, not a compatibility plan. Do not add legacy support,
dual retained render paths, transitional adapters, old-field aliases, feature
flags for old and new behavior, or compatibility shims. Replace the broken
retained canvas ownership model directly and delete obsolete behavior as each
replacement phase lands.

## Current Evidence

The Chrome recording analyzed for this plan is:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260511-101853`

The recording is sufficient for a first implementation pass.

- `2592` GPU-flow frames were recorded.
- `214` frames exceeded `16.7ms`.
- `1909` frames had missing retained texture pages.
- `1883` frames drew fallback retained texture pages.
- `1321` frames reported retained texture page budget pressure.
- Retained texture uploads totaled about `3.97GB`.
- The worst frame was `28.6ms` at zoom `10`, with `1719` missing pages and
  `1828` fallback draw quads.
- `394` retained row-hover redraw events were recorded.
- Hover redraws targeted surfaces such as
  `settings-section__gui:param-content:unpinned`, with dirty rects like
  `552x24`. That is the full retained param-content surface width, but not
  necessarily the full visual row extent the user perceives.
- Switch clicks updated
  `settings-codeobj__gui__gui__leftSidePaneShiftsMap` and changed the retained
  content signature, forcing new retained content versions while the texture
  page cache still had large missing-page and fallback pressure.

## Related Existing Plans

Use these documents as background, but implement this plan as the coherent
replacement architecture:

- `docs/plans/retained-canvas-tiled-lod-performance-plan.md`
- `docs/plans/retained-canvas-last-good-page-coverage-plan.md`
- `docs/plans/retained-canvas-texture-lifecycle-plan.md`
- `docs/plans/settings-gpu-interaction-regression-plan.md`

Those plans identify parts of the same system. The current bug class requires
solving the ownership boundaries together: row visuals, retained page coverage,
and LOD scheduling cannot be treated as independent patches.

## Diagnosis

### Row Highlight Bounds

The hover path invalidates and redraws retained param-content surfaces. The
dirty rect is full width for the param-content source surface, but the visual
row is composed from more than that retained surface: section chrome, clipping,
DOM islands, and control overlays can occupy adjacent visual space.

The renderer is therefore doing a correct partial redraw for the wrong visual
owner. The hover background should be owned by a row visual layer whose bounds
match the actual interactive row. It should not depend on the narrower
param-content texture boundary.

### Content Disappears After Switch Click

Switch values are included in the retained scene content signature. Toggling a
switch creates a new retained content version for the surface. Existing pages
from the previous content version are not eligible fallback pages, and queued
work for old versions is ignored.

That creates a blanking window: the logical scene updates immediately, but the
new content-version pages may not be committed yet. During fast zoom or upload
backlog, this can leave visible retained content without drawable coverage.

### Fast Zoom LOD Churn

The retained LOD path recalculates target LOD immediately from viewport zoom.
The stable zoom bucket helper has hysteresis support, but the current flow does
not pass a current bucket when choosing the frame bucket.

During active wheel zoom, desired page descriptors change repeatedly. LOD
refinement work is deferred while the viewport interaction is active, but the
work still accumulates by target LOD and page. After interaction settles, the
queue drains through a small upload budget while frame planning still iterates
large missing-page and fallback-quad sets.

The recording shows this is not primarily raw upload time. Many slow frames are
dominated by page coverage, fallback selection, draw quad creation, and repeated
follow-up frames while thousands of target pages are missing.

## Non-Goals

- Do not preserve the current partial-row hover ownership.
- Do not keep surface-wide content versions as the only retained content
  freshness boundary.
- Do not add a DOM overlay fallback for retained settings rows.
- Do not hide blanking with sleeps, larger upload budgets, broad retries, or
  placeholders over already-rendered content.
- Do not retain queued LOD work that is superseded by a newer settled target
  LOD.
- Do not add broad logging as a substitute for structural invariants.
- Do not add generator or contract changes unless a Go-owned contract actually
  changes.

## Target Model

### Visual Ownership

Every retained row has a single authoritative visual extent in CSS pixels. The
extent includes the full interactive row background area, not just the
param-content surface.

The renderer may still split text, controls, section chrome, and active DOM
islands into separate implementation layers. However, row state visuals such as
hover, pressed, focus, selection, and search rings must be produced by the layer
that owns the complete row extent.

Required properties:

- retained hit testing and row background drawing use the same row bounds
- hover invalidation dirties the complete visual row extent
- DOM islands sit above the row visual but do not own row background state
- section chrome clipping cannot cut a row highlight in half
- row visual ownership is explicit in scene data, not inferred from texture
  surface IDs

### Committed Coverage

Visible retained content must draw from committed coverage every frame.

Target LOD pages are refinements. A missing target page cannot make visible
content blank. The renderer uses the best committed page that covers each
visible source rect until a better page is committed.

Required page states:

- `CommittedRetainedTexturePage`: immutable, drawable GPU texture page
- `PendingRetainedTexturePage`: upload work only, never sampled by renderer
- `RetainedTexturePageAddress`: complete identity for surface, content segment,
  source window, LOD, scale, tile row, and tile column
- `RetainedCoverageResult`: target descriptors, drawable quads, missing target
  descriptors, uncovered rects, and protected page keys

Required invariants:

- a visible row that had committed coverage remains visible while replacements
  upload
- pending pages never replace committed draw coverage before commit
- eviction cannot remove pages needed for current target or fallback coverage
- uncovered visible rects are a correctness failure unless this is first
  visibility with no prior committed content

### Fine-Grained Content Freshness

Content freshness is tracked at the smallest practical retained-content unit,
not only at full-surface level.

The initial replacement should make row-level content generations explicit for
settings retained rows. If later profiling proves row-level granularity is too
fine or too coarse, move to tile-level command fingerprints. Do not keep a
single surface-wide JSON signature as the only content-version owner.

Required behavior:

- toggling one switch invalidates the row or tiles that contain that switch
- unchanged rows retain drawable pages across nearby content changes
- old content for a changed row may remain visible until the replacement row
  content is committed, but it must be marked as stale in diagnostics
- interaction state changes such as hover do not create a new content version
- switch animation and active-control state are typed dirty work, not implicit
  full-surface content replacement

### Transform-Only Viewport Interaction

Pan and wheel zoom are transform-only while the interaction is active.

During active viewport interaction:

- keep the current committed LOD target stable
- render from already committed pages
- do not enqueue superseded LOD refinement for every intermediate zoom bucket
- do not upload passive LOD refinement work
- keep hit testing in logical scene coordinates

After viewport interaction settles:

- compute the desired target LOD from the settled zoom
- use hysteresis against the previous retained LOD bucket
- cancel stale LOD refinement work for older targets
- enqueue visible target pages before offscreen cache pages
- request follow-up frames only while uploadable work remains or a committed
  refinement changed drawable coverage

### Bounded Frame Planning

Frame planning must be bounded by visible geometry and page budget.

The renderer should not build or sort thousands of fallback draw quads per frame
when the viewport only needs a smaller visible coverage set. Coverage resolution
must be indexed by surface, source window, content segment, and source rect so
visible page planning is proportional to visible pages, not all cached pages.

Required behavior:

- group desired pages by surface before resolving coverage
- index committed pages by surface and source window
- cap fallback candidate scans per desired page by usable LOD distance and
  source intersection
- merge adjacent fallback quads when they sample the same committed page and
  share compatible transforms
- record p95 and p99 counts for desired pages, fallback quads, and coverage
  candidates in performance reports

## Implementation Phases

### 1. Add Failing Repro Tests First

Before changing retained rendering behavior, add focused tests that reproduce
the user-visible behavior and fail against the current implementation. Do not
start the behavioral fix until these failures are observed locally.

These must be user-path tests, not implementation-detail tests. They should use
real pointer, wheel, keyboard, and viewport interactions and assert the visible
canvas result a user would see. Internal scene state, retained page counts,
content versions, dirty rects, and frame diagnostics may be captured to explain
failures, but they are not sufficient pass/fail assertions.

Add focused frontend E2E coverage for the three user-visible bugs:

- hovering a settings row highlights the complete visual row extent
- toggling `Left Side Pane Shifts Map` never leaves the settings GUI section
  visually blank
- fast zooming the settings view stays within recorded frame and upload budgets
  after the interaction settles

The hover and switch tests should assert pixels on the canvas, not only scene
debug state. The fast-zoom test should assert the user-visible outcome first:
pan and zoom remain responsive, content remains visible, and post-interaction
refinement does not cause visible blanking or sustained jank. Performance
metrics can then set numeric budgets for that behavior.

The first committed test state for this plan should therefore be red: each test
must fail because it observes the behavior the user currently sees.

After the failing tests are in place, create an append-only performance report
in `perf/` for the latest recording. Record at minimum:

- GPU-flow frame count
- p95 and p99 GPU-flow frame duration
- retained missing-page frames
- retained fallback frames
- maximum missing page count
- maximum fallback draw quad count
- retained uploaded bytes
- retained upload count
- retained budget-pressure frames
- slowest frame and active frame reason
- click-to-settings-update timing for switch toggles

### 2. Replace Row Visual Ownership

Introduce explicit retained row visual bounds in the project GPU settings
surface adapter.

Implementation scope:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuParamContentAdapter.ts`
- `frontend/src/gpuFlow/retainedContentScene.ts`
- `frontend/src/gpuFlow/retainedContentRowCanvas.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllerSurfaceUpdates.ts`
- related retained hit-test and row-hover files

Required changes:

- store a full row visual rect separately from the param-content text/control
  rect
- draw hover and row-state backgrounds from the full row visual rect
- keep labels and controls clipped to their content/control rects
- make row-hover dirty rects cover the row visual owner surface
- ensure section chrome and DOM islands are layered above or below the row
  background intentionally

Delete any hover path that assumes the param-content surface bounds are the full
visual row bounds.

### 3. Replace Surface-Wide Content Versions

Replace the current surface-wide content signature as the sole retained content
freshness owner.

Implementation scope:

- `frontend/src/gpuFlow/GpuRetainedContentPageFrameSurfaces.ts`
- `frontend/src/gpuFlow/retainedContentScene.ts`
- `frontend/src/gpuFlow/retainedTexturePages.ts`
- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`

Required changes:

- add row or tile content generation to retained page descriptors
- make page keys include the content generation for the sampled content unit
- allow unchanged row/tile pages to remain drawable when a neighboring row
  changes
- allow stale committed coverage for the changed row until the replacement
  row/tile page is committed
- mark stale draw coverage in diagnostics so tests can distinguish "visible
  stale" from "fresh"

Delete the assumption that any switch value change requires replacing every page
for the retained param-content surface before drawing can continue.

### 4. Rewrite Coverage Resolution Around Drawable Pages

Make coverage resolution a correctness layer rather than a best-effort helper.

Implementation scope:

- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedTexturePages.ts`
- `frontend/src/gpuFlow/retainedTexturePageVisuals.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`

Required changes:

- produce target descriptors only for the visible source rect
- first use exact committed pages
- cover missing target rects with committed fallback pages
- prefer same content generation, then stale same-row coverage, then lower LOD
  coverage when content is unchanged
- emit uncovered rects only when no committed drawable page can cover a visible
  source rect
- fail tests on uncovered rects for rows that previously had committed coverage
- protect exact and fallback pages from eviction for the submitted frame

Delete any visual path where a missing target LOD page produces an empty
retained visual for already-visible content.

### 5. Replace LOD Scheduling

Make retained LOD policy explicit and cancellable.

Implementation scope:

- `frontend/src/gpuFlow/textureResolution.ts`
- `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx`
- `frontend/src/gpuFlow/retainedTextureWorkQueue.ts`
- `frontend/src/gpuFlow/retainedTextureUploadScheduler.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`

Required changes:

- store the current retained viewport zoom bucket in retained page manager state
- pass the current bucket into `chooseStableZoomBucket`
- freeze retained target LOD during active viewport interaction
- compute a new desired target only after interaction settles
- cancel queued `lod-refinement` work superseded by the new target
- coalesce LOD work by surface, source window, page, and target LOD
- prioritize active-control, hover, animation, and content work above passive
  LOD refinement
- report budget pressure only when uploadable work remains, not merely because
  some upload happened
- request follow-up texture-upload frames only when they can do useful work

Delete the behavior where every intermediate wheel zoom bucket can leave queued
LOD refinement work behind.

### 6. Bound Coverage And Draw Work

Optimize the page planner after the correctness model is in place.

Implementation scope:

- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`
- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedTexturePages.ts`
- `frontend/src/gpuFlow/retainedTexturePageVisuals.ts`
- frame diagnostics in `frontend/src/gpuFlow/framePerformance.ts`

Required changes:

- avoid filtering all desired pages for each surface on every frame
- add cache indexes for committed page lookup
- keep fallback candidate lookup proportional to visible pages
- merge compatible fallback draw quads
- add diagnostics for coverage candidate scans, generated draw quads, merged
  quads, stale fallback quads, and uncovered visible rects

The performance target is that fast zoom produces bounded frame planning work
even before all target LOD pages are committed.

### 7. Delete Obsolete Paths

After the replacement behavior is covered by tests and recordings, remove the
old retained assumptions:

- surface-wide content version as the only page freshness identity
- hover dirty rects tied only to param-content bounds
- target-LOD-only draw coverage
- uncancelled passive LOD backlog
- follow-up texture-upload loops with no useful uploadable work
- any full-surface retained invalidation created only for convenience

Do not leave old and new retained texture semantics side by side.

## Verification

Run focused checks after each phase:

- `pnpm -C frontend exec vitest run <changed frontend test files>`
- focused Playwright settings E2E tests for hover, switch toggle, and fast zoom
- `./scripts/record-chrome-repro.sh` reproduction for the settings GUI surface
- append-only `perf/` report comparing before and after recording metrics

Before considering the plan complete, run:

- `./scripts/quality/check.sh`

Final acceptance criteria:

- hover highlight covers the full visual row extent in settings retained rows
- switch toggles do not blank retained settings content
- active wheel zoom is transform-only for retained LOD
- after zoom settles, stale LOD work is cancelled and only the final target is
  refined
- no already-visible retained row has uncovered drawable coverage
- fast zoom no longer produces thousands of fallback quads per frame
- retained uploaded bytes and post-zoom upload-frame counts are materially lower
  than the baseline recording
- no old compatibility or transitional retained rendering path remains
