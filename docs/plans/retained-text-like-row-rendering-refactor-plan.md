# Retained Text-Like Row Rendering Refactor Plan

## Goal

Fix the settings canvas issues observed in the latest Chrome recording with a principled rendering refactor:

- Inactive text-like controls, including CodeMirror-backed fields, must be visible before click.
- Panning, zooming, and section scrolling must stay smooth with large settings scenes.
- Activation must only add editing behavior; it must not be the first moment text pixels appear.
- The retained canvas runtime must have one owner for live scroll, zoom, activation, dirty state, and texture readiness.

This plan intentionally does not preserve the existing whole-section passive CodeMirror preview pipeline. There is no backward compatibility path or transitional dual renderer.

## Current Diagnosis

The latest recording showed that the slow and blank states are tied to retained text-like preview work, not raw GPU draw cost:

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

Conclusion: the large refactor still looks right, but it must also make wheel/event ownership explicit while an active editor overlay is mounted. Row-native passive rendering fixes the blank inactive state; single runtime event ownership fixes the active-editor scroll trap.

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

### 1. Row-Native Passive Text Renderer

Replace whole-section passive CodeMirror preview pages with a row-native renderer for inactive text-like controls.

The renderer should:

- Derive a pure presentation model from the retained row/control descriptor.
- Use CodeMirror parsing/highlighting data where syntax highlighting is required, but not mount CodeMirror DOM for passive rows.
- Lay out text deterministically for the row's available width, font metrics, wrapping policy, padding, and clipped viewport.
- Rasterize passive value text into retained row content texture segments.
- Reuse the existing retained row texture/page infrastructure where possible, especially the segmented row content version model.
- Keep the last good row texture visible until a new row texture is ready.
- Fail loudly in development/test if a row is asked to render text without the required font, metrics, or presentation data.

This makes inactive text pixels part of the row's retained content lifecycle. Clicking a field should only mount the active editor DOM island and transfer focus/caret state.

### 2. Single Runtime State Owner

Introduce one GPU-flow-owned runtime state layer for retained interactive state:

- Pan and zoom.
- Section scroll offsets.
- Active row/control id.
- Hover/focus state needed by the retained scene.
- Dirty row/content revisions.
- Texture readiness and stale-visible row state.

React/project code should provide structural retained definitions and user intent callbacks. It should not own live scroll offsets or overwrite a newer runtime scene with stale React state.

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

After the row-native renderer is in place, remove the old passive preview path rather than keeping it as a fallback:

- `retainedTextLikePreviewSources.tsx`
- `retainedTextLikePreviewPageManager.ts`
- project-level passive preview renderers and probes that only exist for that path
- tests that assert preview-page implementation details

Any remaining probes should describe user-visible outcomes: visible text ink, stale-visible replacement, frame gaps, long tasks, and activation visual delta.

## Implementation Plan

### Step 1. Add Failing Observed-Behavior Tests

Add tests first and confirm they fail against the current implementation. These tests must assert observed behavior, not implementation details.

Candidate tests:

1. `frontend/tests/e2e/settings-retained-codemirror-passive-visibility-regression.spec.ts`
   - Open the settings canvas in the same mode used by the latest recording.
   - Switch to the broad/all-settings view that contains many text-like controls.
   - Apply the recorded-style zoom and section scroll sequence before clicking any text-like control.
   - Capture screenshots of known visible text-like control value areas.
   - Assert each visible value area contains text ink above a minimum threshold.
   - Assert clicking the value area does not reveal substantially more ink than was already visible.

2. `frontend/tests/e2e/settings-retained-codemirror-click-not-required.spec.ts`
   - Navigate to a representative CodeMirror-backed settings row.
   - Capture the value region before activation.
   - Click/focus the row.
   - Capture the value region after activation with caret blink controlled or hidden.
   - Assert the pre-click and post-click screenshots are visually equivalent except for editor affordances.

3. `frontend/tests/e2e/settings-retained-pan-zoom-smoothness-regression.spec.ts`
   - Run a fixed wheel/pan/zoom gesture sequence over the settings canvas.
   - In the browser, collect `requestAnimationFrame` gaps and `PerformanceObserver` long-task entries for the gesture window.
   - Assert there are no long tasks over 50 ms during the gesture and no interaction frame gap over a calibrated threshold such as 40 ms.
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

These tests should fail now because the current path can present blank passive CodeMirror/text-like fields until activation, can produce large interaction frame gaps during preview-page churn, and can trap wheel scrolling inside an active CodeMirror overlay.

