# Retained Text-Like Row Rendering Refactor Plan

## Goal

Fix the settings canvas issues observed in the Chrome recordings with a principled rendering refactor:

- Inactive text-like controls, including CodeMirror-backed fields, must be visible before click.
- Panning, zooming, and section scrolling must stay smooth with large settings scenes.
- Activation must only add editing behavior; it must not be the first moment text pixels appear.
- The retained canvas runtime must have one owner for live scroll, zoom, activation, dirty state, and texture readiness.

This plan intentionally does not preserve the existing whole-section passive CodeMirror preview pipeline. There is no backward compatibility path or transitional dual renderer.

Status as of 2026-05-13: the row-owned texture slice, retained-scroll ownership tightening, active-editor wheel handoff, and pan/zoom coalescing are implemented and verified with targeted tests plus a fresh post-coalescing Chrome repro recording. The broader original target of moving every activation/focus/hover concern into a single new runtime object is not fully implemented. Based on the latest evidence, that larger consolidation is a follow-up architecture option rather than a prerequisite for fixing the observed passive blanking and active-editor scroll trap.

## Current Diagnosis

The original recording showed that the slow and blank states are tied to retained text-like preview work, not raw GPU draw cost:

- Wheel bursts in settings produced 50-75 ms frame gaps.
- CodeMirror activation clicks produced 90-125 ms gaps.
- GPU frame durations were mostly low.
- During the problematic clicks, retained preview pages were badly behind: one frame reported hundreds of missing preview pages and omitted previews.
- The real CodeMirror editor mounts only after activation, so a row can appear blank until click if its passive preview page did not arrive.

The current design has two expensive properties:

- Passive text-like rendering depends on hidden DOM/CodeMirror-like preview pages that are managed separately from retained row content.
- Scroll and activation state cross React scene state, retained scene state, texture managers, and DOM islands, which makes stale overwrites and late texture readiness easy to introduce.

The principled fix is to make passive text-like content row-owned retained content, not whole-section hidden DOM preview content.

## Follow-Up Recording Findings

The instrumented recording from `recording-20260512-211812` confirms the passive text rendering diagnosis and adds one more required fix: active editor wheel ownership.

Observed passive text findings:

- The recording reached 226 visible passive text-like rows.
- At worst, 193 of those rows had no ready passive pixels; all 193 were blank.
- The clicked rows that appeared only after activation had zero passive coverage immediately before click. Examples include:
  - `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__ListRoot__maxHeight`
  - `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__ListRoot__maxWidth`
  - `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__GlobalVariables__minWidth`
- The passive preview maintenance queue reached 1,085 queued items and 1,092 missing preview pages.
- `settings-section__sectionSizingPolicy` had repeated passive preview source-key mismatches, meaning the hidden preview DOM source was present but not current for the frame that wanted to upload from it.
- While viewport interaction was active, queued preview work could remain non-uploadable even with more than 1,000 missing preview pages, so visible passive text stayed missing during interaction.

Observed performance findings:

- The recording had 24 frame-gap events and 16 long tasks.
- The largest frame gap was 241.6 ms after switching to All Settings.
- CodeMirror activation clicks produced 91-125 ms frame gaps.
- Wheel interactions produced 50-66 ms frame gaps.
- Retained page uploads totaled about 2.7 GiB, with every retained page upload frame budget-exhausted in the summary.

Observed section-scroll bug:

- After activating `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__GlobalVariables__minWidth`, a 296-event wheel burst targeted the active CodeMirror DOM.
- That wheel burst had `deltaY` around `+2312`, but `settings-section__sectionSizingPolicy:param-content:unpinned` stayed at scroll offset `1092`.
- The section was not at a boundary: content height was `5072`, viewport height was `291`, so the max scroll offset was about `4781`.
- Scroll movement resumed only when later wheel events targeted the canvas or the editor blurred.

Conclusion: the large refactor still looks right, but it must also make wheel/event ownership explicit while an active editor overlay is mounted. Row-native passive rendering fixes the blank inactive state only if the row pixels have an independent committed/stale-visible lifecycle; single runtime event ownership fixes the active-editor scroll trap.

## Partial Implementation Audit: `recording-20260512-224054`

Commits `3c79b7787` and `fd9c7b3ab` removed the old whole-section preview source/page manager, added row-scoped passive snapshot source DOM, uploaded those snapshots through retained content pages, and added active-editor wheel ownership logging.

