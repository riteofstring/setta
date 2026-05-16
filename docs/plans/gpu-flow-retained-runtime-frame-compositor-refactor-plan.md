# GPU Flow Retained Runtime Frame Compositor Refactor Plan

## Goal
Make retained section rendering, native input activation, internal section scroll, and zoom refinement come from one sampled runtime frame so visible content cannot change, blur permanently, or stop appearing scrollable after an input is activated.

This is a larger refactor. It should remove the current split between compositor frame generation, hidden text-like snapshot sources, DOM/native input islands, hit testing, and scrollbars. We do not need backward compatibility, transitional dual paths, or legacy adapters.

## Current Failure
The latest Chrome recording shows three user-visible failures:

- After scrolling deep inside a retained section, clicking a text-like input can make section content change, overlap, or look malformed.
- Zoomed retained section content stays blurry after zoom settles.
- After the click-induced content mismatch, section scroll can appear stuck even though wheel events may still update runtime scroll offsets.

The logs point to one root class of bug: retained runtime state is sampled through more than one path. The compositor frame uses runtime-scrolled page descriptors, while the hidden DOM source layer for text-like snapshots is still derived from a retained snapshot scene that does not update on ordinary runtime scroll. Input activation then remounts or changes the source layer at a different runtime scroll window, causing visible content, active input geometry, and page coverage to disagree.

The zoom blur is the same architectural issue plus scheduler pressure. At high zoom the target page count grows sharply, stale lower-resolution fallback pages remain visible, and upload work reaches a budget-exhausted state without making eventual progress on the remaining visible high-resolution pages.

## Known Split Today

The current code already moved several hot paths toward runtime sampling, but it has not established one retained frame owner yet.

- `createGpuRetainedContentFrameGeneration` builds compositor page surfaces and text-like snapshot descriptors from runtime scroll offsets.
- `useGpuFlowRetainedTextLikeRowSnapshotSources` still mounts hidden text-like source DOM from a React `scene` input and `getGpuRetainedTextLikeRowSnapshotSources(scene)`, which does not receive the same sampled runtime scroll offsets as the compositor frame.
- `GpuFlowDomIslandLayer` samples active DOM island geometry independently from the compositor frame.
- Retained hit testing and hover/scrollbar visuals consume runtime state through separate helper paths instead of a published frame object.
- Page cache and upload scheduling know about page descriptors and drawable revisions, but they do not have a frame-level contract that proves the descriptor, source element, native island, hit-test rect, and scrollbar came from the same sample.
- The latest recording also shows high-zoom starvation: after zoom settles, retained pages can stay budget-exhausted with visible stale fallback coverage and no upload progress.

## Ideas To Borrow From HTML-in-Canvas Examples

The example repos reinforce the same direction rather than suggesting a small patch.

- The WICG HTML-in-Canvas proposal treats drawn pixels and live DOM hit targets as a synchronized pair. `drawElementImage()` returns the transform needed to keep the DOM element aligned with its drawn position. GPU Flow should have the same invariant: draw descriptors and DOM island/source transforms must be derived from the same sampled runtime frame.
- The proposal's `paint` event model is frame-scoped. A paint snapshot is immutable for that frame, and DOM changes made during paint affect later frames. GPU Flow should similarly publish immutable retained runtime frames instead of letting scroll, source mounting, and activation mutate separate layers mid-frame.
- The official examples explicitly size the canvas backing store to the intended pixel grid to avoid blur. The exact sizing differs across native/polyfill demos, but the transferable lesson is that the renderer needs one owner for CSS-to-device-pixel resolution and must not stretch old allocations after zoom or resize.
- `three-html-render` keeps interaction DOM positioned by a single transform path and, in the raycast manager, parks non-target elements instead of remounting unrelated source trees. GPU Flow should activate a native island from sampled geometry without changing passive page/source ownership.
- `html-in-canvas-cracks` separates viewport-locked geometry from scroll-dependent texture sampling. Scroll is a runtime input to sampling, not a reason to rebuild unrelated DOM. GPU Flow should keep retained content coordinates stable and apply scroll as sampled runtime state.
- The WebGPU demo explicitly disposes or reallocates GPU texture resources when buffer dimensions change, because reusing the wrong allocation causes stretched or soft content. GPU Flow should make retained page LOD and memory ownership explicit so high-zoom pages either match their descriptor or are not committed.