### Step 2. Define The Passive Text Presentation Model

Create a pure data model for retained passive text-like controls.

The model should include:

- text value
- language or plain-text mode
- token runs when syntax highlighting is enabled
- line wrapping result
- visible line range
- font family, size, line height, padding, and color tokens
- selection-free passive state
- content revision key

Reuse existing retained control descriptors and generated/shared types before adding new TypeScript types. If new frontend-only types are needed, keep them private to the retained text renderer and document why they cannot come from the Go-owned contract.

### Step 3. Extract Shared Highlight/Token Logic

Move passive syntax/token extraction out of DOM components into a reusable pure helper.

The helper should:

- Accept the language/config already used by the field.
- Return token runs with stable style categories.
- Be usable by both passive canvas rasterization and any lightweight non-editing preview component that remains in tests or stories.
- Avoid depending on mounted CodeMirror editor state.

The goal is not to duplicate CodeMirror. The goal is to use the same parsing/highlighting source without making DOM rendering a prerequisite for passive visibility.

### Step 4. Build The Row-Native Rasterizer

Implement a retained text-like row rasterizer that draws passive values into row content textures.

The rasterizer should:

- Measure with browser canvas text APIs using the configured font.
- Wrap text according to the row control policy.
- Draw token runs with the row theme colors.
- Clip to the control value rect.
- Produce row content texture segments keyed by row id, control id, content revision, width bucket, and zoom bucket.
- Keep stale row content visible while new content is being rasterized/uploaded.
- Prioritize visible rows before offscreen rows.

This renderer replaces the dependency on hidden whole-section preview DOM for inactive text-like controls.

### Step 5. Centralize Retained Runtime State

Move live retained interaction state into a GPU-flow-owned runtime object.

The runtime should be responsible for:

- accepting pan/zoom/scroll/activation events
- updating live section scroll offsets immediately
- computing dirty retained rows
- scheduling row content rasterization and uploads
- exposing immutable draw snapshots to the renderer
- emitting user intent callbacks to React/project code after runtime state is updated

React should keep owning structural settings data and persisted values. It should not own transient scroll position, texture readiness, or active DOM island geometry after this refactor.

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
3. Passive rasterizer refreshes the row texture.
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

Remove the whole-section preview manager and source renderer once the new renderer passes the failing tests.

Do not keep a fallback to the old preview path. If the new renderer cannot draw a row, the test/dev behavior should fail loudly with enough context to diagnose the missing presentation data.

### Step 9. Verification

Run targeted verification throughout the refactor:

- `pnpm -C frontend exec vitest run <focused retained renderer tests>`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-codemirror-passive-visibility-regression.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-codemirror-click-not-required.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-pan-zoom-smoothness-regression.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings-retained-active-editor-wheel-scroll.spec.ts`
- `./scripts/record-chrome-repro.sh` for a before/after recording of the same settings gesture
- `./scripts/quality/check.sh`

Record before/after performance results in `perf/` as append-only reports because this is a performance-relevant refactor.

## Acceptance Criteria

- The new failing tests fail on the current implementation before the refactor.
- Inactive text-like/CodeMirror-backed fields are visibly populated before click after loading, panning, zooming, and section scrolling.
- Clicking a text-like field does not reveal text that was previously missing.
- The fixed gesture has no long task over the accepted threshold and no frame gap over the accepted threshold.
- Wheeling over an active editor scrolls the owning retained section when the editor cannot consume the wheel.
- Passive text rendering no longer depends on whole-section preview pages.
- The old passive preview pipeline is removed.
- Runtime scroll/zoom/activation state has one owner.
- Chrome recording after the refactor no longer shows large missing-preview-page bursts because that concept no longer exists for passive text-like rows.

## Risks And Mitigations

- Canvas text rendering can drift from CodeMirror DOM styling.
  - Mitigation: share token extraction, theme colors, font metrics, and screenshot compare against active editor output.

- Syntax highlighting support may be incomplete for some languages.
  - Mitigation: fail loudly for unsupported modes in development/test and add explicit renderer coverage for every settings language mode that exists.

- Texture memory can grow if row text content is cached too aggressively.
  - Mitigation: keep row content page eviction explicit and tie cache keys to visible rows, content revision, width bucket, and zoom bucket.

- Centralizing runtime state is a larger change than the text renderer alone.
  - Mitigation: land it as part of the same refactor because otherwise stale React/runtime overwrites can keep reintroducing scroll and activation bugs.
