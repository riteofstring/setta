# Param Dict Canvas/WebGPU Plan

## Goal
Make Param Dict projects smooth by moving the in-scope pan/zoom interface to a
canvas/WebGPU-rendered surface.

The first benchmark is the Settings project's `All Settings` view because it is
a real dense view made from Dict sections. It gives us a constrained surface
with nested params, text-like inputs, color pickers, dropdowns, combobox-style
choices, and switches without taking on every section type at once.

Settings is only the benchmark fixture. The renderer must operate over generic
Param Dict project state, not hard-coded Settings section names, values, param
ids, layout positions, or one-off Settings fast paths.

The target is not HTML-in-canvas. The target is a retained canvas/WebGPU scene
that owns the pan/zoom viewport for in-scope Param Dict sections, plus explicit
interaction handling and a small DOM overlay only when a native editor or native
input is actively needed.

For the in-scope path, section placement, section chrome, section bodies,
scrollbars, rows, controls, pointer hit testing, pan, and zoom should be
canvas/WebGPU-owned. Active editor/input overlays can sit above that surface, but
they should not become the pan/zoom implementation.

The minimap should also be driven from the same retained scene model. The
current app uses an SVG minimap path; for this rewrite, prefer a canvas-rendered
minimap when profiling shows the minimap contributes meaningful DOM, React, SVG,
or selection-sync cost. The minimap must not depend on live section DOM.

Visual parity with the current `go-rewrite` app is a first-class requirement.
The new renderer does not need to be pixel-identical, but Settings Param Dict
sections must look close enough that the rewrite feels like the same product:
same density, spacing, typography, colors, control shapes, hierarchy, and
interaction states.

## Compatibility Policy
This plan intentionally does not include backward compatibility, legacy support,
migrations, transitional adapters, or old/new runtime fallbacks.

- Do not keep a legacy Param Dict DOM body as a runtime fallback.
- Do not add a dual renderer that silently chooses between DOM and canvas.
- Do not add compatibility shims for the `go-rewrite-canvas-html-gpu-surfaces-plan`
  branch or its HTML-in-canvas assumptions.
- Do not preserve old Param Dict rendering internals once the new path owns the
  in-scope behavior.
- Use git history and benchmark reports for comparison, not compatibility code.

Other section types are outside this milestone. They can keep their current
implementation until their own rewrite, but Param Dict sections should have one
owned path in this branch.

## Scope
In scope:
- Settings project's `All Settings` view as the initial benchmark only.
- Generic Param Dict sections, not Settings-specific sections.
- Canvas/WebGPU-owned pan/zoom viewport for in-scope Param Dict sections.
- Minimap rendering derived from the same retained scene model, with a canvas
  implementation preferred if it improves performance.
- Nested param row layout.
- Section placement, section chrome, section bodies, and section-level
  interaction geometry for Dict sections.
- Passive rendering for labels, values, row shells, nesting structure, errors,
  switches, color swatches, dropdown previews, and text/code previews.
- Per-section scrolling inside the canvas/WebGPU surface.
- Pointer hit testing for rows and controls.
- One active DOM overlay for CodeMirror/text editing, combobox search, or native
  color input when needed.
- Performance reports under `perf/` before and after meaningful milestones.

Out of scope for the first milestone:
- Generic HTML-in-canvas rendering.
- Arbitrary embedded DOM widgets inside section bodies.
- Non-Dict section types.
- Settings-specific renderer shortcuts or hard-coded benchmark optimizations.
- Keeping the current SVG minimap as a performance-sensitive dependency for the
  in-scope canvas viewport.
- Full canvas-native CodeMirror replacement.
- Full accessibility parity for inactive canvas-rendered rows.
- Text selection inside inactive canvas-rendered previews.

## Existing Context
The Settings project is materialized by Go as Dict sections with fixed section
width and a grid-style view. The relevant source is
`internal/settingsstate/project_shell.go`.

The current frontend Dict path flows through:
- `frontend/src/components/Section/Layouts/DictArea.tsx`
- `frontend/src/components/Params/ParamItems/ParamGroupContainer.tsx`
- `frontend/src/components/Params/ParamItems/ParamContainer.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`