## Decision
Introduce a retained runtime frame model as the single source of truth for each animation frame.

The retained runtime frame should be sampled once from:

- the immutable scene/content registry,
- retained runtime scroll offsets,
- viewport transform and zoom bucket,
- active native island state,
- texture/page cache state.

The same sampled frame must feed:

- retained page descriptor generation,
- hidden text-like snapshot source mounting,
- DOM/native input island placement,
- retained hit testing,
- scrollbars and hover overlays,
- texture upload scheduling.

No layer should derive retained scroll windows independently from base scene state. No click or focus operation should remount passive snapshot sources in a way that changes visible retained content for the current frame.

### Runtime Frame Shape

Keep the retained runtime frame explicit without turning it into a mutable manager object.

- Frame input snapshot:
  - immutable scene/content registry references,
  - scene/content revision,
  - retained runtime scroll offsets and scroll revision,
  - viewport tuple, zoom bucket, and device pixel ratio bucket,
  - active native island state.
- Frame descriptors:
  - sampled retained content surfaces,
  - text-like snapshot source descriptors,
  - retained page/frame surfaces and target page descriptors,
  - native island rectangles,
  - hit-test rectangles/index,
  - scrollbar and hover visuals.
- Frame diagnostics/output:
  - source readiness snapshot,
  - missing visible page count,
  - stale lower-LOD visible page count,
  - visible refinement backlog,
  - memory/budget snapshot.

The frame may snapshot cache and page-manager state, but it must not expose mutable page-manager, texture-cache, DOM-element-map, React state, or scheduler references. Frame id is provenance/debug data. Draw eligibility must be content-addressed, not frame-id-addressed.

### Frame Staging Contract

React source mounting and browser paint readiness are asynchronous relative to frame sampling. The implementation must not assume that a newly sampled source descriptor has a usable DOM element or paint record in the same frame.

The retained pipeline should follow this staged lifecycle:

1. Sample retained runtime frame `N` from scene/content registry and runtime state.
2. Diff and mount hidden snapshot source descriptors for frame `N`.
3. Wait for source readiness and browser paint records where required.
4. Commit/upload retained pages whose descriptors match ready sources.
5. Draw matching committed coverage for frame `N`, or keep last-known-good matching coverage until replacement coverage is ready.

A frame can schedule work before all sources are ready, but it cannot publish blank or mismatched visible retained content just because a newer descriptor exists.

### Published Interaction Frame Contract

Pointer, wheel, and activation targeting must use the last successfully rendered retained runtime frame, not a speculative frame that has been sampled but not rendered.

Newly sampled frames may schedule source mounting and upload work, but they cannot become the targeting frame until their visible geometry has been rendered or explicitly published as the current interaction frame. This prevents hit testing and native island activation from getting ahead of the pixels the user sees.

## First Milestone

The first implementation slice should be a narrow vertical cut through the current failure, not a broad rewrite of every retained subsystem.

1. Add the failing retained-section scroll, input activation, and post-activation scroll Playwright regression.
2. Add the retained runtime frame type and sampler with only the fields needed for the failing path.
3. Move hidden text-like snapshot source mounting to the frame-owned source descriptor list.
4. Move retained page descriptor generation to the same frame-owned source surfaces and snapshot descriptors.
5. Make retained hit testing and native island activation read from the last drawn retained runtime frame.
6. Add fail-loud guards so production code cannot request retained text-like snapshot sources, retained page descriptors, DOM island geometry, hit-test geometry, or scrollbar visuals from base `scene` alone.
7. Add atomic content-addressed page descriptor matching.
8. Delete or privatize the old production `scene`-only source derivation path once the frame-owned path is in place.
9. Replace the zoom refinement scheduler after the frame contract is stable.
10. Migrate scrollbars, hover visuals, and diagnostics to the frame object.

