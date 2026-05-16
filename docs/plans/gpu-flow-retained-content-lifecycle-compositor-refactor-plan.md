# GPU Flow Retained Content Lifecycle Compositor Refactor Plan

## Context

The scroll-first retained compositor refactor removed the old blank-freeze
failure mode, but it exposed a second failure mode that is just as visible:
zooming, panning, and clicking retained sections can show repeated gray and
white horizontal placeholder lines across section bodies.

The latest Chrome recording is enough to identify the current behavior:

- Recording: `recording-20260515-160230`.
- `976` retained display frames were published.
- `0` frames were held or rejected by the old retained display-frame publisher.
- `616` frames published as `publish-motion-frame-with-pending-strips`.
- `620` frames had pending strips.
- The worst frame had `590` missing pages and `590` pending strips.
- `653` frames reported `textureReadiness: "fallback"`.
- The screenshot artifact matches the pending-strip visuals produced by
  `createRetainedTexturePagePendingStripVisuals`: a dark overlay plus light
  horizontal stripes rendered over missing retained page coverage.

The previous refactor moved the system from "freeze until texture coverage is
complete" to "publish motion with explicit pending strips." That is the right
direction for motion, but the implementation still treats too many ordinary
quality and lifecycle misses as visible content holes. Zoom bucket changes,
native island attachment, and retained page refinement can invalidate the
current ideal page set even when older content is still visually usable. The
result is continuous motion with objectionable placeholder lines.

The next fix should be a larger ownership refactor, not a tweak to stripe color
or a new compatibility path.

## Goal

Build a retained content compositor whose primary invariant is:

Motion is always current, and compatible content remains visible until better
content is ready.

The compositor should distinguish:

1. Motion readiness: viewport pan, zoom, section scroll, hit testing, and native
   island placement.
2. Content coverage: whether there is any semantically compatible texture page
   for the visible content region.
3. Fidelity readiness: whether that compatible texture page is the ideal
   current LOD, DPR bucket, and tile shape.
4. True holes: newly exposed or first-load visible content regions with no
   semantically compatible page at all.

Only true holes may show an explicit pending treatment. LOD misses, zoom bucket
changes, page-grid changes, and active editor handoff must use compatible
existing content while refinements catch up.

No backward compatibility, transitional dual paths, legacy aliases, migration
layers, or old-field shims are needed. Replace the current retained compositor
owners directly and delete obsolete concepts as each new owner becomes
authoritative.

## Regression Prevention Gates

This refactor is not complete unless all gates are satisfied:

1. Add at least one realistic failing test for the current user-visible failure
   before changing compositor behavior.
2. Add the remaining realistic visual and performance guardrails before final
   handoff.
3. Run the full GPU Flow-related test suite before handoff, not only the new
   focused tests.

The first gate means the first failing test must exercise production rendering
paths and assert observed behavior. It should use real browser interaction,
frame samples, screenshots, crop analysis, visible motion, nonblank content,
frame pacing, and absence of repeated horizontal placeholder bands. It must not
pass by checking internal implementation details such as pending-strip counts,
texture readiness names, publication mode strings, queue internals, or private
diagnostic counters. Diagnostics are useful failure attachments, but they are
not the acceptance oracle.

The second gate means the first failing test may be narrow, but the full
zoom/click/rapid-interaction/large-scene visual coverage listed in Step 1 must
exist before final verification. The third gate means targeted Vitest and
Playwright runs are useful during development, but they are not enough before
cleanup or handoff. The final pass must include the full related GPU Flow unit,
integration, retained compositor, and Settings E2E coverage listed in Step 15,
plus the final Chrome recording and `./scripts/quality/check.sh`. Record the
commands and results in the implementation report.

## Performance Target

The retained compositor should aim for 120 fps-class interaction in a large,
realistic GPU Flow scene comparable to the Settings project's All Settings
view. The performance target applies to:

- viewport panning,
- viewport zooming in and out,
- retained section scrolling,
- rapid zoom plus retained row click/native island handoff,
- mixed interaction where texture refinement is still catching up.

On 120 Hz-capable hardware and browser settings, the target is:

- p95 frame interval at or below `8.33ms` during steady-state interaction,
- no long tasks over `50ms`,
- no repeated dropped-frame streaks,
- continuous visible motion with no multi-frame stalls or final-state jumps,
- no repeated gray/white horizontal placeholder bands,
- bounded main-thread interaction work that leaves time for browser
  compositing and input processing.

If the local or CI environment is capped below 120 Hz, use refresh-aware
thresholds instead of pretending the run proves true 120 fps. A capped run must
still show near display-cadence motion, no long tasks over `50ms`, no repeated
dropped-frame streaks, no visible stalls, and no horizontal placeholder bands.
The report must record:

- observed refresh cadence,
- p95 and max frame interval,
- long-task count and max duration,
- tested interaction type,
- scene size and retained section/row counts,
- whether the run used hardware/browser settings capable of 120 Hz,
- residual risk if a 120 Hz-capable run was not completed.

## Ideas To Borrow From Example Repos

Use these examples as architecture references, not as code to copy.

### HTML-In-Canvas Snapshot Lifecycle

Relevant paths:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official`
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-demo`

Principles to borrow:

- Paint snapshots are lifecycle events. Transforms and native element placement
  can update independently of a fresh snapshot.
- `onpaint`/`requestPaint` style APIs separate "a new raster exists" from
  "the visual object moves this frame."
- HTML element transforms can be synchronized with canvas content without
  forcing the texture to be recaptured every interaction frame.

Setta equivalent:

- Retained section scroll and viewport zoom must not require a new passive
  texture page before the next motion frame can publish.
- Passive content textures should update when source content or chosen fidelity
  changes, not every time motion changes.
- Native island geometry should be derived from current motion plus retained
  scene geometry.

### Html-In-Canvas-Cracks Resource Model

Relevant path:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-cracks/src/main.js`

Principles to borrow:

- Geometry lives in viewport CSS pixels, while shader sampling uses live scroll
  uniforms to map into content coordinates.
- Scene transforms are updated before paint so the first visible frame is
  covered.
- The texture object remains stable while backing allocation can be replaced
  when dimensions change.
- The renderer uses a known valid background only until the first HTML texture
  exists.

Setta equivalent:

- Page descriptors should be content-coordinate objects. Current scroll and
  viewport transforms should affect sampling and placement, not page identity.
- Texture resources should be stable handles with replaceable allocations.
- First-load fallback is allowed, but a zoom refinement miss should never look
  like first-load missing content.

### Three HTML Render Interaction Model

Relevant path:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/raycastInteractionManager.ts`

Principles to borrow:

- Interaction is event-driven and scoped to the active surface under the
  pointer.
- A single native HTML element can be moved so the browser performs native hit
  testing, focus, caret, and selection.
- Interaction alignment uses current motion and texture-space coordinates; it
  does not wait for a full texture rebuild.

Setta equivalent:

- Clicking a retained text-like row should attach the native island from
  current motion geometry.
- Passive row texture replacement should be independent from active editor
  placement.
- Active island attachment should never cold-start the whole retained section
  page set.

### Compiz-Web Transition Model

