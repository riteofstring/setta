# GPU Flow Atomic Retained Display Frame Refactor Plan

## Context

The retained runtime frame compositor refactor made GPU Flow keep more runtime state, but the latest Chrome recording shows the displayed frame is still coupled too tightly to the desired frame for the current zoom, active element, section coverage, and cache state.

The visible failures are user-facing, not just implementation counters:

- Scrolling in some sections becomes slow.
- Section content flashes while zooming.
- Section content flashes when a text input is activated.
- Scrolling a section becomes much slower with a text input active, especially while zoomed in.

The logs are sufficient to identify the broad failure mode:

- On text input activation, passive snapshot coverage changes identity. The recording showed section snapshot count and passive row count dropping, ready passive rows dropping to zero, and blank rows jumping for the section. That explains the flash.
- On zoom to a high level, retained page targets grow sharply. The recording showed a frame starting with no drawable or fallback pages and many missing pages, then refilling across later frames. That explains the zoom flash.
- The scroll flush path itself is cheap. The slow feel is coming from compositor/page work, high zoom page pressure, and frame gaps while many retained pages are rebuilt.
- Wheel ownership appears to hand off to the retained section path, so the editor is not the main event routing culprit. The focused text input changes retained coverage and runtime workload in a way that makes scrolling miss frame budgets.

The principled fix is to make the compositor transactional: desired retained state can change immediately, but the user-visible display frame and interaction geometry only advance when there is a complete, displayable replacement or a valid last-known-good fallback. A partial frame must never blank already visible content.

No backward compatibility or transitional code is required. Replace the current paths directly and delete obsolete code as each new owner becomes authoritative.

## Ideas To Borrow From The HTML-In-Canvas Examples

The examples in `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` point toward a cleaner long-term model.

### WICG / Official HTML-In-Canvas Model

Relevant repos:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official`
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/hot-tips/html-in-canvas`

Useful principles:

- Treat DOM snapshots as frame inputs with lifecycle rules. The browser snapshots canvas descendants before paint; drawing during paint uses that frame's snapshot, and DOM mutations during paint are visible in later frames.
- Separate layout and hit testing from visible painting. `layoutsubtree` children can participate in layout and interaction while the canvas decides when to draw them.
- Use returned transforms to keep native DOM interaction aligned with the drawn texture instead of remounting or remeasuring unrelated content.
- Use device-pixel sizing as an explicit owner boundary. The canvas pixel buffer, CSS size, and DPR should be coordinated by one subsystem.
- Do not draw from a source before it has a valid snapshot. If a snapshot is not ready, the compositor should keep the previous visible content instead of publishing blanks.

GPU Flow should borrow the lifecycle, not the exact API. We need a local equivalent of "snapshot before paint, publish atomically after readiness."

### Three HTML Render Interaction Model

Relevant repo:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render`

Useful principles:

- Treat native HTML interaction as an overlay derived from texture-space hit testing, not as a reason to rebuild the full rendered content tree.
- `RaycastInteractionManager` maps the pointer to UV coordinates, moves the native HTML element so the sampled texture pixel is under the pointer, and lets the browser provide caret, selection, focus, and input behavior.
- Interaction should be event-driven and scoped to the single active island. Non-active content should remain stable.

GPU Flow should activate one native editing island from the currently published display geometry. Activation should not invalidate passive rows or force a full section source replacement.

### Compiz-Web Transition Model

Relevant repo:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/compiz-web`

Useful principles:

- Old and new page textures can coexist while a shader composites between them.
- A new state does not need to replace the old visible state until both sides of the transition are available.

GPU Flow does not need shader page transitions for this fix, but it should borrow the old/new texture lifetime rule. The previous retained display frame remains publishable until the replacement frame has enough coverage to display without blanks.

### Html-In-Canvas-Cracks Resource Model

