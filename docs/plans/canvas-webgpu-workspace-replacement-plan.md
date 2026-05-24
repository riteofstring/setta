# Canvas/WebGPU Workspace Replacement Plan

## Goal

Replace the current xyflow/dnd-kit workspace with a single retained
canvas/WebGPU workspace renderer.

The first benchmark and first useful milestone is the Settings project's
`All Settings` view because it is a dense real view made mostly from Dict
sections. Settings is only the benchmark fixture. The renderer must operate over
generic project and Param Dict state, not Settings-specific section ids, param
ids, names, values, or layout shortcuts.

This is not the HTML-in-canvas approach from
`go-rewrite-canvas-html-gpu-surfaces-plan`. The new renderer must draw structured
scene data directly. It must not capture, rasterize, project, preserve, hydrate,
or texture existing React/HTML section DOM.

## Non-Negotiable Architecture

These rules define the architecture. Code that violates them is on the wrong
track.

- The workspace pan/zoom area is one canvas/WebGPU-owned surface, not one canvas
  per section.
- xyflow is completely replaced for the workspace. The app workspace must not
  mount `ReactFlow`, xyflow `Viewport`, xyflow node renderers, xyflow edge
  renderers, xyflow controls, or xyflow minimap.
- The xyflow minimap is completely replaced. The minimap is rendered from the
  retained canvas scene model and must not depend on xyflow nodes, SVG minimap
  nodes, section DOM, or live React section components.
- dnd-kit is not used anywhere inside the workspace. That includes section drag,
  section reorder/reparent, section resize coordination, Param drag/reorder, and
  nested Param drag. Workspace drag/drop is implemented by the canvas interaction
  controller and scene hit testing.
- Passive sections in the workspace are not DOM components. The workspace must
  not mount passive `SectionContainer`, `SectionHeader`, `DictArea`,
  `ParamGroupContainer`, `ParamDndContext`, `ParamDndList`, `ParamSwitch`,
  `ParamContainer`, `ParamUI`, CodeMirror, or resize-handle DOM for sections
  owned by the canvas renderer.
- DOM is allowed only for active overlays that require native/browser behavior,
  such as one CodeMirror editor, one searchable combobox, one native color
  input, popovers, context menus, or app chrome outside the workspace.
- DOM overlays are positioned from scene geometry. They must not own pan/zoom,
  section placement, row layout, scrolling, minimap geometry, or passive
  rendering.
- There is no runtime fallback that silently switches between xyflow and the new
  canvas workspace. During development, comparison can use git history,
  separate worktrees, benchmark artifacts, or explicitly named debug-only
  harnesses, but not a production dual renderer.

## Scope

In scope for the workspace replacement:

- Canvas/WebGPU-owned viewport transform, pan, zoom, coordinate conversion, and
  persistence of the project viewport.
- Canvas/WebGPU-owned section placement, section chrome, section bodies,
  section selection, section drag, section resize, and section hit testing.
- Canvas/WebGPU-owned minimap, including section previews, viewport mask,
  selected-section state, and minimap interactions.
- Canvas/WebGPU-owned Param Dict passive rendering:
  - nested row layout
  - row shells
  - labels
  - value previews
  - error state
  - selection, hover, active, and focus visuals
  - inactive switches as canvas-drawn toggles
  - inactive color inputs as canvas-drawn swatches and value previews
  - inactive dropdown/combobox inputs as canvas-drawn selected-value previews
    plus affordances
  - text/code/textarea passive previews
  - per-section scrollbars and clipped section bodies
- Canvas-owned interaction handling for Param Dict rows and controls.
- Canvas-owned section and Param drag/drop for in-workspace interactions.
- One active DOM overlay host above the canvas for editors and native inputs.
- Performance reports under `perf/` before and after meaningful milestones.

Out of scope for the first benchmark milestone:

- Full canvas-native CodeMirror replacement.
- Generic HTML-in-canvas rendering.
- Rendering arbitrary embedded DOM widgets inside section bodies.
- Full feature parity for every non-Dict section type on day one.
- Full accessibility parity for inactive canvas-rendered rows.
- Text selection inside inactive canvas-rendered previews.

Important scope clarification:

- The first milestone may target Settings `All Settings` and generic Dict
  sections first, but this does not mean xyflow remains the workspace owner.
  Views containing unsupported section types can show canvas placeholders or be
  considered incomplete until their section renderer exists. They must not keep
  xyflow as a hidden compatibility path in the workspace.

## Source Of Truth