Relevant path:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/compiz-web/src/transitions/TransitionEngine.ts`

Principles to borrow:

- Old and new textures coexist during a visual transition.
- The current page remains drawable while the next page is prepared.
- The renderer chooses from available textures each frame and commits the new
  target only when it is ready.

Setta equivalent:

- Old compatible retained pages and new target pages should coexist.
- A new page generation should not evict or visually obscure the old generation
  until replacement coverage exists.
- Refinement work should be a content transaction; motion should keep sampling
  the best compatible committed generation.

## Target Architecture

### 1. Retained Motion Owner

Create a single owner for the current retained motion state:

- viewport transform,
- viewport zoom,
- retained section scroll offsets,
- scroll revision,
- active pointer state,
- active native island placement inputs,
- current hit-test transforms.

This owner publishes every render frame during interaction. It never waits for
texture upload, rasterization, LOD refinement, page-grid rebuild, or passive
source replacement.

### 2. Retained Content Snapshot Owner

Create a separate owner for content identity and semantic compatibility:

- section id and surface id,
- source key and source version,
- content bounds,
- row identity and row content versions,
- content segment versions,
- theme and renderer family,
- active/passive source ownership.

This owner decides when old passive pages are semantically compatible with a
new desired page. Compatibility must be typed and deterministic. Do not use
keyword heuristics.

Compatible content means it is safe to draw without showing wrong rows, wrong
values, wrong theme, or stale active-control state. It does not mean the page is
the ideal current resolution.

Initial compatibility matrix:

| Attribute | Owner Decision | Notes |
| --- | --- | --- |
| `surfaceId`, `sourceKey`, `sourceVersion`, row/source identity, row/content version, theme/renderer family, active/passive ownership state | Semantic compatibility | A mismatch must reject the page loudly and specifically. Drawing it risks wrong rows, wrong values, wrong theme, or stale active state. |
| LOD, DPR bucket, viewport zoom bucket, page-grid shape, source window, tile shape | Fidelity/readiness | A mismatch should enqueue refinement, not create a visible hole, unless it changes semantic content. |
| Content-coordinate rect coverage | Coverage | Partial compatible coverage is drawable. Only the uncovered remainder can become a true hole. |
| First-load or newly exposed content-coordinate area with no compatible page | True hole | This is the only case where fallback treatment is allowed. |

Semantic compatibility must be centralized behind an owner API with structured
results. Do not scatter ad hoc checks across cache lookup, display composition,
diagnostics, and scheduler code.

```ts
type RetainedCompatibilityResult =
  | {
      kind: "compatible";
      fidelity:
        | "exact"
        | "lower-lod"
        | "previous-grid"
        | "previous-dpr-bucket";
    }
  | {
      kind: "incompatible";
      reason:
        | "surface-mismatch"
        | "source-version-mismatch"
        | "row-version-mismatch"
        | "theme-mismatch"
        | "active-passive-state-mismatch"
        | "content-rect-mapping-mismatch";
    };