This milestone should make the visible content, hidden passive source DOM, and clicked native input use the same sampled row geometry before the zoom scheduler is replaced.

## Implementation Plan

1. Add failing user-observable regression tests
- Add a Playwright regression spec, for example `frontend/tests/e2e/gpu-flow/retained-runtime-frame-regression.spec.ts`.
- Build a realistic retained section fixture with enough text-like parameters and config rows to require deep internal section scrolling.
- Test the exact reproduction:
  - open the retained section,
  - scroll far down inside the section,
  - capture a screenshot region of the visible section content,
  - click a visible text-like input,
  - type a short value,
  - capture the same region again.
- Assert user-visible behavior, not implementation details:
  - the clicked control remains at the clicked row,
  - surrounding row labels/content do not jump, overlap, blank, or swap to unrelated rows outside a small caret/input-edit mask,
  - the section remains scrollable after activation by verifying visible content moves in response to wheel input,
  - frame pacing during the interaction stays within an explicit budget, such as p95 frame interval and worst long task thresholds recorded by a browser-side probe.
- Add a zoom-settle regression:
  - zoom the retained section to the high-zoom range that reproduced blur,
  - wait for idle/settle,
  - capture a known text region,
  - assert screenshot edge acuity or pixel sharpness is above a calibrated threshold and frame pacing has recovered.
- Add large-scene performance regressions for panning, zooming, and retained section scrolling:
  - use a realistic, complex scene comparable to the Settings project's All Settings page, with many retained sections, dense parameter rows, text-like controls, dropdowns, sliders, and enough content to require internal section scrolling,
  - measure sustained frame pacing for canvas panning,
  - measure sustained frame pacing for viewport zooming,
  - measure sustained frame pacing for retained section wheel scrolling,
  - target 120 fps-class responsiveness where the environment supports it, meaning p95 frame interval at or below 8.33ms during steady-state interaction and no long tasks over 50ms,
  - when the test environment is capped below 120 Hz, use refresh-aware thresholds: p95 frame interval should stay within the display cadence, main-thread interaction work should remain below an 8ms budget, no long tasks over 50ms should occur, and the test output should record the observed refresh cadence so the result is interpretable.
- These tests should fail on the current implementation. They may use existing debug helpers to find a row or target coordinate, but assertions must be based on visible screenshots, input behavior, scroll movement, and frame timing.
- Keep the regression fixtures realistic. They should use production app setup, real retained section content, real pointer/wheel/keyboard interactions, and browser rendering output. Do not assert on internal implementation counters such as source counts, page ids, or scheduler queue lengths except as supplemental debugging output when a user-visible assertion fails.
- Keep the correctness regression first in the implementation sequence. The scroll -> activate input -> type -> scroll still works regression is the required CI correctness gate for the first frame-contract slice.
- Treat large-scene 120 fps-class testing as a dedicated performance gate or CDP verification on known-capable hardware. It should be measured early for baseline and must pass before the refactor is complete, but it should not block the first frame-contract slice unless the environment is explicitly configured for that gate.
- Treat high-zoom sharpness as required when the pixel threshold is stable for the browser environment. If not, keep it as a browser-specific visual gate plus scheduler/model assertions for bounded eventual progress.

2. Define the retained runtime frame contract
- Add a focused frontend type/module for the sampled retained runtime frame.
- Start with the fields needed for the failing vertical path, then expand only as each consumer migrates.
- Keep the contract split into frame input snapshot, frame descriptors, and frame diagnostics/output.
- Make the type immutable after creation.
- The frame should contain immutable descriptors and readiness snapshots. It should not expose mutable page-manager, texture-cache, DOM-element-map, or React state references.
- Fail loudly if a consumer asks for retained descriptors from a base scene without the current sampled runtime frame.

3. Replace split derivation paths with one sampler
- Move retained source-surface derivation, text-like source derivation, page descriptor generation, native island geometry, and hit-test geometry behind the retained runtime frame sampler.
- Remove code paths that update React snapshot source state only when the base scene identity changes.
- Stop reconstructing sampled retained scenes per pointer path. Use stable row/content geometry plus sampled scroll offsets.
- Keep runtime scroll as compositor/runtime state. Do not apply internal section scroll back into the canonical scene just to make downstream layers notice it.