Prior Settings profiling showed that whole-section previews could restore pan
and zoom smoothness, but activation was expensive because the real DOM body had
to hydrate. This plan avoids that cliff by keeping the passive surface canvas
native and activating only the specific editor or popup that the user is using.

## Core Decision
Use a retained Param Dict scene model for the canvas/WebGPU pan/zoom interface
and render it directly.

Do not try to preserve the current DOM tree, project it into the GPU, or paint
HTML into textures. Dict rows are structured data, so the renderer should draw
the rows directly from project state:
- viewport and minimap transforms
- section bounds
- section chrome/header geometry
- section scroll offset
- visible row list
- row rects
- nesting depth
- param id
- param UI type
- label text
- value preview text
- validation/error state
- control geometry

All hit testing should use this same scene model. Rendering and interaction
must agree on the same row and control rectangles.

## Visual Parity Requirements
The canvas/WebGPU renderer should match the current `go-rewrite` Param Dict UI
closely enough for normal product use.

Required visual anchors:
- section body density and row heights
- label/value alignment
- nested param indentation and hierarchy
- typography, font sizes, and line heights
- light/dark theme colors
- row hover, active, error, and focus states
- switch shape and checked/unchecked colors
- color picker swatches
- dropdown/combobox selected-value appearance
- text/code preview styling
- section scrollbars and clipped content behavior
- minimap placement, viewport mask, section shapes, and selected-section state

Implementation rules:
- Derive renderer constants from existing frontend style tokens and component
  measurements where practical.
- Keep a small visual mapping table for any canvas-only constants that cannot be
  read directly from CSS.
- Do not redesign the Param Dict UI as part of this rewrite.
- Do not use visual parity as a reason to keep the old Dict DOM body alive.

Verification:
- Capture reference screenshots from `go-rewrite` Settings views before major
  renderer changes.
- Capture matching screenshots from this branch after each milestone.
- Compare normal zoom, zoomed-out overview, light mode, dark mode, hovered row,
  active editor, error state, dropdown/combobox, color picker, and switch states.
- Use human review plus screenshot diffs as guardrails. Exact pixel matching is
  not required, but visible spacing, density, and control shape regressions are
  blockers.

## Rendering Architecture
Create a Param Dict canvas/WebGPU pan/zoom surface with three layers of
responsibility.

1. Scene derivation
- Read existing project state and generated contract types.
- Flatten each Dict section's nested param tree into stable row records.
- Compute viewport transform, section placement, section chrome, and body bounds
  without relying on DOM layout.
- Compute minimap bounds and viewport mask from the same scene geometry.
- Compute row heights, indentation, control regions, labels, value preview
  regions, and total section content height.
- Keep section scroll offsets in frontend UI state.
- Avoid introducing new handwritten contract types when generated or owner-owned
  types already exist.

2. Renderer
- Draw section body backgrounds and clipping regions.
- Draw visible rows only, with overscan.
- Draw nesting rails/indentation.
- Draw labels and passive value previews.
- Draw controls:
  - switches as canvas toggles
  - color params as swatches
  - dropdown/combobox params as selected value plus affordance
  - text/code params as passive text previews
- Draw errors and focus/hover state.
- Draw per-section scrollbars.
- Draw minimap section previews and viewport mask from scene geometry when the
  canvas minimap path is enabled.

3. Interaction controller
- Convert pointer coordinates into scene coordinates.
- Hit test section, row, and control regions.
- Handle wheel scrolling over a section body.
- Handle simple control clicks directly.
- Request an active DOM overlay for editing/search/native input cases.
- Commit changes through existing param update actions.

## Text Rendering Strategy
Start with a simple direct text renderer for Param Dict rows:
- Use canvas text measurement for labels and short value previews.
- Cache measurements by text, font, width, and theme.
- Clamp or ellipsize where rows do not need full wrapped display.
- Only wrap where current Param Dict behavior requires it.