function isSemanticallyCompatibleRetainedPage(
  page: RetainedCommittedPage,
  snapshot: RetainedContentSnapshot,
  visibleRegion: ContentRect,
): RetainedCompatibilityResult;
```

This contract is a primary correctness boundary. Over-broad compatibility can
draw wrong rows, stale values, or stale active state. Over-narrow compatibility
can recreate placeholder bands. Both failures should be visible in tests and
diagnostics.

### 3. Retained Page Cache Owner

Replace the current "desired page is either exact or missing" model with a
cache that can answer three different questions:

1. Exact target: do we have the ideal page for this content coordinate rect,
   content snapshot, DPR bucket, and LOD?
2. Compatible coverage: do we have any page that can safely cover this visible
   content coordinate rect now?
3. Refinement target: what page should be prepared to improve fidelity?

Page lookup should be content-coordinate first. Source windows and viewport
motion should not be primary identity unless they affect semantic content. LOD,
DPR bucket, and page shape should affect fidelity, not semantic coverage.

The cache should keep old compatible pages protected while a replacement
generation is prepared. Eviction may remove old pages only after the new
generation covers the same visible region or after the region is no longer
near-visible.

Old-page protection must be explicitly bounded. Protect only visible and
near-visible compatible pages, report protected page count and bytes, and make
eviction decisions from those metrics. Do not trade placeholder stripes for
unbounded texture memory growth.

Committed pages must carry a content-coordinate mapping proof of what they
contain and how to sample it. Previous-grid and lower-LOD pages are drawable
only if this proof lets the planner map the requested content rect to the
texture safely.

```ts
type RetainedCommittedPage = {
  readonly pageKey: RetainedPageKey;
  readonly semanticIdentity: RetainedSemanticIdentity;
  readonly contentRect: Rect;
  readonly sourceCaptureRect: Rect;
  readonly contentToTextureTransform: Matrix3;
  readonly lod: RetainedLod;
  readonly dprBucket: RetainedDprBucket;
  readonly pageGridGeneration: string;
};
```

Memory protection needs hard budget buckets, not only a single global cache
limit:

```ts
type RetainedPageMemoryBudget = {
  readonly hardMaxBytes: number;
  readonly visibleCompatibleReserveBytes: number;
  readonly nearVisibleCompatibleReserveBytes: number;
  readonly activeIslandReserveBytes: number;
  readonly trueHoleRecoveryBudgetBytes: number;
  readonly refinementBudgetBytes: number;
  readonly prefetchBudgetBytes: number;
};
```

Hard memory rules:

1. Offscreen prefetch cannot evict visible compatible coverage.
2. LOD refinement cannot evict the only compatible visible page before
   replacement coverage exists.
3. Old-page protection expires when the region is no longer visible or
   near-visible.
4. If visible compatible protection exceeds budget, degrade LOD or page shape
   before showing placeholders.
5. If even the lowest acceptable compatible representation cannot fit within
   hard device or memory limits, fail loudly with a specific blocker instead of
   silently falling back to placeholders.

### 4. Coverage Planner

Introduce an explicit coverage planner that returns:

- exact draw quads,
- compatible draw quads,
- true hole rects,
- refinement descriptors,
- protected page keys,
- coverage metrics,
- fidelity metrics.

The planner is the only owner allowed to decide whether a rect is a true hole.
The display compositor should not infer holes from upload queues or target
descriptor counts.

Coverage readiness and fidelity readiness should be separate diagnostics:

- `coverageReadiness: "covered" | "true-holes" | "initial-loading"`.
- `fidelityReadiness: "target" | "compatible-lower-lod" |
  "compatible-previous-grid" | "refining"`.

The exact names can change during implementation, but the separation must not.
New planner and display-composer vocabulary should use names such as
`trueHoleRects`, `compatibleCoverageRects`, and `fidelityState`. Do not
introduce new authoritative APIs named around `pendingStrip`,
`textureReadiness`, or `publish-motion-frame-with-pending-strips`; those are
old publication concepts to delete.

The composed frame should carry an auditable coverage proof. The display
composer may draw true-hole fallback only from `trueHoleRects`, never from exact
target misses, upload backlog, queue state, or texture readiness labels.

```ts
type RetainedCoverageProof = {
  readonly visibleContentRects: readonly Rect[];
  readonly exactCoverageRects: readonly Rect[];
  readonly compatibleCoverageRects: readonly Rect[];
  readonly trueHoleRects: readonly Rect[];
  readonly rejectedStaleRects: readonly {
    readonly rect: Rect;
    readonly reason: RetainedCompatibilityRejectReason;
  }[];
  readonly fidelityState:
    | "target"
    | "compatible-lower-lod"
    | "compatible-previous-grid"
    | "refining";
};
```

Development and test builds should fail loudly if true-hole area appears for a
stable visible region that had compatible coverage in recent frames and no
semantic revision, source readiness, size/layout, memory, or device-limit state
changed. In production diagnostics, report the same condition as a specific
coverage regression.

### 5. Display Composer

The display composer should build each frame from:

- current retained motion,
- current retained content snapshot,
- coverage planner result,
- active native island geometry,
- switch animation overlays.

It should draw:

1. exact pages where available,
2. compatible pages where exact pages are missing,
3. true-hole fallback only for regions with no compatible content.

The current high-contrast pending stripe visuals should be removed. If a true
hole needs a visual treatment, use the normal retained section body background
or a subtle no-pattern fill that cannot be mistaken for row content. It should
appear only for actual first-load/new-edge holes.

The fallback visual must not contain repeated row-like horizontal structure.

Changing stripe colors, opacity, or pattern alone is not a fix. The compositor
must stop turning quality-only misses into true-hole fallback before visual
treatment changes count toward this plan.

### 6. Zoom And LOD Policy

Viewport zoom should not invalidate coverage.

During active zoom:

- keep the current compatible page generation drawable,
- choose a stable target zoom bucket,
- enqueue refinement for the target bucket,
- avoid replacing visible content with placeholders while target pages upload.

After zoom settles:

- continue drawing compatible lower-LOD pages,
- progressively replace with exact target pages,
- retire lower-LOD pages only after replacement coverage is complete or safely
  offscreen.

The compositor should tolerate temporary lower fidelity. It should not tolerate
blanking, gray/white stripe placeholders, or wrong content.

### 7. Native Island Policy

Active native island attachment should be a motion/interaction operation, not a
passive texture publication blocker.

When a text-like row is clicked:

- attach the native island using current motion geometry,
- keep the previous passive page generation drawable around the active row,
- mark the passive snapshot dirty for post-handoff refresh,
- commit the refreshed passive texture only when compatible replacement
  coverage exists.

The active island may cover its own row. It should not make unrelated rows in
the section become true holes.

On blur or detach, do not reveal passive retained content for the active row
unless the passive page reflects the committed value. If replacement passive
coverage is not ready, the active island or another compatible visual must keep
covering that rect until compatible replacement coverage exists.

### 8. Scheduler Policy

Replace broad "defer all retained page maintenance during viewport motion" with
work-class budgets:

- true-hole coverage gets a small guaranteed visible-edge budget,
- active island snapshot work gets interactive priority,
- exact LOD refinement gets opportunistic budget,
- prefetch gets remaining budget,
- offscreen work must not starve visible true holes.

The scheduler should preserve frame pacing. It should also avoid draining only
one tiny page per frame when a large visible region is uncovered and the frame
budget has headroom.

Interaction may throttle fidelity refinement, but it must not categorically
starve refinement when measured frame budget is available.

Visible work needs bounded progress diagnostics:

- For a stable visible region with ready sources and available memory, visible
  true-hole area must decrease within a bounded number of frames, or
  diagnostics must identify the exact blocker.
- For settled zoom after interaction ends, exact coverage should increase, or
  diagnostics must identify why it cannot: source not ready, memory cap,
  texture dimension cap, upload budget, or device limit.

### 9. Diagnostics

Keep diagnostics, but make them explain behavior instead of becoming test
assertions:

- visible true-hole area,
- compatible-covered area,
- exact-covered area,
- lower-LOD covered area,
- previous-grid covered area,
- stale-content rejected area,
- semantic compatibility rejection reasons,
- target refinement backlog,
- bounded-progress blocker reasons,
- protected page count and bytes,
- upload work by class,
- active island transaction state.

Chrome recordings should let us answer:

- Did motion publish at display cadence?
- Was any visible region a true hole?
- If so, why was no compatible page available?
- Did any quality-only miss become a visible placeholder?
- Did active island attachment invalidate unrelated passive content?

## Implementation Plan

### Step 1: Add Failing Observed-Behavior Tests

Create at least one high-signal failing test before changing compositor
behavior. It should fail on the current branch with the gray/white
horizontal-line artifact. The remaining tests in this section may be added
while the refactor is underway, but all of them must exist and pass before
Step 15 is considered complete.

Add a Playwright spec such as:

- `frontend/tests/e2e/settings/settings-retained-zoom-click-visual-continuity.spec.ts`

The tests must use production rendering paths and real browser interaction.
They must not assert internal diagnostic strings such as
`pendingStripCount`, `textureReadiness`, or `publish-motion-frame-with-pending-strips`.
Diagnostics can be attached for failure analysis only.
These tests are the primary regression guard for this bug. A unit test that
only proves the new planner shape is not a substitute.

The first pre-code test should cover either the zoom case or the click/handoff
case below with screenshot crop analysis. Prefer the shortest case that fails
reliably on the current branch. Before handoff, the guardrail set should cover:

1. Zoom in/out retained sections without horizontal placeholder bands.
   - Open Settings in the retained GPU Flow surface.
   - Center sections that reproduced the screenshot, including `shortcuts`,
     `gui`, `chatWindowing`, and `sectionSizingPolicy`.
   - Use real wheel or keyboard zoom input.
   - Capture frame samples during and immediately after zoom.
   - Analyze retained-section screenshot crops for repeated high-contrast
     horizontal bands.
   - Assert that section content remains nonblank, no stripe pattern dominates
     the crop, and frame pacing stays near display cadence.

2. Click a retained text-like row without section placeholder bands.
   - Open Settings.
   - Center `sectionSizingPolicy`.
   - Click a visible text-like retained row.
   - Capture frames before click, during native editor handoff, and after the
     editor appears.
   - Assert that the clicked row either remains represented by visible retained
     text or the native editor, and that unrelated rows do not become repeated
     placeholder bands.

3. Rapid zoom plus click remains continuous.
   - Perform a short zoom burst and immediately click a retained text-like row.
   - Record `requestAnimationFrame` intervals and screenshot samples.
   - Assert no long stall over `50ms`, p95 frame interval within the
     refresh-aware threshold, and no visual transition from retained content to
     horizontal placeholders.

4. Large-scene panning, zooming, and section scrolling stay 120 fps-class.
   - Use a large complex scene comparable to Settings All Settings.
   - Exercise viewport pan, viewport zoom, retained section scroll, and mixed
     zoom-plus-scroll interaction.
   - Capture frame samples and screenshot crops throughout the interaction.
   - On 120 Hz-capable hardware, assert p95 frame interval at or below
     `8.33ms`.
   - On capped hardware, assert near observed display cadence and record the
     cap explicitly.
   - Assert no long tasks over `50ms`, no repeated dropped-frame streaks, no
     visible motion stalls, and no repeated horizontal placeholder bands.

Suggested visual analysis:

- Reuse the existing retained settings visual-analysis helpers.
- Add a crop analyzer that detects repeated nearly full-width light bands on a
  dark retained section body.
- Use pixel evidence: band count, band regularity, band width coverage,
  nonblank content ratio, and text/control ink ratio.
- Store failure screenshots as Playwright attachments.

The first test should be allowed to fail at this step. Record the failure mode
in the implementation notes before changing compositor code. The broader test
set should not be left failing at handoff.

### Step 2: Baseline The Current Failure

Run the new failing-first test and a Chrome recording against the current
branch.
Record:

- failed screenshots,
- visual band metrics,
- frame interval stats,
- long-task stats,
- scene size and retained row/section counts,
- the latest retained compositor diagnostic summary,
- whether motion was continuous despite the visual artifact,
- whether the run was 120 Hz-capable or refresh-capped.

This baseline should be added as an append-only report under `perf/reports/`
or referenced from the implementation notes. Do not use the diagnostic fields
as pass/fail criteria for the tests.

### Step 3: Define Authoritative Retained Content Lifecycle Types

Replace the current retained display-frame vocabulary with explicit lifecycle
types:

- `RetainedMotionFrame`,
- `RetainedContentSnapshot`,
- `RetainedPageTarget`,
- `RetainedCompatiblePageCoverage`,
- `RetainedTrueHole`,
- `RetainedFidelityState`,
- `RetainedComposedFrame`.

Delete obsolete names once replaced. Do not keep compatibility aliases.

The new types should make it impossible to confuse:

- missing exact target page,
- missing compatible coverage,
- lower-LOD compatible coverage,
- content-incompatible stale page,
- true first-load hole.

### Step 4: Add Semantic Identity And Compatibility Predicate

Add the centralized semantic compatibility owner before changing cache or
display-composer behavior.

Implementation details to enforce:

- committed pages carry semantic identity,
- snapshots expose the semantic identity needed for compatibility checks,
- compatibility returns structured accept/reject results,
- rejection reasons are explicit and surfaced in diagnostics,
- wrong-content pages are rejected before any draw-quad generation.

Do not duplicate compatibility checks across downstream owners. The coverage
planner and cache must call the same owner API.

### Step 5: Add Content-Coordinate Page Mapping Proof

Refactor page descriptors and cache lookup so visible motion does not change
semantic identity.

Required behavior:

- Scroll offsets and viewport transforms affect draw placement and sampling.
- Content coordinate rects define page coverage.
- LOD and DPR bucket are fidelity attributes.
- Source window is rasterization input, not a reason by itself to reject a
  compatible content-coordinate page.
- Content versions and row/source identity remain semantic compatibility gates.

Delete any old source-window-specific lookup paths that are no longer the
owner. Keep only the new owner path.

Every committed page must carry the content-coordinate mapping proof described
in the page-cache owner section. Add focused unit coverage that fails if a
previous-grid or lower-LOD page can be drawn without a valid
`contentToTextureTransform`.

### Step 6: Implement Page Cache Exact Vs Compatible Lookup

Replace the current exact-or-missing lookup with explicit lookup modes:

- exact target lookup,
- compatible coverage lookup,
- refinement target generation.

The compatible lookup must use the semantic compatibility predicate and page
mapping proof. It must return structured coverage candidates, not raw pages
that the display composer can reinterpret.

### Step 7: Implement The Coverage Planner And Coverage Proof

Build the planner as the only owner of exact/compatible/hole decisions.

For each visible content rect:

1. Use exact current target page if available.
2. Otherwise use semantically compatible pages, even if they are lower LOD,
   previous zoom bucket, or previous page-grid shape.
3. Subtract compatible coverage from the visible rect.
4. Return only the remaining uncovered area as true holes.
5. Return target descriptors as refinement work.

Wrong-content pages must be rejected loudly and specifically. Do not add silent
fallbacks for content version mismatches.

The planner should emit `RetainedCoverageProof` for each composed frame. Add
unit tests for exact coverage, compatible lower-LOD coverage, previous-grid
coverage, partial coverage subtraction, and rejected stale content.

### Step 8: Wire Display Composer To Exact, Compatible, True-Hole Order

The display composer should consume the coverage planner result directly:

1. draw exact pages,
2. draw compatible pages,
3. draw true-hole fallback only from `trueHoleRects`.

The display composer must not infer holes from target descriptor misses,
texture upload backlog, queue state, or fidelity readiness.

### Step 9: Replace Pending Strips With True-Hole Rendering

Remove current pending stripe visuals from normal retained publication.

For true holes:

- first preference: draw the retained section body background,
- second preference: draw a subtle non-pattern placeholder only for true holes,
- never draw repeated light horizontal stripes over a section body.

The fallback visual must be visually distinct from row content but quiet enough
that a transient true hole is not worse than the old freeze.

This step is only valid after the planner prevents quality-only misses from
becoming true holes. A cosmetic replacement of stripes with quieter fills does
not satisfy the plan by itself.

### Step 10: Refactor Zoom Refinement

Make zoom bucket changes refinement-only for existing compatible content.

Implementation details to enforce:

- Active zoom keeps drawing the current compatible page generation.
- Target bucket pages enqueue as refinement work.
- A target bucket can replace old pages incrementally only where coverage is
  complete for that region.
- Lower-LOD pages remain protected while visible or near-visible.

The display frame should publish current motion even if target LOD work is
backlogged, without showing true-hole fallback unless no compatible page exists.

### Step 11: Refactor Native Island Attach And Detach

Split active native island placement from passive page replacement.

Implementation details to enforce:

- Active island attach/detach is driven by current motion geometry.
- Passive content under the active row is allowed to be temporarily stale only
  when it is occluded by the native island or semantically unchanged.
- Passive snapshot refresh is committed as a content transaction after coverage
  exists.
- Clicking one row must not invalidate unrelated retained pages.
- Blur/detach must not reveal stale passive content for the active row.

### Step 12: Refactor Scheduler Work Classes And Memory Budgets

Replace broad interaction deferral with work classes:

- `interactive-active-island`,
- `visible-true-hole`,
- `visible-refinement`,
- `near-visible-prefetch`,
- `offscreen-cleanup`.

Give `visible-true-hole` a guaranteed small budget even during interaction.
Give `visible-refinement` an opportunistic budget that preserves frame pacing.
Let multiple small visible pages upload in a frame when the measured budget has
room.

Interaction may reduce refinement budget, but it must not impose a categorical
"no refinement while interacting" rule when the measured frame budget has
headroom.

Implement the hard memory budget buckets in the page-cache owner section before
enabling broad old-page protection. Add tests proving prefetch and refinement
cannot evict the only visible compatible page.

### Step 13: Update Diagnostics And Chrome Recording Summaries

Update retained Chrome repro events to report the new coverage/fidelity model.
The logs should make the new behavior auditable:

- true-hole area should be zero during zoom/click once compatible content
  exists,
- compatible coverage may be high while fidelity is refining,
- target refinement backlog should explain temporary lower fidelity,
- active island attach should not correlate with unrelated true holes.

Remove obsolete hold/lag/pending-strip diagnostics after new diagnostics are in
place.

### Step 14: Remove Obsolete Tests And Update Focused Unit Coverage

Update unit tests around:

- page cache exact vs compatible lookup,
- content compatibility rejection,
- content-coordinate mapping proof,
- composed-frame coverage proof,
- coverage planner subtraction,
- lower-LOD fallback draw quads,
- old/new page generation protection,
- native island handoff preserving passive coverage,
- native island blur/detach preserving passive correctness,
- scheduler work-class prioritization.

Delete tests that assert the old pending-strip publication model. Do not add
tests that only restate implementation internals.

### Step 15: Run Full Verification

Required final verification:

- `pnpm -C frontend exec vitest run src/gpuFlow`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts`
- focused retained Settings Playwright specs, including the new failing-first
  zoom/click visual continuity tests