4. Rework hidden text-like snapshot sources around the runtime frame
- Mount hidden text-like sources from the sampled frame's source descriptor list, not from a separately sampled scene.
- Track source readiness by source id, source key, frame revision, and pixel scale.
- Preserve last-known-good passive source/page coverage while new sources are mounting.
- Activating a native input should not remove or replace passive sources for unrelated rows in the same frame.
- Remove or restrict production use of `getGpuRetainedTextLikeRowSnapshotSources(scene)`. Tests may keep a scene-only helper only if it delegates through an explicit frame construction helper.

5. Make page commits atomic and content-addressed
- A retained page descriptor must include surface id, content region, source window, source key/version, content version, zoom bucket, pixel scale, and device pixel ratio bucket.
- A committed page may only draw for a descriptor it actually matches.
- Frame id should be recorded for provenance/debugging, but it must not be the sole validity key. A committed page should be reusable across frames when its content-addressed descriptor still matches.
- Fallback may use a lower-resolution page for the same content region, but must not draw stale pages from a different scroll window or source generation.
- If required sources are not ready, keep the previous matching committed coverage visible and continue scheduling the missing work. Do not publish a frame that exposes blank or mismatched text-like rows.
- Never mix page descriptors from one runtime frame with text-like snapshot source descriptors from another runtime frame.

6. Replace the zoom refinement scheduler
- Separate interaction-time visual scaling from post-interaction resolution refinement.
- During active zoom, allow temporary lower-resolution coverage for responsiveness.
- After zoom settles, prioritize visible high-resolution pages to completion before near-viewport or offscreen work.
- Make memory budgeting deterministic:
  - evict offscreen and lower-priority old LOD pages before blocking visible refinement,
  - cap target descriptors to work that can make progress under budget,
  - record failure only when a visible page cannot fit even after legal eviction.
- Ensure upload work has eventual progress while visible descriptors are missing.
- For a stable settled descriptor set with stable scene revision, viewport/zoom bucket, runtime scroll revision, source readiness state, and memory budget, visible high-resolution missing pages must make bounded eventual progress or diagnostics must identify the exact visible descriptor and fitting blocker.
- Treat repeated budget-exhausted frames with no uploads, no evictions, and visible stale fallback pages as scheduler starvation.

7. Rebuild DOM/native input activation on sampled geometry
- Resolve pointer hits against the last drawn retained runtime frame.
- Activate inputs from that frame's native island rects.
- Keep the active DOM island positioned by the same transform/rect used by the drawn frame.
- Activation is a transaction: the pointer hit consumes the last drawn frame, the active island overlays the clicked control, unrelated passive source lists do not change because of activation, and passive page coverage remains last-known-good until an atomic matching page commit replaces it.
- If the passive snapshot for the clicked row is not ready, activation should still use deterministic row geometry, while passive content remains last-known-good until the next atomic page commit.
- Keep native event ownership explicit: active editor wheel handling should either consume editor scroll or hand off to retained section scroll, and visible content must move when section scroll wins.

8. Simplify retained scroll and hit testing
- Make retained section scroll offsets runtime-only inputs to frame sampling.
- Generate row hit regions from stable content coordinates plus sampled scroll, not by building alternate scenes on pointer events.
- Keep scrollbars as visuals from the same sampled scroll offsets and content extents.
- Remove duplicated scroll-window calculations from overlay/source/page-specific modules.

9. Update diagnostics after the architecture is unified
- Replace implementation-specific logs that compare independently derived source counts with frame-level diagnostics:
  - sampled frame revision,
  - visible retained section ids,
  - missing visible page count,
  - stale-lower-LOD visible page count,
  - source readiness count,
  - active native island id and rect,
  - visible refinement backlog and memory state.
- Keep these diagnostics as support for future Chrome recordings, but do not make the new regression tests assert on them.

