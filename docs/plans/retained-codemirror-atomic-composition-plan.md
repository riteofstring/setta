# Retained CodeMirror Atomic Composition Plan

## Goal

Make retained text-like parameter controls render as one coherent editor surface
across inactive, active, scroll, pan, and zoom states.

The target invariant is:

`editor pixels are DOM-derived; retained content owns placement, clipping, scrolling, and composition atomically`

Inactive previews should look like the active editor except for caret and
selection. During retained overflow scrolling, editor preview pixels must stay
locked to their row geometry in every frame.

## Current State

- Inactive retained CodeMirror controls are rendered from DOM-derived preview
  textures.
- Active retained CodeMirror controls are mounted as DOM islands, but the island
  wrapper adds an extra background, inset shadow, outline, and padding. This
  makes active mode visibly different from inactive mode.
- Inactive retained CodeMirror previews are emitted as independent late HTML
  overlays. They are positioned in world coordinates after retained content page
  resolution.
- Retained content pages can use fallback or stale fallback pages during fast
  scroll. Because the passive editor previews are separate late overlays, the
  base retained row pixels and editor preview pixels can be composed from
  different retained scroll generations.
- One independent preview texture per visible text-like field increases texture
  upload and draw pressure during pan, zoom, and retained overflow scrolling.

## Non-Goals

- No backward compatibility shims, legacy support paths, migrations,
  transitional adapters, dual-read/write paths, old-field aliases, silent
  compatibility fallbacks, or compatibility layers.
- Do not preserve the current late-overlay preview path once retained-owned
  preview composition exists.
- Do not patch the scroll bug with delayed updates, debounce windows, pixel
  nudges, heuristic scroll correction, or GUI-settings-specific cases.
- Do not reimplement CodeMirror layout, syntax highlighting, selection,
  wrapping, caret, or placeholder behavior in canvas.
- Do not make renderer counters the primary test assertion. Counters may be
  captured as diagnostics, but the test must fail on the user-visible bug.

## Principles

1. Active and inactive text-like controls share one visual contract. They differ
   in interactivity, not in size, padding, background, focus shell, font, line
   height, or row position.
2. Passive editor previews are retained-surface-local content, not generic
   late overlays.
3. A frame must never compose retained row pixels and passive editor pixels from
   different retained scroll windows or content generations.
4. If the retained renderer draws stale base content during a scroll burst, it
   must draw the matching stale editor preview generation or omit passive editor
   pixels for that frame.
5. Active editors remain real browser editors. Typing, selection, caret, IME,
   autocomplete, and clipboard behavior must not depend on retained preview
   texture readiness.
6. Normal pan and zoom should be transform-only after retained editor preview
   textures are warm.

## Work Plan

### 1. Add failing user-visible regression coverage

Add Playwright coverage that captures the experienced bugs and currently fails.
The tests should be visual and behavioral, not assertions about internal surface
counts, texture names, or fallback counters.

Add an active/inactive parity test:

- open the settings project on the GPU surface
- locate a retained single-line CodeMirror-backed field such as `gui.maxZoom`
- capture the inactive control rect and cropped pixels
- activate the control
- assert the active editor remains aligned to the same rect
- assert active mode does not introduce a different background, extra outline,
  shadow shell, or horizontal padding shift
- assert a caret or selection is visible as supporting evidence that the live
  editor is active

Add a retained overflow scroll stability test:

- open the settings project with the `gui` retained section visible
- scroll the section overflow area through the rows shown in the repro
- capture frames during the scroll motion
- assert text-like preview pixels remain attached to their row labels and row
  bounds in every captured frame
- fail if preview text overlaps a neighboring row, lags behind its row, advances
  ahead of its row, or remains stationary while row labels move

The tests may record scroll offsets, retained fallback counts, texture upload
bytes, and preview source counts for debugging, but those diagnostics must not
be the pass/fail condition.

### 2. Define A Shared Retained Editor Visual Contract

- Factor passive preview and active island styling into a shared retained editor
  frame contract.
- Make the contract own control rect, padding, clipping, background, disabled
  state, error state, font, line height, wrapping policy, and focus affordance.
- Remove active-island-only backgrounds, inset shadows, outlines, and padding.
- Override CodeMirror active-state defaults that paint a second shell around the
  editor.