- a large-scene performance run covering panning, zooming, retained section
  scrolling, and mixed interaction on an All Settings-like scene
- the broader retained/GPU Flow Playwright batch used for previous retained
  compositor work
- a Chrome recording of the original reproduction flow
- `./scripts/quality/check.sh`

Do not narrow final verification to only changed files unless a blocking
environment issue makes the full related suite impossible. If that happens,
record the exact command that failed, the blocker, and the residual risk. Do
not mark the refactor complete from focused tests alone.

For the final Chrome recording, report:

- no repeated gray/white horizontal placeholder bands,
- p95 frame interval relative to observed refresh cadence,
- max frame interval,
- long task count and max duration,
- scene size and retained row/section counts,
- panning, zooming, section scrolling, and mixed-interaction results,
- true-hole visible area over time,
- compatible vs exact coverage over time,
- semantic compatibility rejection reasons over time,
- bounded-progress blocker reasons, if any,
- protected compatible page count and bytes over time,
- whether the run was on 120 Hz-capable hardware/browser settings.

## Acceptance Criteria

The refactor is complete only when:

- The failing-first visual continuity test fails before implementation, and
  the full zoom/click/rapid-interaction/large-scene guardrail set passes before
  handoff.
- Zooming in/out retained sections keeps content visible without repeated
  horizontal placeholder lines.
