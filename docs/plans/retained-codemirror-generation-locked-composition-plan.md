# Retained CodeMirror Generation-Locked Composition Plan

## Objective

CodeMirror-like values in retained GPU surfaces must behave as one visual system:

- Inactive and active editors use the same DOM-derived visual contract for text position, padding, line height, font, clipping, theme, and control bounds.
- Retained row pixels and retained CodeMirror value pixels are composed from the same layout and scroll generation.
- A stale CodeMirror preview must never be drawn over a newer retained row frame. If a matching preview is not ready, omit the preview for that frame and request the correct one.
- Active editors are interaction islands only. They must not introduce a second visual layout model.

There is no backward compatibility requirement. Remove old paths instead of preserving them.

## Diagnosed Failures

The latest Chrome recording gives enough signal to diagnose the two remaining bugs.

Active versus inactive alignment is not a texture upload problem. The active `Max Zoom` editor is rendered by the real `TextInputCodeMirror` path inside the active DOM island, while the inactive preview is recreated by a separate retained preview renderer. The recording shows the active island wrapper top at `371` and the active CodeMirror line top at `378.4`, putting the line `7.4px` below the island top. The current failing visual test sees active text ink about `3.5px` lower than passive text ink. On the old no-canvas branch, `DummyCodeMirror` and `TextInputCodeMirror` were aligned because they shared the same component tree and section value cell layout. The retained path split those responsibilities.

The overflow scroll bug is a generation mismatch. During scroll, retained rows and retained CodeMirror previews are selected independently. The recording shows retained section rows moving to new scroll offsets while CodeMirror preview source pages are still from adjacent earlier offsets. That produces visible lag even when each individual page is internally correct.

The high-zoom disappearance bug is fixed by retaining DOM-derived CodeMirror pixels, but the long-term design must keep that behavior without allowing independent preview composition.

## Non-Negotiables

- No legacy render paths.
- No migration or transition code.
- No feature flags for old behavior.
- No pixel nudges, magic offsets, or setting-specific fixes.
- No canvas text fallback for CodeMirror values.
- No hand-rolled clone of CodeMirror layout.
- No stale preview composition across scroll or layout generations.

## Plan

### 1. Add Failing User-Visible Regression Tests

Implement tests before changing the architecture. They should fail on the current code and should assert the experienced bug, not internal counters or implementation details.

Add an active/passive alignment test for a real settings value such as `Max Zoom`:

- Open the retained settings surface in the same workflow used by the recording.
- Capture the inactive value text ink.
- Activate the same editor.
- Capture the active value text ink.
- Compare visible glyph bounds, especially left edge and vertical center/baseline, with a tight tolerance.
- Assert that activation does not shift the visible value relative to the row/control.

Add an overflow scroll coherence test for the retained settings section:

- Use the real section with overflow and real retained CodeMirror values.
- Capture row label ink and value ink before scroll.
- Scroll the section and sample immediately during the next animation frames, not only after the UI settles.
- Assert that value ink moves by the same delta as its row label/control.
- Fail if a value appears at a previous scroll offset while the row has advanced.

Keep a high-zoom guardrail:

- Zoom far enough to reproduce the former disappearing-value bug.
- Assert retained CodeMirror value pixels remain visible.

These tests must be screenshot or pixel based. Diagnostic logs may explain failures, but logs must not be the oracle.

### 2. Replace Split Active/Inactive Layout With One Editor Visual Contract

Introduce one retained editor visual component/module that owns:

- outer control rect
- inner editor rect
- font family, size, weight, and line height
- padding and vertical alignment
- CodeMirror class list and theme class list
- disabled, error, placeholder, wrapping, and single-line behavior
- clipping behavior

Both inactive previews and active islands must render through this contract:

- `RetainedEditorPreview` renders the inert DOM source used for texture capture.
- `RetainedEditorActiveShell` renders the interactive CodeMirror island.

The active shell may add focus, caret, selection, and input behavior. It may not add a different alignment wrapper or separate styling model.

Delete the current separate inactive preview layout that manually recreates CodeMirror-looking DOM with independent absolute/flex wrappers. The preview and active paths should differ by interactivity, not by geometry.