`render-tag` is useful as a reference and possible cached helper for richer
passive wrapped text, but it should not be the foundation of the renderer.
It is a rich-text-to-canvas library, not an editor, widget system, or WebGPU
text engine.

If rich wrapped text becomes necessary, evaluate `render-tag` behind a cache:
- render only on state/theme/width changes
- never call it per row per animation frame
- measure initial layout cost before adopting it

## Editing Strategy
Use DOM overlays for active editors.

There is no popular browser code editor whose full editing model is canvas-first.
CodeMirror, Monaco, and Ace are DOM editors. Replacing CodeMirror with a
canvas-native editor would be its own large product.

For Param Dict text/code inputs:
- Inactive rows render as canvas text previews.
- Click/focus on a text-like row opens one DOM CodeMirror overlay positioned over
  the row or as a floating pop-out anchored to the row.
- The overlay owns caret, selection, IME, copy/paste, completions, lint, and
  keyboard behavior.
- Blur/Escape/commit closes the overlay and updates the canvas preview.
- During pan/zoom, either cheaply reposition the overlay or close/commit it.

Alternate editing surface:
- If inline overlay geometry is awkward at small zooms or for large values,
  open the editor in the right pane.
- The right pane can be the dependable editing path for complex or large values.
- This is an editing-mode decision, not a compatibility path to the old Dict
  DOM body.

## Param UI Interaction Strategy
Switch params:
- Render directly in canvas.
- Toggle on click.
- Commit through existing param value update flow.

Color picker params:
- Render swatch and current value in canvas.
- For fixed choices, render a canvas popup/list.
- For arbitrary colors, open a tiny native color input overlay or right-pane
  editor.

Dropdown/combobox params:
- Render selected value in canvas.
- For simple fixed options, canvas popup selection is acceptable.
- For search/typeahead behavior, open a DOM combobox overlay or right-pane
  editor.

Text/code/textarea params:
- Render passive preview in canvas.
- Use CodeMirror or textarea overlay only while active.
- Do not mount CodeMirror for every row.

Nested params:
- Flatten for rendering.
- Preserve visual hierarchy with indentation and rails.
- Expansion/collapse can be implemented directly in the scene model if needed.

## Performance Strategy
Baseline first and record results in `perf/`.

Primary performance rules:
- No DOM-owned pan/zoom interface for in-scope Param Dict sections.
- No live Param Dict row DOM while the canvas renderer owns Dict sections.
- No per-frame React reconciliation for row contents.
- No per-frame text layout for unchanged rows.
- No CodeMirror instances for inactive rows.
- Draw only visible rows plus overscan.
- Keep row geometry deterministic and cached until inputs change.
- Keep simple controls canvas-native where possible.
- Keep active DOM overlays count at one unless a specific workflow proves that
  more are needed.
- Do not add Settings-specific fast paths; improvements must apply to generic
  Param Dict sections.

Important metrics:
- FPS during pan/zoom in Settings All Settings.
- DOM node count while viewing Settings All Settings.
- Canvas/WebGPU frame time.
- Scene derivation time after project state updates.
- Section wheel-scroll frame time.
- Active editor open latency.
- Typing latency inside active editor.
- Commit latency from editor/control to updated canvas preview.

## Implementation Plan
1. Baseline
- Run the existing Settings project `All Settings` view benchmark on the current
  branch.
- Record DOM node count, pan/zoom FPS, and current interaction behavior.
- Append the report under `perf/`.
- Capture `go-rewrite` visual references for Settings Param Dict sections in the
  states listed in the visual parity requirements.

2. Dict scene model
- Add a frontend Param Dict scene derivation module.
- Flatten Dict sections into row records using existing project state and
  generated types.
- Compute deterministic section geometry, row rectangles, and control
  rectangles without DOM measurement.
- Add unit tests for flattening, row geometry, nesting, and visible-range
  calculation.
- Add tests that use non-Settings Dict fixtures so the renderer cannot depend on
  Settings-specific data.

3. Passive renderer
- Add the canvas/WebGPU Param Dict pan/zoom renderer.
- Render section placement, section chrome, section bodies, rows, labels,
  passive values, simple controls, and scrollbars.