- Clicking retained text-like rows does not blank or stripe unrelated section
  content.
- Motion publishes near display cadence during pan, zoom, section scroll, and
  native island handoff.
- On 120 Hz-capable hardware/browser settings, large-scene panning, zooming,
  and retained section scrolling achieve p95 frame interval at or below
  `8.33ms`; on capped hardware, results are refresh-aware, near display
  cadence, and explicitly reported with residual risk.
- Large-scene performance runs have no long tasks over `50ms`, no repeated
  dropped-frame streaks, and no visible stalls.
- Semantic compatibility is centralized in one owner API with structured
  compatible/incompatible results and explicit rejection reasons.
- Every committed page used for compatible drawing carries content-coordinate
  mapping proof, and previous-grid/lower-LOD drawing uses that proof.
- Every composed frame carries an auditable coverage proof, and true-hole
  fallback is drawn only from `trueHoleRects`.
- Missing target LOD pages are reported as refinement backlog, not visible
  content holes.
- True-hole fallback appears only when no semantically compatible content page
  exists.
- True-hole fallback has no repeated row-like horizontal structure.
- Quality-only misses are fixed at the coverage/planner layer, not hidden by a
  quieter placeholder treatment.
- Wrong-content pages are never drawn as fallback.
- Old compatible pages are protected until replacement coverage exists.
- Old-page protection is scoped to visible and near-visible content, with
  reported protected page count and bytes.