The follow-up user recording, `recording-20260512-224054`, showed that this was not sufficient and that the plan was incorrectly marked complete.

What did improve:

- The old passive preview path is gone from the recording and source tree. The recording contains zero occurrences of `retainedTextLikePreview`, `retained-text-like-preview`, `missingPreview`, `omittedPreview`, or `previewPage`.
- The retained scene still has the correct text values. For example, `gpu-flow-retained-content-visual-state` reports `displayValue` for CodeMirror-backed rows even while the visible pixels can disappear.
- GPU draw CPU duration is not the dominant cost. In that recording, `gpu-flow-frame` p95/p99 duration was about 9.0 ms / 10.9 ms, with a max of 23.5 ms.

What is still broken:

- Passive text pixels still disappear. The row snapshot diagnostics reported:
  - max `blankPassiveRowCount`: 358 of 401 passive rows
  - max `missingPassiveRowCount`: 361 of 401 passive rows
  - final `blankPassiveRowCount`: 120 of 378 passive rows
  - final `missingPassiveRowCount`: 137 of 378 passive rows
- Pan/zoom still has user-visible stalls:
  - 24 frame-gap events
  - max frame gap 258.3 ms
  - wheel frame gaps of 83.3 ms and 75.1 ms
  - 20 long tasks over 50 ms, max 192 ms
- Retained upload churn is still in the same class as the original failure:
  - retained uploads totaled about 2.66 GiB
  - 3,225 retained page uploads
  - 1,067 retained frames reported page budget exhaustion
  - max retained missing page count reached 590

New diagnosis:

- The old hidden whole-section preview dependency was removed, but the new row snapshots are still uploaded as patches into retained content pages.
- Because passive text pixels are coupled to retained page coverage and LOD refinement, a zoom/pan burst can still invalidate hundreds of page descriptors and leave many text-like rows with no committed pixels.
- The implementation narrowed the snapshot source from section to row, but it did not implement the most important requirement: each text-like row needs its own committed texture state, and the compositor must keep the last good row texture visible while new row pixels are prepared.
- The current path also lets text snapshot uploads contribute to retained page upload churn. This keeps pan/zoom expensive because zoom can schedule hundreds of page-sized uploads even when the text values did not change.

The revised plan below keeps the browser-rendered row source DOM. It does not return to canvas-owned glyph layout. The change is that row text pixels must be stored, invalidated, and composited as row-owned textures rather than as retained content page patches.

## Implementation Status: Row-Owned Texture Slice And Recheck

This section records the state after implementing the row-owned texture slice and comparing a new automated Chrome recording against the failed `recording-20260512-224054` recording.

Implemented in this slice:

- Added regression coverage for the key row-owned texture behavior: committed browser-rendered row text remains drawable when retained pages/source DOM are missing, and the last committed row text remains drawable while replacement text upload is pending.
- Added a row-owned text-like texture manager with its own upload budget, memory budget, source-key validation, committed texture lifecycle, and stale-visible fallback behavior.
- Tightened row-owned text upload budgets during active viewport interactions so pan/zoom can keep compositing already committed text while fresh row snapshots catch up.
- Added a row text compositor that draws committed row text textures as late flat surfaces over retained row chrome using the retained page/row geometry contract.
- Removed the partial page-coupled row text patch path from retained content page uploads. Text-like value pixels are no longer uploaded into retained content pages as patches.
- Kept the row-scoped browser source DOM path, so the browser/CodeMirror styling still owns text layout. The canvas only composites browser-rendered row textures.
- Extended Chrome repro diagnostics so row text readiness is reported as row texture state rather than inferred from retained page patch coverage.
- Tightened retained content scroll ownership so project-generated structural scenes no longer accept baked-in retained content scroll offsets. Project code can still issue reveal/scroll intents through the GPU retained runtime object, but live retained content scroll is applied at the GpuFlow runtime boundary.
- Coalesced wheel-driven pan/zoom viewport updates through `requestAnimationFrame` so large wheel bursts do not synchronously apply every intermediate viewport state.
- Kept long-task counts in the zoom responsiveness E2E diagnostics, but removed the hard "zero long tasks in the whole browser task stream" assertion because the calibrated frame-sampling assertions are the observed gesture guardrail.

Recheck recording: `recording-20260512-234457`.

Compared with `recording-20260512-224054`, the recheck shows:

- Final visible passive row blanking improved from `120` blank / `137` missing rows to `0` blank / `0` missing rows.
- Peak visible row texture catch-up still reached `193` missing/blank visible rows during startup or fast scene exposure, but the missing state did not persist through the end of the gesture.
- Retained content page uploads dropped from about `2.66 GiB` across `3,225` page uploads to about `275 MiB` across `375` page uploads.
- Retained page upload budget-exhausted frames dropped from `1,067` to `93`.
- Row-owned text texture uploads are now visible separately: about `304 MiB` across `1,730` row uploads, with `44` row upload budget-exhausted frames.
- Active editor wheel ownership logging fired during the recording, and the targeted active-editor section-scroll E2E passes.

Current interpretation:

- The plan direction did not change. The fix is still browser-rendered, row-owned passive text textures, not canvas-owned text layout.
- The specific persistent disappearing-value issue from `recording-20260512-224054` is fixed in the automated recheck: the final visible passive text blank/missing counts are zero.
- The pan/zoom upload-churn issue improved substantially because text-like value pixels no longer force retained page uploads. The new row upload budget is explicit and bounded, but it should remain part of future performance monitoring.
- The raw recording still includes load/setup frame gaps and long tasks, so it is not clean proof of gesture-window smoothness by itself. The targeted Playwright zoom responsiveness test is the stronger current guardrail for the fixed gesture window.
- A larger single-runtime-state refactor remains a valid architecture target, but the latest evidence does not require moving active editor intent or viewport zoom out of their existing GPU-flow stores to fix the observed passive blanking and active-editor wheel trap. Revisit that larger consolidation only if a later recording shows stale React/runtime overwrites, scroll ownership drift, or activation timing bugs after this row texture split, pan/zoom coalescing, and retained-scroll ownership tightening.

Post-coalescing recording: `recording-current` from
`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-auto-record-root-8aF22A/recording-current`.
This was an automated CDP/Chrome repro against All Settings after the
`requestAnimationFrame` pan/zoom coalescing and active-interaction row-upload
budget changes.

Compared with the failed `recording-20260512-224054`, the post-coalescing
recording shows:

- Final visible passive row blanking stayed at `0` blank / `0` missing rows.
- Peak row texture catch-up still reached `193` missing/blank visible rows while
  the All Settings scene was first exposed, then drained to `0` missing row
  textures by the final frame.
- Retained content page uploads dropped to about `33 MiB` across `90` page
  uploads, with `23` page budget-exhausted frames.
- Row-owned text texture uploads were about `30 MiB` across `46` row texture
  diagnostics, with a max row texture allocation of about `30 MiB`.
- The viewport-interaction span was `659 ms` across `22` frames.
- `gpu-flow-frame` duration was p95 `15.23 ms`, p99 `29.75 ms`, max `43.9 ms`
  where the max frame was the initial frame.
- Retained page uploads after the settle window were `0`; row texture uploads
  after the settle window were about `0.66 MiB`.
- Whole-recording long-task entries still include page load/setup, so they
  remain diagnostic rather than the pass/fail signal for the gesture window.

## Ideas To Borrow From The Example Repos

The example repos under `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` point to several useful principles.

### `html-in-canvas-official`

Relevant ideas:

- Treat paint as the synchronization boundary. `drawElementImage` snapshots are reliable when used in the paint lifecycle; calling outside that lifecycle risks stale or missing frames.
- `requestPaint()` is the explicit way to request a new paint even when children did not change.
- Generated boxes and hit testing need a single transform contract between the drawn canvas location and the DOM location.

How Setta should use this:

- Any remaining DOM snapshot usage should be paint-driven and fail loudly if a current snapshot is unavailable.
- Passive text-like rows should not silently fall back to blank quads while waiting for unrelated whole-section source pages.
- Active editor DOM islands should have a single geometry contract derived from retained row state.

### `html-in-canvas-cracks`

Relevant ideas:

- Use a fixed viewport canvas and feed live scroll state into rendering, instead of trying to mirror compositor scroll with a main-thread transform that lags.
- Keep texture upload state explicit and dispose/recreate textures when the source size changes.

How Setta should use this:

- GPU flow should own live section scroll offsets and zoom/pan state during interaction.
- Rendering should consume that live state directly, and React should provide structural descriptors rather than repeatedly overwriting live retained runtime state.
- Texture readiness should be explicit per row or page, with stale visible content kept until replacement content is ready.

### `html-in-canvas-dot-dev`