Relevant repo:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-cracks`

Useful principles:

- Keep geometry in viewport CSS pixels and sample content using scroll-dependent offsets. That allows scroll to be cheap and avoids rebuilding geometry just because the viewport moved.
- Paint should own canvas pixel buffer size, scene root scale, and texture readiness. Resize scheduling should not partially update these independently.
- Preserve stable logical texture objects where renderer code holds references, while reallocating the underlying GPU resource when size changes.
- Clamp DPR and texture dimensions to prevent extreme zoom from exploding resource pressure.
- Render a known valid fallback while texture content is not ready.

GPU Flow should give one subsystem ownership over retained page pixel dimensions, scale buckets, and texture allocation. Scroll should mostly change sample transforms, not source identity.

## Target Architecture

Introduce an explicit retained display pipeline with three separate states:

1. `DesiredRetainedFrame`
   - The newest model state requested by React, zoom, scroll, focus, resize, settings data, and section layout.
   - This can change often and can be incomplete.

2. `PreparedRetainedFrame`
   - A build transaction with source snapshots, page descriptors, coverage readiness, texture readiness, and memory budget decisions.
   - This can be partially complete, but it is not user-visible.

3. `PublishedRetainedFrame`
   - The atomic frame used for canvas drawing, hit testing, wheel ownership, active input placement, and section scroll geometry.
   - This must never contain missing visible coverage unless the product intentionally displays an explicit loading state.

The current problem is that pieces of the desired/prepared frame are leaking into the published frame. The refactor should make that impossible by construction.

## Non-Goals

- Do not preserve old compositor APIs for compatibility.
- Do not keep parallel old and new render paths.
- Do not add heuristic fallbacks that silently guess missing geometry or content.
- Do not make tests assert internal debug counters as the acceptance criterion.
- Do not solve this by reducing visible quality globally. Lower level-of-detail is acceptable only as a stable last-known-good or explicitly budgeted fallback during transient zoom.

## Step 1: Add Failing User-Visible Performance Tests

The first change should be tests that reproduce the exact observed behavior and fail on the current implementation. These tests should measure frame cadence, visual stability, and interaction behavior, not internal implementation details.

Recommended location:

- `frontend/tests/e2e/gpu-flow/retained-display-frame-regression.spec.ts`

Recommended fixtures:

- Use the existing app path and data needed to open GPU Flow with the same kind of large section content seen in the Chrome recording.
- Prefer a deterministic local test project or generated test data checked into the E2E fixture path.
- The fixture must include at least one long section with many rendered rows and at least one text input inside that section.
- The test should run with normal browser rendering enabled. Do not mock the compositor.

Required failing tests:

1. `zoom does not blank visible section content`
   - Open the GPU Flow view.
   - Scroll to a section with dense content.
   - Capture a baseline screenshot of the section viewport.
   - Zoom to the level that reproduced the issue in the recording or to the nearest deterministic app zoom level.
   - During the next frames, sample screenshots and frame timestamps.
   - Assert that visible section content never becomes mostly blank and that frame gaps stay within a defined threshold after an initial bounded input response window.
   - The assertion should allow expected scale changes but reject full-section disappearance.

2. `focusing a text input does not blank surrounding section content`
   - Open the same dense section.
   - Capture a baseline screenshot.
   - Click or keyboard-focus a text input inside the section.
   - Sample screenshots for several animation frames.
   - Assert that surrounding non-active section content remains visible.
   - Mask only the caret and active input text area if needed. Do not mask the whole section.

3. `focused input does not degrade section scroll cadence`
   - Focus a text input inside the section.
   - Wheel-scroll within the section for a fixed distance.
   - Collect requestAnimationFrame intervals, long task entries, scroll offset progression, and screenshots.
   - Assert that the section scrolls continuously and that frame cadence stays within a threshold comparable to the unfocused case.
   - The assertion should compare observed browser behavior, not debug log counters.

4. `high zoom retained coverage is visible-first`
   - Zoom in until retained page pressure is high.
   - Scroll through a dense section.
   - Assert that the currently visible area is prioritized over offscreen retained pages by measuring what the user sees: visible content should stay present and scroll should progress without multi-frame blank gaps.

Instrumentation guidance:

- Use Playwright plus CDP tracing only as a measurement mechanism.
- Record `requestAnimationFrame` deltas from the page.
- Record `PerformanceObserver` long tasks where available.
- Capture small viewport screenshots around the section at several moments after the input.
- Use image analysis for "mostly blank" and "content disappeared" checks.
- Store regression recordings or compact perf reports in `perf/` as append-only artifacts when doing the implementation work.
- Keep thresholds explicit and justified in comments near the tests.

Expected initial result:

- These tests should fail on the current implementation because the current compositor can publish frames where visible section coverage is missing after zoom or focus activation.

## Step 2: Define The Atomic Frame Contract

Add a small, authoritative compositor model that makes frame publication explicit.

Proposed core concepts:

- `RetainedFrameId`
- `RetainedSourceId`
- `RetainedSourceRevision`
- `RetainedPageId`
- `RetainedScaleBucket`
- `DesiredRetainedFrame`
- `PreparedRetainedFrame`
- `PublishedRetainedFrame`
- `RetainedFrameTransaction`
- `CoverageReadiness`
- `TextureReadiness`

The contract should enforce:

- Hit testing reads only `PublishedRetainedFrame`.
- Canvas drawing reads only `PublishedRetainedFrame`.
- Active input placement reads only `PublishedRetainedFrame`.
- Section wheel ownership reads only `PublishedRetainedFrame`.
- React/layout updates can produce `DesiredRetainedFrame`.
- Snapshot and texture builders can produce `PreparedRetainedFrame`.
- Only the transaction publisher can replace `PublishedRetainedFrame`.

Publication rule:

- Publish a prepared frame only when every currently visible page has either ready content for the new frame or an explicitly valid fallback from the previous published frame at a compatible content revision and transform.
- If this condition is not met, keep drawing the previous published frame and continue preparing the new one.

This is the central invariant. All later implementation choices should preserve it.

## Step 3: Make Source Identity Content-Based

Focus, caret state, and zoom should not change the identity of unrelated passive section content.

Refactor source identity so it is based on:

- Section id.
- Row or segment id.
- Content revision.
- Layout revision.
- Scale bucket.
- Theme/style revision if it affects rendering.

It should not be based on:

- Whether a text input is active.
- Whether the active input overlay is currently mounted.
- Transient caret blink state.
- The current target zoom while an older compatible scale bucket is still publishable.
- Scroll offset, except where a source genuinely renders different content for different scroll windows.

When a text input activates, the passive source for surrounding content should remain the same source. If the active row must be hidden under a native input overlay, mask or replace only that active island in the published frame transaction. Do not cause the section's passive row set to drop and rebuild.

## Step 4: Split Native Interaction Islands From Passive Snapshots

Create a dedicated active-island manager.

Responsibilities:

- Resolve the active element from `PublishedRetainedFrame` hit geometry.
- Place the native input overlay using the same transform used to draw the retained content.
- Keep the passive snapshot sources mounted and stable while the input is focused.
- Mask only the active input island in the canvas if double-painting would occur.
- Route wheel and pointer events based on the published hit geometry.
- Return focus/selection changes to the app model without invalidating unrelated section content.

This borrows from `three-html-render`: interaction is a focused native DOM overlay aligned to texture-space geometry. Activation is not a request to rebuild the entire passive section.

## Step 5: Introduce Page-Level Coverage Transactions

Change retained coverage from "the section has a ready snapshot list" to "each visible page or row segment has a readiness state."

For each page or row segment, track:

- Source id.
- Source revision.
- Layout rectangle in CSS pixels.
- Scale bucket.
- Texture allocation id.
- Content readiness.
- Last published compatible fallback, if any.
- Memory cost.

The publisher should evaluate visible coverage page-by-page:

- Ready new page: draw it.
- Compatible fallback page: draw the previous published page with the correct transform.
- Missing visible page: do not publish the new frame yet.

This directly addresses the zoom flash where a new target set is published before any page is drawable.

## Step 6: Make Scroll A Transform-First Fast Path

Scrolling within a section should update viewport-relative transforms first and schedule content refinement second.

Implementation direction:

- Keep row/segment geometry in stable section-local or viewport CSS pixel coordinates.
- Update scroll offsets and sample transforms without rebuilding source lists.
- Recompute visible page targets after the transform update.
- Prepare newly visible pages in priority order.
- Keep drawing old compatible pages until replacements are ready.
- Avoid clearing page texture bindings just because the scroll target changed.

This borrows from `html-in-canvas-cracks`: geometry can stay stable while the sampling offset follows scroll. The user's immediate scroll should be a transform update, not a content invalidation event.

## Step 7: Redesign Zoom And Level-Of-Detail Scheduling

Zoom should never publish a blank frame while waiting for high-resolution pages.

Required behavior:

- During active zoom, keep the last published compatible scale bucket visible.
- Publish higher-resolution pages only when visible coverage is ready.
- Prioritize the viewport and near-viewport pages before offscreen retained pages.
- Bound the number of target pages per frame.
- Clamp DPR and texture dimensions to an explicit maximum.
- Treat high zoom as a resource scheduling problem, not as permission to request every retained page immediately.

Suggested scheduler shape:

1. Visible pages at current interaction position.
2. Near-viewport pages in scroll direction.
3. Remaining retained pages within the budget.
4. Offscreen prefetch only when frame cadence and memory pressure are healthy.

Resource policy:

- Maintain a hard texture memory budget.
- Evict offscreen pages before visible pages.
- Prefer preserving a lower-resolution visible fallback over allocating a higher-resolution offscreen target.
- Record budget decisions in structured diagnostics.

This should fix the recording pattern where high zoom creates a large target set, exhausts budget, and leaves the visible frame missing for multiple frames.

## Step 8: Give One Owner To Pixel Buffers And Texture Lifetime

Create a single resource owner for retained page textures.

Responsibilities:

- Convert CSS pixel rectangles and scale buckets to device pixel allocations.
- Clamp dimensions.
- Allocate, resize, and dispose GPU textures.
- Preserve stable logical handles where render code needs stable references.
- Mark texture content readiness separately from allocation existence.
- Prevent draw calls from using an allocation whose content revision is not ready.

This borrows from `html-in-canvas-cracks`: resize and scale changes should not leave renderer references pointing at stale or mismatched GPU resources, and readiness must be explicit.

## Step 9: Replace Broad Invalidations With Revisioned Invalidations

Audit every path that currently invalidates retained section content.

Replace broad invalidations with specific revision changes:

- Content revision for actual row/content changes.
- Layout revision for size or position changes.
- Style revision for theme/font/style changes.
- Scale bucket revision for resolution changes.
- Interaction island revision for active native overlay changes.

Activation of a text input should update the interaction island revision and at most the active row mask. It should not update the passive content revision for the whole section.

Zoom should update the desired scale bucket and scheduler targets. It should not erase the published lower-scale frame.

Scroll should update scroll position and visible targets. It should not update content revisions.

## Step 10: Rework Diagnostics Around The New Contract

The current logs were useful, but after the refactor they should describe the atomic frame pipeline directly.

Add structured logs for:

- Desired frame created.
- Prepared frame started.
- Source snapshot ready.
- Page texture ready.
- Prepared frame rejected for publication with exact missing visible pages.
- Prepared frame published with visible coverage counts.
- Fallback page used with source revision and scale bucket.
- Active island attached/detached with source id and published geometry id.
- Scroll fast path applied.
- Zoom scheduler target counts and budget decisions.

Avoid logs that only expose internal implementation details without tying them to user-visible publication decisions.

## Step 11: Delete Obsolete Paths

Because no compatibility layer is required, delete replaced paths as the new owners become authoritative.

Expected deletions or simplifications:

- Any code path that lets desired frame state directly mutate the drawn frame.
- Any source readiness path that treats section snapshot count changes as publishable before coverage is ready.
- Any activation path that rebuilds unrelated passive row sources.
- Any zoom path that clears visible pages before replacements are ready.
- Any scroll path that requires full source remount for ordinary section scroll.

Do this in the same refactor series rather than leaving dormant alternate paths.

## Step 12: Verification

Verification should happen in this order:

1. Confirm the new E2E tests fail on the current implementation.
2. Implement the atomic frame contract and make the tests pass.
3. Run targeted frontend tests:
   - `pnpm -C frontend exec vitest run <relevant-unit-tests>`
   - `./scripts/run-playwright-e2e.sh <gpu-flow-retained-display-frame-spec>`
4. Use Chrome DevTools performance recording on the same reproduction:
   - Zoom into the dense section.
   - Activate a text input.
   - Scroll while focused.
   - Confirm no full-section blank frames.
   - Confirm frame gaps are reduced and visible content remains present under high zoom pressure.
5. Save before/after performance reports under `perf/` as append-only notes for the implementation PR.
6. Run `./scripts/quality/check.sh` unless the developer narrows scope.

## Acceptance Criteria

The refactor is complete when:

- The first failing E2E tests pass without masking the whole affected section.
- Zooming does not blank visible section content while new LOD pages are prepared.
- Focusing a text input does not blank surrounding section content.
- Scrolling with a focused input has comparable frame cadence to scrolling without focus at the same zoom level.
- The published frame contract is enforced by code structure, not by scattered call-site discipline.
- Hit testing, drawing, active input placement, and wheel ownership all read from `PublishedRetainedFrame`.
- Desired or prepared frames cannot become visible until the visible coverage rule passes.
- High zoom uses visible-first scheduling with explicit memory and texture limits.
- Obsolete broad invalidation paths and transitional compatibility code are removed.

## Implementation Notes

This is a larger refactor, but it is the right level of change for the failures in the recording. The issue is not one missing debounce or one expensive handler. The compositor currently allows incomplete retained state to become user-visible. The long-term fix is an atomic display-frame boundary, with active input and zoom treated as transactions over stable published content.

The tests should anchor the refactor to what the user actually experiences: no visible blanks, stable focus activation, and acceptable scroll cadence.
