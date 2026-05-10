# Retained Text-Like Editor HTML Surface Plan

## Goal

Make text, code, and textarea parameter controls inside retained canvas sections
render with the same editor semantics whether they are inactive or active.

The UI invariant is:

`text-like parameter pixels are owned by DOM/CodeMirror; canvas owns placement, clipping, scrolling, and composition`

Inactive previews must match the active editor for font metrics, syntax
highlighting, wrapping, placeholder behavior, line breaks, theme, and clipping.
Active editors must remain live browser editors. Retained canvas drawing must not
reimplement CodeMirror.

This plan complements `docs/plans/active-codemirror-native-island-plan.md`. That
plan makes the focused editor visibly authoritative. This plan removes the
inactive-preview mismatch and adds the row-metric model needed for multiline
controls.

## Current Evidence

- The DOM-only branch already has the right component boundary:
  `TextInputCodeMirror` renders `DummyCodeMirror` while inactive and real
  CodeMirror while active.
- The partial-canvas HTML/GPU plan kept that boundary and added GPU-flow control
  attributes to both dummy and real CodeMirror nodes.
- The retained canvas path diverged from that model: inactive text-like controls
  are drawn by `retainedContentTextLikeCanvas.ts`, while active controls are
  mounted as native DOM islands through the retained parameter island renderer.
- Retained row metrics are fixed at `PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX`.
  That makes multiline content, wrapping, and active editor growth collide with
  neighboring rows unless the editor is forced to be single-line.

## Non-Goals

- No backward compatibility shims, legacy paths, migrations, dual-read/write
  paths, old-field aliases, silent compatibility fallbacks, transitional
  adapters, or compatibility layers.
- Do not emulate CodeMirror syntax highlighting, wrapping, line layout,
  selection, or placeholder behavior in canvas.
- Do not keep two normal visible renderers for the same text-like control.
- Do not make every offscreen text-like control a fully live CodeMirror editor.
- Do not infer multiline behavior from the current string contents. Line policy
  must come from owner-defined parameter/editor metadata.
- Do not add a second parameter value model for the GPU surface.

## Principles

1. `TextInputCodeMirror` remains the single owner of editable text-like editor
   behavior.
2. `DummyCodeMirror` or a factored passive preview component remains the single
   owner of inactive CodeMirror-like pixels.
3. Retained canvas rows draw row structure, labels, ports, status, selection,
   drag markers, and non-text controls. They do not draw text-like editor text.
4. Row height is explicit metadata, not an incidental result of canvas text
   wrapping.
5. Single-line controls must reject or normalize newlines at the editor layer.
   Multiline controls must reserve enough row height or scroll internally.
6. HTML-in-canvas sources are virtualized to visible rows plus overscan.
   Offscreen rows are represented by metrics and hit records, not mounted DOM.
7. Go-owned contracts remain authoritative when editor policy crosses backend,
   Python, or TypeScript surfaces. Generated frontend surfaces should be
   extended rather than mirrored by handwritten local types.

## Target Architecture

### Editor Policy

Introduce an owner-defined text-like editor policy for every retained text-like
control:

```ts
type TextLikeEditorPolicy = {
  readonly editorKind: "code" | "text" | "textarea";
  readonly language: string | null;
  readonly linePolicy: "single-line" | "multiline-fixed" | "multiline-auto";
  readonly maxVisibleLines: number;
  readonly minVisibleLines: number;
  readonly wrapLines: boolean;
};
```

The exact type name can follow the local code style, but the information must be
explicit. `TextParam`, `TextAreaParam`, `CodeParam`, parameter name editing, and
any numeric/string controls that use CodeMirror must map through this policy.

Initial behavior should be conservative:

- `single-line`: fixed compact row height; CodeMirror rejects Enter and paste
  normalizes newlines to spaces.
- `multiline-fixed`: row height is derived from
  `minVisibleLines`/`maxVisibleLines`; the editor scrolls internally when
  content exceeds the visible line budget.
- `multiline-auto`: only supported after the measured-row pipeline exists.
  This is not a fallback mode.

### Passive Editor Preview Sources

Add a retained text-like preview source layer that renders visible inactive
text-like controls as HTML-in-canvas sources. Each preview source uses
`DummyCodeMirror` or a factored non-interactive preview component that shares
the same parser/theme/wrapping implementation.

The preview source layer should be built like the existing overlay source
layers:

- derive visible text-like preview records from retained scenes
- mount direct canvas-child source hosts with `HtmlSurfaceSourceLayer`
- register them as `GpuHtmlSurfaceOverlayLayout` entries
- upload them through the existing HTML texture pipeline
- compose them above retained row structure and below active DOM islands