- Go remains the owner for canonical project behavior, validation, endpoint
  shapes, contracts, and correctness-sensitive runtime behavior.
- The frontend canvas scene must use existing generated frontend types and
  owner-defined project state surfaces where available.
- Do not create duplicate TypeScript contract mirrors for project, section, or
  Param data when generated or owner-defined types already exist.
- Renderer-local scene records are allowed when they are derived view models for
  geometry, hit testing, and drawing. They must be derived from authoritative
  project state, not stored as duplicated truth.
- Any downstream Python or TypeScript surfaces needed from Go-owned contracts
  should be generated, not hand-maintained.

## Existing Systems To Replace

The active workspace path currently flows through:

- `frontend/src/components/Pages/Project/UiPage.tsx`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/src/forks/xyflow/core/container/Viewport.tsx`
- `frontend/src/forks/xyflow/minimap/*`
- `frontend/src/forks/dnd-kit/SectionDndContext.tsx`
- `frontend/src/components/Section/Container/*`
- `frontend/src/components/Section/Layouts/DictArea.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Params/ParamDndContext.tsx`
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`

The replacement path should introduce a new workspace root, for example:

- `frontend/src/components/WorkspaceCanvas/WorkspaceCanvas.tsx`
- `frontend/src/components/WorkspaceCanvas/workspaceScene.ts`
- `frontend/src/components/WorkspaceCanvas/workspaceRenderer.ts`
- `frontend/src/components/WorkspaceCanvas/workspaceInteractions.ts`
- `frontend/src/components/WorkspaceCanvas/workspaceMinimap.ts`
- `frontend/src/components/WorkspaceCanvas/overlays/*`

Names can change, but ownership must not: the new workspace root replaces the
xyflow/dnd-kit workspace root.

## Retained Scene Model

The canvas workspace owns a retained scene model derived from current project
state.

The scene model must include:

- viewport transform and viewport size
- project bounds
- minimap transform, viewport mask, and minimap hit regions
- section records:
  - section id
  - section type
  - section name
  - bounds
  - z/order
  - selected/hover/active states
  - chrome/header geometry
  - body geometry
  - resize handle regions
  - edge/port regions where applicable
  - section-specific render model or placeholder model
- Dict section records:
  - pinned and unpinned body regions
  - section scroll offset
  - visible row range with overscan
  - row records
  - row rects
  - nesting depth
  - nesting rails
  - Param id
  - Param type
  - label
  - passive value preview
  - validation/error state
  - control kind
  - control rects
  - hit regions for rows and controls

Rendering and interaction must use the same scene records. If the renderer draws
a row or control at a rectangle, hit testing must use that same rectangle.

Scene derivation must not rely on DOM layout. It can use deterministic geometry
constants, project layout metadata, generated contract data, and cached text
measurement results. Canvas-only constants should live in a small mapping table
with comments tying them to the existing UI visual anchors.

## Renderer

The renderer draws the entire workspace into the workspace canvas/WebGPU
surface.

It must draw:

- viewport background and grid if enabled
- section placement
- section chrome/header visuals
- section bodies and clipping regions
- visible Dict rows only, with overscan
- Dict nesting rails and indentation
- Dict labels and passive values
- inactive Dict controls:
  - switches as canvas toggles
  - color params as swatches and passive value text
  - dropdown/combobox params as selected value plus affordance
  - text/code/textarea params as passive text previews
- Dict errors, hover, active, focus, and selected visuals
- per-section scrollbars
- minimap section previews and viewport mask from the same scene model
- selection outlines, drag previews, resize affordances, and drop indicators

The renderer must not draw by asking React to mount section/row components. It
must not use DOM screenshots, SVG minimap nodes, or HTML-to-texture rendering.

The implementation can start with Canvas 2D if that gets the architecture in
place quickly. WebGPU can replace the draw backend behind the same scene model
when needed. The architecture is the retained scene and single workspace
surface, not the first drawing API.

## Inactive Inputs

Inactive inputs are not DOM controls. They are passive scene records rendered by
the canvas/WebGPU renderer.

Rules:

- Do not mount inactive `input`, `select`, `textarea`, CodeMirror,
  Radix/downshift combobox DOM, native color input, or Param UI component DOM in
  the workspace.
- Text, code, password, date, time, and textarea Params render as canvas text
  previews. Password previews should preserve current masking semantics.
- Switch Params render as canvas toggles.
- Color Params render as canvas swatches plus passive value text.
- Dropdown and combobox Params render as canvas selected-value previews plus an
  affordance.
- Button-like passive controls render as canvas controls if they are supported
  in the canvas workspace. Unsupported controls must fail visibly during
  development or use an explicit active overlay/right-pane path; they must not
  silently mount legacy DOM inside the workspace.
- Inactive input hover, selected, focus, disabled, readonly, and error states
  are canvas-rendered states derived from the scene model.
- Activating an input may create one DOM overlay positioned from scene geometry.
  Closing, committing, or cancelling the overlay returns the row to passive
  canvas rendering from authoritative project state.

## Interaction Controller

The interaction controller owns workspace input.

It must:

- Convert pointer coordinates between screen, viewport, scene, section, row,
  and minimap spaces.
- Handle pan and zoom directly, without xyflow/d3-zoom.
- Persist viewport changes through the existing project state/update path.
- Hit test sections, chrome, resize handles, Dict rows, Dict controls,
  scrollbars, minimap, and empty canvas.
- Handle section selection and multi-selection.
- Handle section drag and resize without dnd-kit.
- Handle Param row selection and Param drag/reorder without dnd-kit.
- Handle section body wheel scrolling and maintain per-section scroll offsets.
- Handle simple controls directly where appropriate.
- Open a DOM overlay only for workflows that need native editing/search/input.
- Commit changes through existing project update actions or new Go-owned
  endpoint contracts where required.

The interaction controller must fail loudly for unsupported interactions during
development. It must not silently fall back to old xyflow or dnd-kit behavior.

## Active DOM Overlay Strategy

DOM overlays are allowed only while actively editing or choosing a value.

Allowed overlays:

- One CodeMirror overlay for active text/code/textarea editing.
- One DOM combobox overlay for search/typeahead selection when a canvas popup is
  insufficient.
- One native color input overlay for arbitrary color selection.
- Context menus and app-level popovers.

Overlay rules:

- Overlay placement is derived from scene geometry.
- Overlay count should normally be one active editor/input at a time.
- Inactive rows must never mount CodeMirror, native inputs, DOM comboboxes, or
  Param UI DOM.
- During pan/zoom, the overlay should either reposition cheaply or commit/close.
- Overlays must not become the passive row renderer or the pan/zoom
  implementation.

## Minimap

The minimap is part of the new workspace renderer.

Rules:

- Do not use `forks/xyflow/minimap`.
- Do not render minimap SVG nodes from xyflow state.
- Do not compute minimap from live section DOM.
- Derive minimap bounds, section previews, selected-section state, and viewport
  mask from the retained scene model.
- Default to drawing the minimap in the workspace renderer as a HUD on the same
  canvas. If a second physical canvas is introduced for technical reasons, it
  must still be driven by the same scene and interaction controller, and the
  reason must be documented near the implementation.

## Drag And Drop

dnd-kit is not part of the replacement workspace.

Section drag, reorder, grouping, reparenting, Param drag, Param reorder, nested
Param drag, and drop indicators must be implemented by:

- scene hit testing
- explicit drag state
- deterministic drop target calculation
- existing project mutation paths or new Go-owned mutation endpoints where
  needed

The existing dnd-kit package and helpers can remain in the repository only for
non-workspace UI that still uses them, such as unrelated controls. They must not
be imported by the workspace root, canvas scene, canvas renderer, workspace
interaction controller, or any passive in-workspace section renderer.

## Visual Parity Requirements

The canvas workspace should look close enough to the current `go-rewrite`
workspace that Settings `All Settings` feels like the same product.

Required anchors:

- section density, spacing, header height, and corner radius
- section chrome colors in light and dark mode
- Dict row heights and spacing
- label/value alignment
- nested Param indentation and rails
- typography, font sizes, and line heights
- row hover, active, error, focus, and selected states
- switch shape and checked/unchecked colors
- color swatches
- dropdown/combobox selected-value appearance
- text/code preview styling
- section scrollbars and clipped content behavior
- minimap placement, viewport mask, section shapes, and selected-section state
- drag, resize, and selection affordances

Do not redesign the workspace as part of this rewrite. Visual differences are
acceptable only when they are implementation noise, not a new product direction.

## Performance Rules

Primary rules:

- No xyflow in the active workspace.
- No dnd-kit in the active workspace.
- One workspace canvas/WebGPU surface for pan/zoom rendering.
- No DOM-owned pan/zoom interface.
- No passive section DOM for canvas-owned sections.
- No passive Param row DOM.
- No per-frame React reconciliation for section or row contents.
- No per-frame DOM layout measurement for canvas geometry.
- No CodeMirror instances for inactive rows.
- Draw only visible Dict rows plus overscan.
- Cache deterministic geometry until project state, viewport, section scroll, or
  relevant theme/text inputs change.
- Cache text measurements by text, font, width, and theme.
- Keep active DOM overlays minimal and explicit.
- No Settings-specific fast paths.

Important metrics:

- FPS during Settings `All Settings` pan/zoom.
- DOM node count in Settings `All Settings`.
- Canvas/WebGPU frame time.
- Scene derivation time after project state updates.
- Text measurement/cache hit rate.
- Section wheel-scroll frame time.
- Active editor open latency.
- Typing latency inside active editor.
- Commit latency from editor/control to updated canvas preview.

## Implementation Plan

### 1. Baseline From `go-rewrite`

- Run the Settings `All Settings` benchmark on the clean `go-rewrite` baseline.
- Record DOM node count, pan/zoom FPS, current minimap behavior, and current
  interaction behavior.
- Append the report under `perf/`.
- Capture visual references for:
  - normal dark mode
  - zoomed-out overview
  - light mode
  - hovered row
  - active editor
  - error state
  - dropdown/combobox
  - color picker
  - switch
  - minimap
  - section selection/drag/resize affordances

### 2. Workspace Scene Model

- Add a frontend retained workspace scene derivation module.
- Derive viewport, project bounds, section bounds, section chrome/body
  geometry, minimap geometry, and interaction hit regions without DOM layout.
- Derive generic Dict section row records from existing project state and
  generated types.
- Flatten nested Dict Params into stable row records.
- Compute row rectangles, labels, passive values, control rectangles, nesting
  rails, errors, visible row range, and scrollbars.
- Keep section scroll offsets in frontend UI state.
- Add tests for:
  - viewport transform and coordinate conversion
  - section geometry
  - minimap geometry
  - Dict flattening
  - non-Settings Dict fixtures
  - row geometry
  - visible row ranges and overscan
  - hit regions
- Do not import xyflow or dnd-kit from the scene model.

### 3. Single Canvas Workspace Shell

- Replace `UIPage`'s active workspace root with the new canvas workspace root.
- Remove `SectionDndContext` from the workspace root.
- Remove `ReactFlow` from the workspace root.
- Remove `ResponsiveMiniMap` and xyflow minimap from the workspace root.
- Add one full-workspace canvas/WebGPU surface.
- Add one overlay host above the canvas for active editors/popups.
- Wire viewport state to the new workspace controller, not xyflow.
- Add tests proving the active workspace no longer mounts xyflow, xyflow
  minimap, `SectionDndContext`, section DOM nodes for canvas-owned sections, or
  passive Dict row DOM.

### 4. Passive Renderer

- Render the full workspace scene onto the single canvas/WebGPU surface.
- Render section placement, section chrome, section bodies, and clipping.
- Render Settings/Dict sections passively from scene data.
- Render visible Dict rows plus overscan.
- Render labels, passive values, errors, selected state, hover state, simple
  controls, and per-section scrollbars.
- Render minimap from the same scene model.
- Show explicit canvas placeholders for unsupported non-Dict section types until
  their renderers exist. Do not use xyflow as their fallback.
- Compare visual output against `go-rewrite` references before continuing to
  interaction work.

### 5. Workspace Interactions

- Implement direct pan and zoom.
- Implement minimap pan/zoom interactions.
- Implement section selection, multi-selection, drag, and resize.
- Implement section body wheel scrolling and per-section scroll offsets.
- Implement Dict row hit testing and hover/focus/selected state.
- Implement simple canvas-native control interactions:
  - switch toggle
  - simple dropdown option selection
  - color swatch/choice selection where choices are fixed
- Commit through existing update paths or new Go-owned endpoints where needed.
- Re-render from project state, not local duplicated truth.

### 6. Active Editors And Popups

- Implement one overlay host above the canvas.
- Add CodeMirror overlay for text/code/textarea rows.
- Add DOM combobox overlay where typeahead is needed.
- Add native color input overlay where arbitrary color editing is needed.
- Add right-pane editing path for large or awkward values if needed.
- Ensure inactive canvas rows do not mount editors.

### 7. Remove Workspace xyflow/dnd-kit Dependencies

- Remove active workspace imports from:
  - `forks/xyflow/*`
  - `forks/dnd-kit/*`
  - `@dnd-kit/*`
- Remove or retire workspace-only adapters that exist only to bridge xyflow and
  dnd-kit.
- Update tests that currently mock xyflow/dnd-kit workspace state to use the new
  workspace scene/controller state.
- Keep non-workspace dnd-kit usage only where it is unrelated to the canvas
  workspace and explicitly documented.

### 8. Performance And Hardening

- Re-run Settings `All Settings` benchmark.
- Record before/after FPS, DOM count, frame time, scene derivation time, and
  interaction latency under `perf/`.
- Add browser visual checks for Settings views.
- Add regression checks that the Settings workspace does not mount xyflow,
  xyflow minimap, section DOM, passive Param rows, or inactive CodeMirror
  editors.
- Verify large DOM counts do not reappear.

## Testing Plan

Unit tests:

- scene derivation from project state
- viewport transform and coordinate conversion
- minimap transform and hit testing
- section geometry and z/order
- Dict flattening from nested Param data
- non-Settings Dict fixtures
- row geometry and visible ranges
- row/control hit testing
- section scroll state
- canvas renderer draw command coverage with mocked canvas context
- interaction reducer/controller tests for pan, zoom, selection, drag, resize,
  row hover, section scroll, and simple controls

Integration tests:

- `UIPage` mounts the canvas workspace root instead of xyflow.
- Settings `All Settings` renders through the canvas workspace path.
- The Settings workspace does not mount xyflow nodes/minimap.
- The Settings workspace does not mount passive section or Param row DOM.
- Wheel over a Dict section scrolls that section without moving the whole
  viewport unexpectedly.
- Switch changes persist and redraw.
- Dropdown/color changes persist and redraw.
- Text Param opens one editor overlay and commits back to project state.

E2E/browser verification:

- Settings `All Settings` pan/zoom visual check.
- Visual parity check against `go-rewrite` references.
- Minimap visual and interaction check.
- Section selection, drag, and resize check.
- Dict section scroll visual check.
- Active CodeMirror overlay visual and interaction check.
- Combobox/color overlay check.
- Right-pane edit surface check if implemented.

Performance verification:

- Capture before/after reports under `perf/`.
- Include FPS, DOM node count, canvas/WebGPU frame time, editor activation
  latency, and typing latency.
- Use chrome-devtools profiling when frame-time regressions are unclear.

## Acceptance Criteria

- The active workspace no longer mounts xyflow.
- The active workspace no longer mounts the xyflow minimap.
- The active workspace no longer uses dnd-kit for section or Param
  interactions.
- The active workspace pan/zoom interface is owned by the canvas/WebGPU
  workspace controller.
- The active workspace renders through one canvas/WebGPU surface, not one canvas
  per section.
- The minimap is rendered from the retained scene model and does not depend on
  live section DOM, xyflow nodes, or SVG minimap nodes.
- Settings `All Settings` Dict sections render passively through the canvas
  workspace path.
- Passive Dict rows do not mount DOM rows, inactive CodeMirror instances,
  native input controls, DOM comboboxes, or Param UI component DOM.
- Inactive text/code/textarea, switch, color, dropdown, and combobox Params are
  rendered as canvas/WebGPU passive previews until activated.
- Section placement, chrome, bodies, row layout, controls, scrollbars, hit
  testing, pan, and zoom use the retained scene model.
- No Settings-specific renderer code paths, hard-coded Settings ids, or
  benchmark-only fast paths are introduced.
- Settings `All Settings` remains visually close to `go-rewrite` in the
  reference states.
- Pan/zoom in Settings `All Settings` beats the current full DOM path by a large
  margin.
- Section-level scrolling works inside canvas-rendered Dict sections.
- Switches, color pickers, dropdowns/comboboxes, and text/code Params remain
  editable through canvas-native interaction, DOM overlay, or right-pane editing.
- Active CodeMirror editing uses one overlay and does not reintroduce hundreds
  of editors.
- Focused tests pass.
- Browser visual verification is completed for the Settings benchmark.
- Before/after performance notes are recorded under `perf/`.

## Explicit Non-Goals

- Do not create one canvas per section.
- Do not keep xyflow alive under the canvas.
- Do not keep xyflow minimap alive under a new wrapper.
- Do not keep dnd-kit for workspace drag/drop.
- Do not use hidden DOM sections for passive rendering.
- Do not mount inactive input DOM in the workspace.
- Do not render existing HTML into textures.
- Do not hydrate DOM bodies on activation as the normal editing path.
- Do not add a Settings-only fast path.