- Keep the active DOM island wrapper as geometry and clipping infrastructure
  only.
- Add focused frontend coverage for the shared style contract where useful, but
  keep the Playwright parity test as the main guardrail.

### 3. Move Passive Preview Records Into Retained Content

- Replace retained text-like preview late overlays with retained-surface-local
  preview records.
- Express preview records in retained content coordinates, not world-space late
  overlay coordinates.
- Include retained surface id, row id, row content version, retained scroll
  window, editor policy, value, placeholder, language, theme key, disabled
  state, error state, control rect, source rect, and texture content key.
- Derive passive preview clipping from the same retained overflow clip stack as
  the base retained rows.
- Suppress the passive preview record immediately when the row has an active
  editor.
- Delete the old late-overlay preview registration after the retained-owned path
  is in use.

### 4. Add Retained Preview Page Or Atlas Management

- Add a retained editor preview page or atlas manager owned by the retained
  content surface.
- Batch visible and overscan passive preview DOM sources into retained preview
  pages or atlas regions instead of one independent texture per field.
- Key cached preview content by retained surface, retained scroll/source window,
  row id, row content version, theme key, device pixel ratio, editor policy,
  dimensions, value, placeholder, language, disabled state, and error state.
- Invalidate dirty row regions only. A change in one field must not force all
  visible editor previews to rerender.
- Keep overscan bounded and aligned to the retained content page window.
- Track diagnostics for page hits, atlas hits, row invalidations, upload bytes,
  omitted previews, and source count.

### 5. Compose Base Pages And Preview Pages Atomically

- Extend retained page resolution so a frame selects both a base retained page
  generation and a matching editor preview page generation.
- Compose editor preview pixels inside the retained content compositor rather
  than as late overlay visuals.
- If exact current preview pages are unavailable but matching stale base and
  stale preview pages exist, draw the matching stale pair.
- If no matching preview generation exists, omit passive editor pixels for that
  frame and request the missing preview work.
- Apply clipping, opacity, scale, and z-order once through the retained content
  compositor.
- Expose diagnostics that identify the selected base generation and selected
  preview generation for each retained surface.

### 6. Keep Active Editors Authoritative While Focused

- On activation, immediately suppress the passive preview for that row.
- Position the active DOM island from the same retained row metric and control
  rect used by the passive preview.
- Clip the active DOM island through the retained section overflow clip.
- Keep local editing independent of retained preview texture readiness.
- On blur or commit, invalidate only the affected row preview and let the
  retained preview page update through the normal dirty-row path.

### 7. Remove Obsolete Paths

- Delete the retained text-like late overlay source path.
- Delete any normal visible canvas text renderer for text-like editor values.
- Remove feature flags or branches that only exist to preserve the old preview
  implementation.
- Keep diagnostics only for the retained-owned preview path.

### 8. Rebaseline Pan And Zoom Performance

- Capture a before report from the failing implementation and an after report
  from the retained-owned preview implementation.
- Store append-only notes under `perf/`.
- Measure pan and zoom frame time, retained page cache hits, preview page or
  atlas hits, upload bytes, preview source count, draw count, and active editor
  transform update cost.
- Add automated performance guardrails only for measurements that are stable
  enough to avoid noisy failures.

### 9. Verify End To End

- Run the new failing-first Playwright tests and confirm they pass after the
  implementation.
- Run focused Vitest coverage for the retained editor visual contract and
  retained preview page or atlas manager.
- Run the relevant frontend checks for the touched files.
- Use Chrome DevTools visual verification on the active `gui.maxZoom` repro and
  the retained `gui` overflow scroll repro.

## Acceptance Criteria

- The first tests in this plan fail against the current implementation and pass
  after the retained-owned preview implementation.
- Active and inactive `gui.maxZoom` look like the same control except for the
  live caret or selection.
- During retained overflow scrolling, inactive text-like preview pixels stay
  visually attached to their rows in every captured frame.
- Retained row pixels and passive editor preview pixels are never composed from
  different retained scroll windows or content generations.
- Focused editors remain real DOM editors with immediate typing, caret,
  selection, IME, autocomplete, and clipboard behavior.
- Passive preview composition uses retained preview pages or an atlas, not one
  independent late overlay per field.
- The old late-overlay preview path is removed.
- Performance notes show whether pan and zoom recovered and identify any
  remaining cost.