Passive preview sources should be non-interactive. Retained hit records still
own activation, focus handoff, keyboard navigation, and DOM island creation.
The passive preview exists to produce matching pixels, not to become a hidden
input target.

### Active Editor Islands

Active text-like controls continue to use the native DOM island path, but the
active island geometry must be derived from the same editor policy and row
metrics as the passive preview.

When a text-like row is active:

- retained canvas draws row structure but not text-like editor text
- passive preview for that row is hidden or suppressed
- the active `TextInputCodeMirror` island is the only visible editor surface
- CodeMirror tooltips and validation UI keep using the canvas-aware portal roots

### Retained Canvas Row Structure

Replace the visible text drawing responsibility in
`retainedContentTextLikeCanvas.ts`.

The retained canvas text-like control renderer should keep only structural
chrome that is cheaper and stable in canvas:

- background or underline
- focus/selected/error border affordance
- disabled visual treatment
- hit and row structure support

It must not draw `displayValue`, wrapped preview text, syntax-highlighted text,
placeholder text, or ellipsized text as the normal visible path.

### Variable Row Metrics

Replace the single retained `rowHeight` assumption with per-row metrics:

- `GpuRetainedContentRowInput` gains explicit row sizing or editor policy data.
- `GpuRetainedContentRowMetric` includes `height` in addition to `y`.
- content height becomes the end of the last row metric.
- visible range resolution uses row metric bounds, not `index * rowHeight`.
- hit records, row control rects, label rects, popups, drag previews, keyboard
  reveal, scroll paging, retained page rasterization, and page invalidation all
  read per-row metric height.

Fixed-height rows remain the common case, but they should be represented as
per-row metrics with equal heights rather than as a separate constant-height
contract.

### Measurement For Multiline Auto

`multiline-auto` requires measured DOM, not canvas estimates.

Implement it only after fixed policy rows work:

- mount measurement-only preview sources for visible and overscan auto-height
  rows
- measure the actual preview element block size with the same width, theme,
  language, wrapping, and value as the visible preview
- key the measurement cache by editor policy, value/version, width, theme, and
  zoom-independent CSS size
- publish measurement changes through the project GPU layout owner so retained
  scene construction gets new row metrics
- cap auto-height with explicit `maxVisibleLines`; excess content scrolls inside
  the editor

There should be no heuristic text measurement path. If the DOM measurement is
not available yet, the row uses its policy minimum until the next measured layout
frame.

## Implementation Plan

### 1. Add failing user-visible coverage

- Add a Playwright E2E test for the settings GUI repro:
  - open the settings project on the GPU surface
  - locate a retained text-like field such as `gui.maxZoom`
  - capture inactive pixels
  - click to activate the field
  - assert the active editor aligns with the inactive preview and shows a live
    caret/selection
  - press Enter in a single-line field and assert no neighboring row overlap or
    visual row growth occurs
- Add a second test for a true multiline text/code field:
  - verify the inactive preview reserves the expected multiline row height
  - activate the editor and type/paste multiple lines
  - assert row bounds, clipping, and neighboring rows remain coherent
- The primary assertions must be visual/user-facing. DOM existence is supporting
  evidence, not the pass condition.

### 2. Define the editor policy owner

- Add the explicit text-like editor policy in the parameter owner path.
- Derive policy from existing authoritative parameter metadata and generated
  types. If Go-owned metadata must expose a missing field, add it through the
  Go owner and regenerate downstream TypeScript/Python surfaces.
- Extend `createProjectGpuTextLikeControlDescriptorIfSupported()` to carry the
  policy instead of only `editorKind`.
- Add focused Vitest coverage for the policy mapping.

### 3. Enforce line policy in CodeMirror

- Update `getExtensions()` and `TextInputCodeMirror` usage so
  `single-line` has a hard editor contract:
  - Enter does not insert a newline
  - pasted newlines are normalized according to the policy
  - wrapping follows the explicit `wrapLines` field
- Keep multiline behavior explicit for `multiline-fixed` and
  `multiline-auto`.
- Add tests that exercise actual CodeMirror extension behavior where practical,
  not just helper return values.

### 4. Convert retained row metrics to per-row heights

- Replace constant-height retained scene assumptions with per-row metric height.
- Update:
  - `retainedContentScene.ts`
  - `retainedContentSceneTypes.ts`
  - retained hit testing
  - retained keyboard navigation and reveal
  - retained scrolling
  - retained page frame surfaces
  - retained page rasterization and invalidation
  - project GPU param content layout