Relevant ideas:

- Pixel/readback assertions validate actual rendered output, not internal flags.
- Nonblank canvas checks and screenshot comparisons are good regression tools for canvas-heavy UI.

How Setta should use this:

- New tests should assert visible text ink and smooth frame pacing from screenshots, canvas pixels, and browser performance timing.
- Tests should not assert preview page counts, texture manager internals, or implementation-specific recorder fields.

### `html-in-canvas-room` and `three-html-render`

Relevant ideas:

- Route wheel/scroll through one owner and request paint from that owner.
- Stop event propagation where scene controls and embedded interactive elements would otherwise compete.
- Repaint on element scroll rather than hoping unrelated lifecycle work catches up.

How Setta should use this:

- Section scrolling, pan/zoom gestures, and active editor input should have explicit ownership boundaries.
- Active DOM islands should suppress scene gestures only while the active editor owns the interaction.
- Scroll updates should mark the affected retained rows dirty through the runtime state owner.

## Target Architecture

### 1. Row-Owned Passive Editor Snapshots

Replace whole-section passive CodeMirror preview pages with row-owned browser-rendered snapshots for inactive text-like controls.

The snapshot path should:

- Render the passive text in row-scoped DOM using the same visual rules as the inactive CodeMirror/DummyCodeMirror path.
- Let the browser own glyph layout, wrapping, line height, font fallback, syntax styling, and clipping.
- Snapshot only the row/control-sized source region into row-owned text textures.
- Do not upload passive text pixels by patching retained content pages. Retained content pages may still draw row chrome, labels, borders, switches, and backgrounds, but text-like value pixels need a separate committed texture lifecycle.
- Keep the last good row text texture visible until a new row text texture is ready, including during pan, zoom, retained section scroll, and active editor mount/unmount.
- Draw the committed row text texture through the same retained row geometry and clipping contract as the row content page, composited above row chrome and below the active editor DOM island.
- During zoom, reuse the nearest acceptable committed row text texture while a sharper zoom-bucket texture is prepared. Zoom must not blank text values simply because the exact target zoom bucket is not ready.
- Fail loudly in development/test if a row is asked to snapshot before the matching row-scoped source DOM is mounted and current.

This makes inactive text pixels part of the row's retained content lifecycle. Clicking a field should only mount the active editor DOM island and transfer focus/caret state.

This is not canvas-owned text. Canvas/WebGPU should only composite browser-rendered row textures; CodeMirror/the browser still own text layout and styling.

### 2. Single Runtime State Owner

Long-term architecture target: keep retained interactive state under GPU-flow-owned runtime state rather than mixing live mutable interaction state into project-generated structural scenes.

The state that should be runtime-owned is:

- Pan and zoom gesture updates.
- Section scroll offsets.
- Dirty row/content revisions.
- Row text texture readiness, committed fallback textures, and stale-visible row state.
- Retained page readiness for non-text retained content.
- Active row/control id, hover, and focus state if a future recording shows activation timing or stale React/runtime overwrite bugs.

React/project code should provide structural retained definitions and user intent callbacks. It should not own live retained scroll offsets or overwrite a newer runtime scene with stale React state. The current implementation has completed this for retained content scroll and texture readiness. It still uses the existing project/GPU-flow activation overlay state, which is acceptable for this fix because the latest evidence did not show activation state ownership as the remaining cause after row-owned textures and active-editor wheel handoff were added.

### 3. Active Editor As An Overlay, Not A Renderer Dependency

Active CodeMirror remains a real DOM editor because editing needs browser selection, focus, keyboard input, IME, caret, and accessibility behavior.

The active editor should:

- Mount from the retained runtime's active row/control id.
- Receive geometry from the same retained row layout used for passive rendering.
- Preserve the passive row texture until the active editor is painted and focused.
- Unmount back to passive retained text without changing the row's value pixels unless the value changed.

Activation should be visually close to a no-op except for caret/selection affordances.

### 4. Explicit Active Editor Event Ownership

Wheel and pointer events must have one owner while an active editor is mounted.

The active editor should:

- consume text-editing events that genuinely belong to editing
- let retained section scrolling own wheel events when the editor has no useful internal scroll work
- hand wheel events from an internally scrollable editor back to the retained section when the editor is already at its internal scroll boundary
- suppress canvas pan/zoom gestures only for events that the editor actually owns
- report active-editor wheel handoff decisions in Chrome repro logs