### 3. Make Retained Row Layout Produce Editor Records

Retained section layout should produce explicit editor records as part of row layout, not as a later overlay discovery pass.

Each record should contain:

- surface id
- section id
- row id
- row layout version
- value/content version
- row rect in surface coordinates
- editor control rect in surface coordinates
- clipped editor rect
- scroll generation
- source window
- visual contract key
- value text
- placeholder
- language or editor mode
- wrapping/single-line mode
- disabled and error state
- theme key

When a row becomes active, the same record still defines the island geometry, but the retained inactive preview for that row is suppressed immediately.

### 4. Introduce A Single Retained Frame Generation

Create a single generation object for each retained surface frame. Base retained content pages and CodeMirror preview pages must derive from this exact object.

The generation should include:

- surface id
- frame id
- row layout version
- content version
- scroll offset
- retained cache viewport rect
- retained source window rect
- device pixel ratio
- zoom bucket
- theme key
- editor records

This object is the composition contract. A retained base page and an editor preview page are compatible only when they were produced from the same generation id.

### 5. Render Preview Source Pages From Editor Records

Render hidden DOM source pages from the editor records using the shared editor visual contract.

Use the html-in-canvas pattern where useful:

- maintain an offscreen DOM source tree
- key source nodes by stable content identity
- translate the source window explicitly
- render DOM into texture pages
- upload only dirty page regions when possible

The important constraint is that source identity and dirty work are generation-owned. A preview texture is not "the latest value texture"; it is "the value texture for generation N".

### 6. Compose Base Pages And Editor Preview Pages Atomically

The retained compositor must select base retained pages and CodeMirror preview pages as a unit.

Rules:

- Draw base page `N` with editor preview page `N`.
- Draw stale base page `N-1` only with stale editor preview page `N-1`.
- If a matching editor preview page is missing, draw the base page without that preview and enqueue preview work for the current generation.
- Never draw editor preview page `N-1` over base page `N`.
- Never draw editor preview page `N` over base page `N-1`.

This may produce a one-frame omitted value during heavy scroll or upload pressure. That is preferable to visibly wrong lag, because it preserves spatial correctness and makes missing work obvious in diagnostics.

Active editor islands are composed above retained pages and are positioned from the same editor record for the current generation.

### 7. Remove Superseded Paths

After the shared contract and generation-based composition are in place, delete the old retained CodeMirror paths:

- independent inactive preview wrappers
- independent preview page selection by "latest available" source offset
- canvas text or approximate text fallbacks for CodeMirror values
- active-only geometry wrappers that do not use the shared editor visual contract
- stale compatibility adapters between old preview metadata and new editor records

The result should be one retained editor pipeline, not a new path layered over the old one.

### 8. Add Diagnostics That Explain The Composition Decision

Keep diagnostics focused on proving the generation contract:

- current surface generation id
- base page generation id selected for draw
- editor preview generation id selected for draw
- omitted preview reason, if any
- scroll offset and source window for the selected generation
- active island record rect and measured CodeMirror line rect
- row id and value id for each preview record

These logs are for debugging only. The regression tests remain pixel-based.

### 9. Acceptance Criteria

- The active/passive alignment test fails before the implementation and passes after it.
- The overflow scroll coherence test fails before the implementation and passes after it.
- The high-zoom retained value visibility test passes.
- Activating a value does not move visible text more than the agreed pixel tolerance.
- During section overflow scroll, value text and row labels move together frame by frame.
- No retained CodeMirror preview is composed with a different generation than the retained row content beneath it.
- The codebase has no separate inactive CodeMirror visual clone with independent layout constants.
- The active editor island uses the same editor record and visual contract as the inactive preview.

## Why The Earlier Tests Missed This

The earlier checks were too indirect. They verified container geometry or the presence of some CodeMirror-colored pixels, which can pass while the visible glyph baseline is shifted or while a stale value texture is still inside a plausible row area.

The replacement tests must inspect visible ink movement. The user-visible contract is not "a preview exists" or "a rect is close"; it is "the same value appears in the same place before and after activation" and "the value moves with its row while scrolling."