- Render the minimap from the same scene model, using canvas if profiling shows
  the current SVG minimap is part of the performance problem.
- Replace the Param Dict DOM body path for in-scope Dict sections.
- Keep non-Dict section behavior untouched.
- Check visual parity against the `go-rewrite` reference screenshots before
  moving on to interaction work.

4. Section scrolling
- Add wheel handling over section bodies.
- Maintain per-section scroll offsets.
- Clip rendering to section body bounds.
- Add hit tests for scrollbar and row regions if needed.

5. Simple interactions
- Implement switch toggling.
- Implement simple dropdown option selection.
- Implement color swatch/choice selection.
- Commit through existing param update actions.
- Re-render from updated project state, not local duplicated truth.

6. Active editor overlays
- Implement a single overlay host above the canvas surface.
- Add CodeMirror overlay for text/code/textarea rows.
- Add DOM combobox overlay where canvas popup is insufficient.
- Add native color input overlay where arbitrary color editing is required.
- Add right-pane editing path for large or awkward values.

7. Polish and hardening
- Add keyboard focus behavior for active overlays.
- Add hover/focus/error visual states.
- Add copy affordance if inactive canvas text selection becomes a real workflow
  gap.
- Add CDP visual checks for Settings views.
- Re-run profiling and append before/after results.

## Testing Plan
Frontend unit tests:
- scene flattening from nested Param Dict data
- non-Settings Dict fixtures
- viewport transform and section geometry
- minimap transform, viewport mask, and section preview geometry
- row geometry
- visible row range and overscan
- hit testing
- section scroll state
- switch/dropdown/color commit dispatch
- overlay placement calculations

Frontend integration tests:
- Settings project renders Dict sections through the canvas path
- wheel over a section scrolls rows without moving the whole canvas unexpectedly
- switch changes persist and redraw
- dropdown/color changes persist and redraw
- text param opens one editor overlay and commits back to project state

E2E/browser verification:
- Settings All Settings pan/zoom visual check
- visual parity check against `go-rewrite` Settings references
- minimap visual and interaction check
- Settings section scroll visual check
- active CodeMirror overlay visual and interaction check
- combobox/color overlay check
- right-pane edit surface check if implemented

Performance verification:
- Capture before/after reports under `perf/`.
- Include FPS, DOM node count, editor activation latency, and typing latency.
- Use chrome-devtools profiling when frame time regressions are unclear.

## Acceptance Criteria
- In-scope Param Dict sections render through the canvas/WebGPU path.
- The pan/zoom interface for in-scope Param Dict sections is canvas/WebGPU-owned,
  not DOM-owned.
- The minimap is derived from the same retained scene model and does not depend
  on live section DOM; use canvas if profiling shows the current SVG minimap is
  a material cost.
- No Settings-specific renderer code paths, hard-coded Settings ids, or
  benchmark-only fast paths are introduced.
- Settings Param Dict sections remain visually close to the `go-rewrite` UI in
  normal and benchmark views.
- Pan/zoom in Settings All Settings is smooth enough to beat the current full DOM
  path by a large margin.
- Inactive Param Dict rows do not mount live row DOM or CodeMirror instances.
- Section-level scrolling works inside canvas-rendered Dict sections.
- Switches, color pickers, dropdowns/comboboxes, and text/code params remain
  editable through either canvas-native interaction, DOM overlay, or right-pane
  editing.
- Active CodeMirror editing uses one overlay and does not reintroduce hundreds of
  editors.
- No legacy Param Dict DOM fallback remains in the in-scope path.
- Focused tests pass.
- Browser visual verification is completed for the Settings benchmark and the
  `go-rewrite` visual parity references.
- Before/after performance notes are recorded under `perf/`.

## Recommended Branching
Continue from the current `go-rewrite-canvas-webgpu-only` branch.

Do not branch from `go-rewrite-canvas-html-gpu-surfaces-plan`. That branch is a
useful reference for prior experiments and performance notes, but its core
assumption is HTML surfaces painted/composited into GPU textures. This plan
removes that assumption.