The retained runtime should process section scroll updates from these handed-off wheel events through the same path as canvas wheel events. There should not be a parallel DOM-scroller state for active editors.

### 5. Remove The Whole-Section Preview Pipeline

After the row-owned snapshot path is in place, remove the old passive preview path rather than keeping it as a fallback:

- `retainedTextLikePreviewSources.tsx`
- `retainedTextLikePreviewPageManager.ts`
- project-level passive preview renderers and probes that only exist for that path
- tests that assert preview-page implementation details

Any remaining probes should describe user-visible outcomes: visible text ink, stale-visible replacement, frame gaps, long tasks, and activation visual delta.

## Implementation Plan

### Step 1. Add Failing Observed-Behavior Tests

Add tests first and confirm they fail against the current implementation, including the partial row-snapshot implementation from `3c79b7787`/`fd9c7b3ab`. These tests must assert observed behavior, not implementation details.

The tests should reproduce the user-visible parts of `recording-20260512-224054`, not just the simpler GUI-section cases that passed before. A test is not sufficient if it only proves that the old preview symbols are gone or that the final frame eventually settles.

Candidate tests:

1. `frontend/tests/e2e/settings-retained-codemirror-passive-visibility-regression.spec.ts`
   - Open the settings canvas in the same mode used by `recording-20260512-224054`.
   - Switch to the broad/all-settings view that contains many text-like controls.
   - Apply the recorded-style zoom and section scroll sequence before clicking any text-like control.
   - Capture screenshots of known visible text-like control value areas.
   - Assert each visible value area contains text ink above a minimum threshold.
   - Assert clicking the value area does not reveal substantially more ink than was already visible.
   - Include rows from both `settings-section__gui` and `settings-section__sectionSizingPolicy`, because `recording-20260512-224054` shows failures in the broad All Settings scene and in scrolled retained sections.
   - Sample during the gesture and after the gesture, not only after all texture uploads have drained.

2. `frontend/tests/e2e/settings-retained-codemirror-click-not-required.spec.ts`
   - Navigate to a representative CodeMirror-backed settings row.
   - Capture the value region before activation.
   - Click/focus the row.
   - Capture the value region after activation with caret blink controlled or hidden.
   - Assert the pre-click and post-click screenshots are visually equivalent except for editor affordances.

3. `frontend/tests/e2e/settings-retained-pan-zoom-smoothness-regression.spec.ts`
   - Run a fixed wheel/pan/zoom gesture sequence over the settings canvas.
   - In the browser, collect `requestAnimationFrame` gaps and `PerformanceObserver` long-task entries for the gesture window.
   - Assert the calibrated frame-sampling metrics stay within the accepted gesture threshold, and include long-task counts/durations in failure details.
   - Assert the fixed gesture does not produce sustained retained upload budget exhaustion or GiB-scale upload churn.
   - Assert text-like value regions remain nonblank throughout the same gesture window.
   - Save the timing samples and screenshot artifacts on failure.

4. `frontend/tests/e2e/settings-retained-active-editor-wheel-scroll.spec.ts`
   - Activate a representative CodeMirror-backed row inside a scrollable retained section.
   - Wheel over the active editor while the section is not at either scroll boundary.
   - Assert the retained section scroll position changes in the wheel direction.
   - Repeat at the editor's own internal scroll boundary for multiline editors.
   - Assert no canvas pan/zoom occurs when the intent is section scrolling.

5. Extend the existing screenshot-analysis helpers in `frontend/tests/e2e/settings-retained-visual-analysis.ts` only as needed.
   - Reuse pixel-based ink detection and screenshot comparison.
   - Add generic helpers such as `expectRegionHasTextInk` or `measureInteractionFrameGaps` if they describe observed browser output.

These tests should fail against the page-coupled row snapshot implementation from `recording-20260512-224054` because that path can still present blank passive CodeMirror/text-like fields, can still produce large interaction frame gaps during retained upload churn, and can still lose the stale-visible row texture guarantee during pan/zoom.

Current coverage mapping:

- `frontend/tests/e2e/settings-retained-codemirror-passive-visibility-regression.spec.ts` covers the broad All Settings passive visibility and click-not-required behavior for both `settings-section__gui` and `settings-section__sectionSizingPolicy`.
- `frontend/tests/e2e/settings/settings-retained-interaction-stability.spec.ts` covers the fixed fast zoom responsiveness gesture and records long-task diagnostics in failure output.
- `frontend/tests/e2e/settings/settings-retained-codemirror-scroll.spec.ts` covers active CodeMirror wheel handoff to the owning retained section.
- Focused unit tests in `frontend/src/gpuFlow/retainedTextLikeRowTextureManager.test.ts`, `frontend/src/gpuFlow/retainedContentTexturePageManager.test.ts`, `frontend/src/gpuFlow/retainedContentFrameGeneration.test.ts`, and `frontend/src/gpuFlow/interactions/panZoom.test.ts` cover stale-visible row textures, no retained page text patch uploads, separate row source descriptors, and coalesced wheel pan/zoom viewport updates.

### Step 2. Define The Passive Snapshot Descriptor

Create a pure descriptor for retained passive text-like snapshots.

The descriptor should include:

- text value
- language or plain-text mode
- editor visual mode and CodeMirror/DummyCodeMirror props
- row/control geometry
- visible source rect
- theme and density inputs
- selection-free passive state
- content revision key

Reuse existing retained control descriptors and generated/shared types before adding new TypeScript types. If new frontend-only types are needed, keep them private to the retained text renderer and document why they cannot come from the Go-owned contract.

### Step 3. Build Row-Scoped Passive Source DOM

Move passive source rendering from whole-section hidden DOM pages to row-scoped source DOM.

The source DOM should:

- Reuse the same inactive CodeMirror/DummyCodeMirror visual component used today, or extract the shared DOM component needed to do that cleanly.
- Render one row/control-sized source per visible or near-visible passive text-like row.
- Use the retained row geometry as its source of size and clipping truth.
- Keep source DOM mounted only for rows that need snapshots.
- Publish source readiness keyed by row id, control id, content revision, width bucket, theme, and zoom bucket.

The goal is not to duplicate CodeMirror layout in canvas. The goal is to narrow the browser-rendered snapshot source from whole sections to rows.

### Step 4. Build The Row-Owned Text Texture Cache And Compositor

Implement a retained text-like row texture cache that copies browser-rendered passive values into row-owned text textures, not into retained content page textures.

The row text texture cache should:

- Use the row-scoped source DOM as the source of text pixels.
- Copy only the row/control source rect into a row text texture or texture-atlas slot.
- Key committed row text textures by row id, control id, content revision, width bucket, theme, density, and zoom bucket.
- Keep a committed row text texture visible until a replacement is fully ready.
- Prefer a stale same-content texture over blank output whenever the exact zoom bucket or width bucket is not ready.
- Prioritize currently visible text-like rows before near-visible rows and before offscreen rows.
- Avoid invalidating unrelated row text textures when one row scrolls, activates, changes value, changes width, or changes zoom bucket.
- Keep row text upload work separate from retained content page upload work, with its own budget and diagnostics.
- Ensure pan/zoom can composite existing row text textures without scheduling hundreds of page-sized uploads.

The compositor should:

- Draw retained content pages for non-text retained row content.
- Draw committed row text textures as clipped quads over the matching retained row/control geometry.
- Hide only the passive text texture region covered by an active editor DOM island after the active editor has mounted and painted.
- Never draw a blank row text region when a value-equivalent committed row texture exists.
- Report when a visible row has no committed row texture and no current source DOM, because that is a real readiness bug.

This replaces both the old hidden whole-section preview dependency and the partial page-coupled row snapshot implementation without making canvas responsible for text layout.

### Step 5. Centralize Retained Runtime State

Move live retained interaction state that can overwrite rendering output into a GPU-flow-owned runtime object.

The runtime should be responsible for:

- accepting pan/zoom/scroll events
- updating live section scroll offsets immediately
- computing dirty retained rows
- scheduling row-owned snapshot uploads
- deciding whether a row can reuse a committed text texture, needs a sharper texture, or has no valid fallback
- exposing immutable draw snapshots to the renderer/compositor
- emitting user intent callbacks to React/project code after runtime state is updated

React should keep owning structural settings data and persisted values. It should not own transient retained scroll position or texture readiness after this refactor.

Current status: retained content scroll is runtime-applied at the GpuFlow boundary, row/page texture readiness is owned by texture managers, and wheel pan/zoom viewport updates are coalesced through the existing GPU-flow viewport store. Active DOM island geometry still flows through the existing project overlay path. Do not expand this into a full activation/focus runtime rewrite without a new recording that shows activation ownership causing stale pixels, scroll loss, or timing gaps after the row texture split.