- Keep fixed 24px rows by assigning each row a 24px metric. Do not keep a
  parallel constant-height code path.
- Update existing retained content tests and property tests to cover mixed row
  heights.

### 5. Build retained text-like preview records

- From each retained scene, derive visible text-like preview records using the
  row metric, row control rect, clip rect, editor policy, value, placeholder,
  theme mode, and z-index.
- Do not infer geometry from DOM queries.
- Give each preview a stable surface id based on section id, retained surface
  id, row id, and control role.
- Suppress preview record creation for the active editor row.
- Add unit coverage that preview records match retained hit/control geometry.

### 6. Add the passive preview source layer

- Add a `useGpuFlowRetainedTextLikePreviewSources()` hook beside the existing
  GPU flow overlay source hooks.
- Render preview sources with `HtmlSurfaceSourceLayer`.
- Render source content with a non-interactive CodeMirror preview component
  extracted from `DummyCodeMirror` if needed.
- Append the resulting layouts to `htmlSurfaceOverlays` so they use the normal
  HTML texture upload/composition path.
- Mark preview textures dirty on value, placeholder, language, theme, width,
  policy, and validation-affecting class changes.
- Do not route pointer or keyboard interaction through the passive preview DOM.

### 7. Remove canvas text-like preview drawing

- Change the retained canvas text-like renderer to draw only structural chrome.
- Delete canvas wrapping, ellipsis, newline normalization, syntax-preview, and
  placeholder text helpers once the passive preview layer owns visible text.
- Keep hit records and control descriptors because retained interaction still
  owns activation.
- Add tests that assert text-like control draw commands do not include visible
  text in the retained canvas path.

### 8. Align active islands with row policy

- Update `projectGpuParamDomIslandGeometry.ts` and the active retained island
  renderer so island rect/content rect height comes from row metrics and editor
  policy.
- Ensure active islands clip to the retained content surface but do not shrink
  below the row's policy height.
- Suppress retained preview and retained text for the active row.
- Reuse the existing `TextInputCodeMirror` active path rather than creating a
  retained-specific editor.

### 9. Add measured multiline-auto support

- After fixed multiline rows pass, add the DOM measurement cache for
  `multiline-auto`.
- Use measured DOM element height from the same preview component.
- Feed measurement changes back into retained scene construction through the
  project GPU layout owner.
- Rebuild retained scenes and content surfaces when measurement keys change.
- Cap height using policy `maxVisibleLines`; overflow becomes editor-internal
  scrolling.

### 10. Baseline and re-measure performance

- Before implementation, record baseline performance for dense settings
  sections with many retained rows:
  - idle frame cost
  - pan/zoom frame cost
  - texture upload count and bytes
  - number of mounted passive preview sources
  - memory pressure and eviction behavior
- Store the baseline in `perf/` as an append-only report.
- After implementation, record the same scenario and compare.
- The intended budget is visible rows plus overscan, not all text-like controls
  in the project.

### 11. Verify the full flow

- Run targeted Vitest suites for:
  - CodeMirror line policy
  - retained row metrics
  - retained visible range and hit testing
  - retained keyboard navigation/reveal
  - retained text-like preview record extraction
  - GPU flow overlay source registration
- Run the new Playwright regressions.
- Run `./scripts/quality/check.sh`.
- Perform Chrome DevTools visual verification for:
  - inactive text-like preview parity with active CodeMirror
  - single-line newline rejection
  - multiline fixed-height behavior
  - pan/zoom with visible preview textures
  - active editor island clipping and alignment

## Acceptance Criteria

- Inactive retained text-like controls use DOM/CodeMirror-derived pixels, not
  canvas-emulated text.
- Active retained text-like controls use the same `TextInputCodeMirror` path as
  the rest of the app.
- Single-line controls cannot insert newlines or visually grow into neighboring
  rows.
- Multiline controls have explicit row height policy and do not overlap
  neighboring rows.
- Retained row metrics support mixed heights without separate legacy paths.
- Passive preview DOM is virtualized to visible rows plus overscan.
- Pan and zoom remain transform-only for unchanged textures.
- No backward compatibility, migration, legacy, transitional, or compatibility
  code is added.

## Suggested Execution Order

1. Add the failing Playwright regressions.
2. Add explicit editor policy metadata.
3. Enforce CodeMirror line policy.
4. Convert retained rows to per-row metrics.
5. Derive text-like preview records from retained scenes.
6. Add passive preview HTML source layer.
7. Remove canvas text-like preview drawing.
8. Align active DOM islands with row policy and metrics.
9. Add measured `multiline-auto` support if still required.
10. Baseline, re-measure, and run full verification.