- Protected compatible pages are governed by hard memory budget buckets, and
  refinement or prefetch cannot evict the only visible compatible page.
- Native island blur/detach does not reveal stale passive retained content.
- Stable visible true holes and settled zoom refinement have bounded-progress
  diagnostics or explicit blocker reasons.
- Obsolete pending-strip and held-frame publication concepts are removed.

## Likely Files To Touch

- `frontend/src/gpuFlow/retainedDisplayFrame.ts`
- `frontend/src/gpuFlow/retainedTexturePages.ts`
- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedTexturePageVisuals.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`
- `frontend/src/gpuFlow/retainedTextureUploadScheduler.ts`
- `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx`
- `frontend/src/gpuFlow/GpuFlow/flowRetainedPageMaintenance.ts`
- `frontend/src/gpuFlow/GpuRetainedContentPageFrameSurfaces.ts`
- retained compositor diagnostics under `frontend/src/gpuFlow/GpuFlow/`
- focused GPU Flow unit tests beside those files
- retained Settings E2E tests under `frontend/tests/e2e/settings/`

## Risks

- Lower-LOD compatible drawing can look soft during zoom. That is acceptable
  if it is temporary and content remains correct.
- Keeping old compatible pages protected can increase texture memory. The cache
  needs explicit visible/near-visible protection and eviction metrics.
- Text-like row content versions must be precise. Over-broad compatibility can
  show wrong row values; over-narrow compatibility can recreate true holes.
- A quiet true-hole fallback can hide a real coverage bug if diagnostics are
  weak. The diagnostics must report true-hole area clearly.
- 120 Hz proof depends on local hardware and browser settings. A capped run can
  prove continuity but not close the full 120 Hz performance risk.
