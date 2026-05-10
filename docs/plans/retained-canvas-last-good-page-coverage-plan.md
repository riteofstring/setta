# Retained Canvas Last-Good Page Coverage Plan

## Goal

Eliminate retained section content blanking during close zoom, pan, and LOD
changes by making visible retained content a hard coverage invariant:

- visible retained rows must always draw from a committed retained texture page
  or an explicitly valid lower-resolution fallback page
- higher-resolution retained pages are refinements, never replacements until they
  are committed
- no viewport interaction may clear or invalidate the last drawable coverage for
  a visible retained surface

This replaces the prior resource-lifetime-centered plan. Resource lifetime still
matters, but the reproduced failure is stronger: debug state reports visible
retained rows while the canvas pixels for those rows are blank.

## Evidence

The focused Playwright reproduction is:

`frontend/tests/e2e/settings/settings-retained-close-zoom-visual.spec.ts`

Current failing signal:

- Settings All Settings retained scene contains hundreds of retained rows.
- After close zoom, the target row remains visible in debug geometry.
- The screenshot crop for the target retained row is visually blank:
  `contrastPixelRatio: 0`, `luminanceRange: 0`.

That means the logical retained scene and viewport geometry still exist. The
failure is in the retained page backing store and draw coverage, not in settings
layout or row visibility.

## Diagnosis

The retained texture page pipeline is currently allowed to change target
resolution or LOD in a way that removes, clears, or stops drawing the last
committed page coverage before replacement pages are committed and used by the
renderer.

The high-risk design flaws are:

- page identity does not include the complete effective raster identity
- base raster scale changes can clear the retained page cache
- target LOD pages can become required draw coverage before upload completion
- fallback coverage is not treated as a correctness requirement
- missing page coverage can become a blank canvas region instead of a loud
  invariant failure

The principled fix is to make retained page rendering a stable tiled backing
store with explicit page generations, fallback coverage, and post-submit
refinement.

## Non-Goals

- Do not preserve compatibility with the old retained whole-surface texture path.
- Do not add transitional dual-read or dual-write retained texture paths.
- Do not hide missing coverage with timeouts, sleeps, broad retries, or larger
  budgets.
- Do not use DOM overlays as the visual fallback for retained settings content.
- Do not keep cache-clearing behavior that can remove last-good visible pages.

## Target Model

### Retained Page Address

Replace the current incomplete page identity with a complete immutable page
address:

- `surfaceId`
- `contentVersion`
- `sourceWindowVersion` or full source-window descriptor identity
- `scaleKey`, the effective raster scale used to produce page pixels
- `lodLevel`
- `tileColumn`
- `tileRow`

The cache key must include all fields that affect raster pixels or source
coordinates. A zoom or scale transition creates new page addresses; it must not
mutate the meaning of existing page keys.

### Committed Page

A committed retained page is an immutable, drawable GPU texture page with:

- complete descriptor
- texture resource
- committed frame
- last used frame
- byte size
- content/raster identity

Committed pages remain drawable until no visible coverage depends on them and
they are evicted by the retained-page eviction policy.

### Pending Page

A pending page is upload work only. It must not replace committed draw coverage
or remove fallback eligibility. A pending high-resolution page becomes eligible
for draw only after upload completes and it is committed.

### Coverage Result

For each visible retained surface, frame planning must produce:

- target page descriptors for the desired scale/LOD
- drawable quads from committed target pages where available
- drawable quads from committed lower-resolution fallback pages for missing
  target areas
- uncovered rects only when no committed fallback can cover a visible source rect
- refinement descriptors for missing target pages

The renderer must draw fallback pages warped into the target source rect when
needed. A lower-resolution page may be less sharp, but it must not be blank.

## Implementation Phases

### 1. Lock the Reproduction

Keep the failing Playwright test as the user-path guard:

- `frontend/tests/e2e/settings/settings-retained-close-zoom-visual.spec.ts`

The test must continue to assert both sides of the bug:

- retained row debug geometry says content is visible
- the actual canvas screenshot crop has visible contrast

Do not weaken this test to only inspect diagnostics. The point is to catch the
visual blanking the user sees.

### 2. Make Page Identity Complete

Update retained page descriptor and cache code:

- `frontend/src/gpuFlow/retainedTexturePages.ts`
- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`

Required changes:

- add `scaleKey` or equivalent effective raster scale identity to page
  descriptors and cache keys
- add source-window identity if source-window changes can alter page pixels
- delete any behavior that clears the whole retained page cache solely because
  target raster scale changes
- keep committed pages from older scale keys available as fallback candidates

Unit tests:

- two pages with same surface/content/tile but different scale keys have
  distinct keys
- changing target scale does not clear committed lower-scale pages
- same visible source rect can resolve fallback pages from older scale keys

### 3. Rewrite Coverage Resolution Around Fallback

Update retained page grid coverage:

- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedTexturePageVisuals.ts`

Required algorithm:

1. compute target descriptors for the visible source rect at desired scale
2. find committed target pages
3. compute missing target source rects
4. find committed fallback pages from lower scales/LOD that cover each missing
   rect
5. emit draw quads for target and fallback pages
6. emit refinement descriptors for missing target pages
7. emit uncovered rects only for areas with no drawable committed page at any
   acceptable fallback scale

Unit tests:

- full target coverage draws only target pages
- partial target coverage draws target pages plus lower-scale fallback pages
- no committed fallback reports uncovered rects
- fallback quads preserve CSS source rect alignment
- fallback pages are marked used and protected from eviction for the submitted
  frame

### 4. Split Frame Planning From Maintenance

Keep the frame sequence explicit:

1. `prepareFrame`: derive visible coverage and draw quads only from committed
   pages
2. render and submit the WebGPU frame
3. `runPostSubmitMaintenance`: enqueue and upload refinement pages, then evict
   only pages not needed for current/fallback coverage

Required behavior:

- active zoom/pan can update transform and draw from committed fallback pages
- refinement uploads happen after draw planning and do not block the current
  frame
- committing a refinement page requests another render frame
- eviction runs after protected page keys for target and fallback coverage are
  known

Unit tests:

- prepared frame can draw fallback pages before refinement upload
- upload completion commits target pages without removing fallback pages during
  the submitted frame
- protected fallback pages are not evicted under memory pressure

### 5. Remove Global Cache-Clear Paths

Delete retained page behavior that can produce blank visible regions:

- global retained page cache clear on zoom/scale transition
- pending-page replacement that removes committed draw coverage
- any target-LOD-only draw path with no fallback
- any silent empty visual result for visible retained rows

If a visible retained surface cannot draw any page coverage, diagnostics should
report a specific uncovered visible rect. The renderer should fail tests loudly
rather than presenting blank content as a successful frame.

### 6. Resource Lifetime Cleanup

Retained page resource lifetime should support the coverage model, not own it.

Required behavior:

- replacing a committed page retires the old GPU resource only after it is no
  longer used by submitted frames
- evicting a page removes cache lookup eligibility immediately, but actual GPU
  destruction follows submitted-frame lifetime
- diagnostics include retired bytes, committed retained bytes, fallback draw
  count, and uncovered visible rect count

This phase should keep any existing resource-lifetime work that supports these
rules, but resource lifetime is not the primary blank-content fix.

### 7. Verification

Required automated coverage:

- the existing failing Playwright visual test passes
- retained page key tests cover scale/source-window identity
- retained coverage tests cover target plus fallback quads
- retained eviction tests protect fallback pages for the submitted frame
- frame-planning tests prove target refinements do not remove visible fallback
  coverage

Required browser verification:

- run the settings close-zoom visual Playwright test and inspect screenshots
- run a latest Chrome recording after the fix and confirm:
  - no visible retained row produces blank screenshot crops
  - retained `uncoveredRectCount` is zero after initial warmup
  - fallback draw count may be nonzero during zoom, then drains as refinement
    pages commit
  - no WebGPU destroyed-resource errors appear

## Acceptance Criteria

- Close zoom in Settings never blanks retained section content.
- Panning or zooming after close zoom never makes section shells or retained
  content disappear.
- Visible retained rows always have target or fallback page coverage.
- Higher-resolution retained content appears as refinement without a blank
  intermediate frame.
- The old resource-lifetime-only diagnosis is removed from the active plan set.
- The retained page implementation has no legacy compatibility branch for the
  old incomplete page identity.

## Suggested Change Triage

Keep:

- the focused failing visual Playwright reproduction
- retained page descriptor/cache/rasterizer tests that can be adapted to the
  complete page identity and fallback coverage model
- resource-lifetime primitives only where they enforce submitted-frame-safe GPU
  destruction

Rework:

- current retained page manager code that clears cache on base raster scale
  changes
- coverage code that treats target LOD pages as required before upload commit
- diagnostics that report coverage without proving visible pixels are drawn

Drop:

- the old GPU resource lifetime plan
- dev-only retained page budget hooks
- transitional or compatibility code for old page keys
- redundant close-zoom tests that only inspect debug geometry and not pixels