### Step 6. Rework Active Editor Mounting

Make active editor mounting consume the same runtime row geometry as passive rendering.

Activation sequence:

1. Runtime marks the row/control active.
2. Passive row texture remains visible.
3. DOM island mounts at the retained row geometry.
4. Editor paint/focus completes.
5. Runtime hides or visually suppresses the passive text pixels only where the active editor covers them.

Deactivation sequence:

1. Persist any value change through the existing owner path.
2. Runtime increments the row content revision.
3. Passive source DOM refreshes and uploads the row texture.
4. Active DOM island unmounts after replacement passive content is ready or after value-equivalent stale content is still valid.

### Step 7. Route Active Editor Wheel Events Through The Runtime

Add an explicit active-editor event bridge owned by the retained runtime.

The bridge should:

- receive wheel events from active editor DOM islands
- decide whether the editor can consume the wheel for internal scrolling
- forward section-scroll wheel intent to the retained runtime when the editor cannot consume it
- preserve browser editing behavior for selection, focus, keyboard, IME, and internal editor scroll
- emit Chrome repro events for consume versus handoff decisions

This should replace accidental behavior where whichever DOM element receives the wheel event controls whether the retained section scrolls.

### Step 8. Delete The Old Passive Preview Path

The old whole-section preview manager and source renderer have already been removed. Keep that deletion and do not reintroduce a compatibility fallback.

The remaining deletion/refactor work is to remove the partial page-coupled row snapshot upload path. The next implementation should not keep two passive text renderers:

- no whole-section preview fallback
- no retained-content-page patching fallback for text-like row value pixels
- one row-owned text texture cache/compositor path

If the row-owned text texture path cannot produce or reuse a row texture, the test/dev behavior should fail loudly with enough context to diagnose the missing source DOM, descriptor data, or committed fallback state.

### Step 9. Verification

Run targeted verification throughout the refactor:

- `pnpm -C frontend exec vitest run <focused retained snapshot tests>`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-codemirror-passive-visibility-regression.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-codemirror-click-not-required.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-pan-zoom-smoothness-regression.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-active-editor-wheel-scroll.spec.ts`
- `./scripts/record-chrome-repro.sh` for a before/after recording of the same settings gesture
- `./scripts/quality/check.sh`

Record before/after performance results in `perf/` as append-only reports because this is a performance-relevant refactor.

The after recording for the same gesture must be compared against `recording-20260512-224054` and must show:

- no persistent visible passive text blanking during or after the gesture
- no GiB-scale retained upload churn
- no sustained retained page budget exhaustion caused by text-like row rendering
- no interaction frame gaps over the accepted threshold for the fixed gesture
- no app-caused long-task pattern during the fixed gesture window; record any browser long tasks as diagnostic evidence rather than treating whole-page long-task counts as the sole pass/fail signal
- active-editor wheel ownership events when wheel input targets an active CodeMirror editor

Current verification record:

- `pnpm -C frontend exec vitest run src/gpuFlow/retainedTextLikeRowTextureManager.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/retainedContentFrameGeneration.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.retainedControls.test.ts src/gpuFlow/retainedContentRuntimeState.test.ts src/gpuFlow/interactions/panZoom.test.ts` passed.
- Changed-file TypeScript scan passed for the touched retained row texture, retained runtime, project GPU surface, pan/zoom, and E2E files.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-codemirror-passive-visibility-regression.spec.ts` passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-interaction-stability.spec.ts -g "fast settings zoom remains visibly responsive"` passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts -g "all-settings retained section wheel scrolling does not refill the texture backlog"` passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-codemirror-scroll.spec.ts -g "retained active text editor wheel input scrolls"` passed.
- `./scripts/quality/check.sh` passed after the implementation slice.
- `git diff --check` passed.
- Chrome DevTools visual check on `/settings` All Settings confirmed row-owned late flat row texture surfaces were present and the scene looked normally rendered after pan/zoom.
- `recording-20260512-234457` was the first row-owned texture after recording. It satisfies the no-persistent-passive-blanking and no-multi-GiB-retained-upload criteria, but it predated the final pan/zoom coalescing and active-interaction row-upload budget changes.
- The post-coalescing `recording-current` recheck kept final visible passive row blanking at zero, reduced retained page uploads to about `33 MiB`, and recorded `gpu-flow-frame` p95 `15.23 ms` for the automated All Settings pan/zoom repro. Gesture-window long-task/frame-gap thresholds should continue to be evaluated with targeted tests rather than whole-recording totals that include load/setup.

## Acceptance Criteria

- The new failing tests fail on the current partial row-snapshot implementation before the refactor.
- Inactive text-like/CodeMirror-backed fields are visibly populated before click after loading, panning, zooming, and section scrolling.
- Clicking a text-like field does not reveal text that was previously missing.
- The fixed gesture stays within the accepted calibrated frame-sampling threshold, with long-task entries captured as diagnostic evidence for regressions.
- Wheeling over an active editor scrolls the owning retained section when the editor cannot consume the wheel.
- Passive text rendering no longer depends on whole-section preview pages or retained content page readiness.
- Passive text-like value pixels have a row-owned committed texture state with stale-visible fallback semantics.
- The old passive preview pipeline is removed.
- Runtime retained scroll and texture readiness have one owner; pan/zoom wheel updates are coalesced through the GPU-flow viewport store; activation-state consolidation is a follow-up only if fresh evidence shows it is causing stale rendering or scroll bugs.
- Chrome recording after the refactor no longer shows large missing-preview-page bursts because that concept no longer exists for passive text-like rows.
- Chrome recording after the refactor no longer shows row-snapshot blanking equivalent to `recording-20260512-224054`; specifically, visible text-like rows must not remain blank while the retained scene reports nonempty `displayValue`s.
- The fixed gesture does not produce retained uploads in the same class as the failed recordings. It must not upload multiple GiB of retained content, and retained page budget exhaustion must not persist across hundreds of frames.

Current acceptance status:

- Met by the row-owned texture slice: inactive visible text remains populated before click in the automated regression, clicking does not reveal previously missing value text, passive text no longer depends on retained content page readiness, stale-visible row texture behavior is covered, the old preview path is removed, and the after recording ends with zero visible passive blank/missing rows.
- Improved but still monitored: retained page upload churn is no longer in the multi-GiB class, and the post-coalescing recording reduced retained page uploads to about `33 MiB`. Row-owned texture upload budget and catch-up should remain visible in diagnostics and perf reports.
- Covered by targeted E2E: active-editor wheel handoff to retained section scrolling.
- Strengthened by the retained-scroll ownership slice and pan/zoom coalescing: project-generated structural scenes no longer duplicate live retained content scroll offsets, and wheel bursts no longer synchronously apply every intermediate viewport state.
- Not claimed as fully complete by the recording alone: strict no-long-task/no-frame-gap whole-recording thresholds. The targeted interaction tests are the current guardrail for gesture responsiveness, while broader runtime consolidation beyond retained scroll should be driven by fresh evidence of ownership drift rather than by the passive text blanking issue alone.

## Risks And Mitigations

- Passive source DOM can drift from active CodeMirror styling if it stops sharing the same visual component and CSS.
  - Mitigation: keep passive source DOM and active editor CSS/props shared, and screenshot-compare passive output against active editor output.

- Source DOM readiness bugs can still produce blank textures.
  - Mitigation: key source DOM and snapshot descriptors strictly by row/control/content/size/theme/zoom, keep stale row textures visible, and fail loudly on source-key mismatch in development/test.

- Texture memory can grow if row text content is cached too aggressively.
  - Mitigation: give the row text texture cache an explicit memory budget and LRU/visibility-based eviction; tie cache keys to visible rows, content revision, width bucket, theme, density, and zoom bucket.

- Row text textures can drift visually from retained row chrome during fast pan/zoom if they use a different transform or clipping contract.
  - Mitigation: derive row text quads from the same retained row/control geometry used by active editor DOM islands and retained row hit testing.

- Keeping stale text visible can show slightly soft text during zoom before the sharper texture is ready.
  - Mitigation: prefer soft-but-correct same-content text over blank text, and schedule sharper zoom-bucket textures after the interaction settles.

- Page-coupled text upload can accidentally re-enter through convenience APIs.
  - Mitigation: make text-like value pixels ineligible for retained content page patch uploads, and test that a pan/zoom gesture does not enqueue page-sized text snapshot uploads.

- Centralizing runtime state is a larger change than the text renderer alone.
  - Mitigation: keep retained scroll and texture readiness runtime-owned now, and only expand activation/focus ownership after a fresh recording shows that path is still causing stale pixels, scroll loss, or interaction stalls.