10. Verify and clean up
- Run the new failing tests first to confirm they fail before the refactor.
- Capture a large-scene performance baseline before broad compositor changes, even if the 120 fps-class gate runs in a dedicated environment.
- After each major refactor slice, run focused Vitest coverage for retained frame sampling, source readiness, page matching, and scheduler memory behavior.
- Run the Playwright regression spec until the original reproduction passes.
- Run the large-scene GPU Flow performance tests for pan, zoom, and retained section scroll. Treat 120 fps-class pacing as the target on capable hardware; if the environment cannot report that cadence, record the cap and enforce the refresh-aware main-thread and long-task budgets.
- Run the full GPU Flow-related test suite before considering the refactor complete, not just the new regression spec. At minimum this includes:
  - `pnpm -C frontend exec vitest run frontend/src/gpuFlow`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow`
  - existing GPU Flow probe specs under `frontend/tests/e2e/gpuFlow*.test.ts`
- If a GPU Flow-adjacent test is too slow or flaky to run during inner-loop work, document that as temporary inner-loop scope only. Final verification must run the full related suite or explicitly record the blocker and residual risk.
- Run chrome-devtools visual verification for the retained section scenario.
- Run `./scripts/quality/check.sh` before finishing.
- Delete old paths checklist:
  - no production `getGpuRetainedTextLikeRowSnapshotSources(scene)` path,
  - no retained page descriptor generation outside the retained runtime frame,
  - no hit-test scroll-window reconstruction outside frame sampling,
  - no native activation path that remounts unrelated passive source trees,
  - no compatibility adapter that keeps old and new compositor derivation paths alive together.

## Expected Code Areas

- `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx`
- `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx`
- `frontend/src/gpuFlow/GpuFlow/flowOverlays.tsx`
- `frontend/src/gpuFlow/GpuFlow/retainedContentRuntimeSceneSampling.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedTextLikeRowSnapshotSources.tsx`
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/gpuFlow/retainedContentFrameGeneration.ts`
- `frontend/src/gpuFlow/retainedContentRuntimeSampling.ts`
- `frontend/src/gpuFlow/retainedRuntimeFrame.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageTextLikeSnapshots.ts`
- `frontend/src/gpuFlow/retainedTexturePageVisuals.ts`
- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/retainedContentHitTest.ts`
- `frontend/tests/e2e/gpu-flow/`

## Acceptance Criteria

- The long-section scroll, input activation, and post-activation scroll regression passes with screenshot and frame-pacing assertions.
- High zoom settles to sharp retained text in the tested section, without persistent stale fallback coverage.
- For a stable settled high-zoom descriptor set, visible high-resolution missing page count makes bounded eventual progress to zero or reports a specific visible descriptor that cannot fit after legal eviction.
- Clicking an input cannot change unrelated visible retained content in the same section.
- Pointer, wheel, and native input activation target the last successfully rendered/published retained runtime frame, not a speculative sampled frame.
- Section scroll remains visibly responsive after activating and editing a native retained input.
- Large complex scenes comparable to the Settings project's All Settings page meet the pan, zoom, and retained section scroll performance targets: 120 fps-class p95 frame pacing on capable hardware, refresh-aware pacing on capped environments, no interaction long tasks over 50ms, and main-thread work within the documented per-frame budget.
- Large-scene performance has a before/after baseline, even when the 120 fps-class gate runs in a dedicated environment.
- Retained page descriptors, snapshot sources, DOM islands, hit tests, and scrollbars all consume the same sampled retained runtime frame.
- Committed retained pages are validated by content-addressed descriptor identity; frame id is provenance/debug data and is not the sole draw eligibility key.
- Production code cannot derive retained text-like snapshot sources, retained page descriptors, DOM island geometry, hit-test geometry, or scrollbar visuals directly from base `scene` when a retained runtime frame is required.
- No compatibility layer, dual old/new compositor path, or silent fallback remains.
- Full GPU Flow-related Vitest and Playwright suites have been run, with failures fixed or explicitly documented as unrelated pre-existing failures.
- CDP visual verification is completed for the retained section reproduction.
