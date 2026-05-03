# GpuFlow Full Scene And Canvas Content Clean-Break Plan

## Goal

Replace the current "large DOM subtree rendered into one node texture" model
with a renderer-owned scene model:

- `GpuFlow` owns live layout for top-level sections, nested child sections,
  resize handles, scroll regions, hit testing, culling, and interaction
  projection.
- High-cardinality node contents, especially param dict/list rows, render
  through retained canvas/GPU primitives instead of persistent React DOM rows.
- DOM remains only for sparse active islands that truly need browser-native
  editing or OS integration: CodeMirror, focused text/textarea/IME inputs,
  native file pickers and drop targets while active, native browser
  color/date/time pickers when explicitly selected, media controls, and
  temporary accessibility fallbacks.
- Dropdown option lists, color choice menus, date calendar grids, switches,
  sliders, rotary controls, buttons, validation/status bubbles, drag/drop
  markers, resize handles, edge anchors, and selection affordances should be
  retained canvas/GPU widgets, not DOM islands, unless a specific native-control
  constraint is documented.
- Go remains the source of truth for durable section/param contracts,
  validation, generated metadata, endpoint shapes, and correctness-sensitive
  behavior. The frontend renderer applies those generated contracts to live
  pixel layout and interaction.

This plan is a clean break. Do not add backward compatibility, migrations,
legacy support, old/new switches, compatibility shims, dual-read/write paths,
or silent fallback behavior. When ownership moves to `GpuFlow`, delete the old
owner in the same implementation slice.

## Why This Replaces The Earlier Scene Plan

The earlier scene-ownership plan correctly moved top-level project-canvas scene
ownership into `GpuFlow`, but it explicitly left nested section layout and
section content rendering out of scope.

Those exclusions are now the main performance problem:

- A param dict with many params is still a large DOM subtree inside one section
  surface. Scrolling it requires browser layout/paint work for that subtree.
- A group or list with many child sections still renders those child sections
  as React/CSS descendants of the parent section. Sorting or moving child
  sections invalidates and rerenders parent-owned DOM.
- Nested resize still uses nested section DOM resize paths instead of the same
  renderer-owned live layout path as top-level GPU resize.

This plan keeps the earlier direction but extends it to the full section scene
and to high-cardinality section contents.

## Current Ownership Problems

### Top-Level Surface Is GPU-Owned, Nested Scene Is Not

Current files:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`
  passes top-level `GpuNodeLayout[]` into `GpuFlow`.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts`
  adapts `useNodeInternals` into the `GpuFlow` layout store.
- `frontend/src/gpuFlow/layoutStore.ts` owns live layout records for top-level
  renderer nodes.

The renderer already owns the right kind of state at the top level, but the
records represent only top-level sections. Nested section layout is still
inside the rendered node content.

### Child Sections Are React/CSS/Dnd-Kit-Owned

Current files:

- `frontend/src/components/Section/Container/ManyNestedSections.tsx`
  renders child section ids as DOM descendants.
- `frontend/src/components/Section/Container/SortableSectionContainer.tsx`
  applies dnd-kit transforms and schedules local rect updates from DOM.
- `frontend/src/forks/dnd-kit/dndChildren.ts` mirrors parent-child order for
  live sort rendering.
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  uses different resize paths for top-level and nested sections.

This means a list/group with many child sections is expensive to sort because
the child sections are part of the parent surface's DOM subtree.

### Param Dicts Are DOM-Owned

Current files:

- `frontend/src/components/Section/Layouts/DictArea.tsx` renders param dict
  contents through React components.
- `frontend/src/components/Params/GroupContainer/groupContainer.tsx` measures
  param areas with DOM observers and renders pinned/unpinned scroll areas.
- `frontend/src/components/Params/ParamDndList.tsx` maps all visible param ids
  to React row components.
- `frontend/src/components/Params/GetParamSwitch.tsx` filters and maps params
  without virtualization.
- `frontend/src/components/Params/ParamContainer.tsx` renders nested param rows
  and port/control DOM.

This means a param dict with many params still pays DOM cost even though
`GpuFlow` can efficiently compose the resulting texture.

### Retained Param Controls Still Escalate To DOM

Current files:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuParamRowAdapter.ts`
  already maps Go-owned `ParamUIRendererConfig` metadata into a retained
  `controlKind`.
- `frontend/src/gpuFlow/retainedContentScene.ts` emits generic
  `row-control` draw commands and `control` hit records, but the control
  payload is only a renderer-family string.
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx` draws placeholder
  control pills rather than concrete switch, slider, dropdown, date, color, or
  file-state visuals.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamInteractionAdapter.tsx`
  handles a retained control click by mounting a full `ParamInput` DOM island.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuDomIslandActivation.ts`
  then replays pointer, mouse, focus, and click events into the newly mounted
  DOM target.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuActiveParamDomIslandDeactivation.ts`
  preserves generic popover, validation, and CodeMirror portal roots while an
  active retained-param island is open.

The current DOM controls explain the complexity:

- `frontend/src/components/Params/ParamUIs/DropdownInput.tsx` uses
  `IdNameCombobox`, which creates a portal list and repositions it on canvas
  transforms.
- `frontend/src/components/Params/ParamUIs/ColorPickerInput.tsx` uses a
  `StandardPopover` portal for configured color choices and a native
  `<input type="color">` when no choices are configured.
- `frontend/src/components/Params/ParamUIs/TextParamInput/dateTimeParamInputs.tsx`
  renders the date calendar as a DOM grid, with native time input when time is
  included.
- `frontend/src/components/Params/ParamUIs/SliderInput.tsx`,
  `frontend/src/components/Params/ParamUIs/RotaryInput.tsx`, and
  `frontend/src/components/Params/ParamUIs/SwitchInput.tsx` are DOM/Radix
  controls, but their steady-state interaction is deterministic geometry and
  value math.
- `frontend/src/components/Params/ParamUIs/DropzoneInput/dropzoneInput.tsx`
  requires native file picker, OS drag/drop, and server picker integration, but
  the idle attachment list and drag-over display are renderer-owned visuals.
- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx` and text-like
  values use `TextInputCodeMirror`; those should remain DOM only while focused.

The simplification target is to keep the Go-owned renderer-family metadata, add
specific retained control descriptors and hit records, and stop opening a full
DOM `ParamInput` for controls that can be drawn and interacted with directly in
canvas.

### Port Geometry Still Depends On DOM Measurement

Current files:

- `frontend/src/gpuFlow/ports/portGeometry.ts` registers port descriptors and
  measures source-local handle rects.
- `frontend/src/gpuFlow/Handle/index.tsx` registers handle DOM with the global
  port registry.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuHandleAdapter.ts`
  supplies Setta-specific connection policy to generic `GpuFlow` handles.
- `frontend/src/components/Pages/Project/gpuProjectEdgeScene.ts` builds edge
  geometry from renderer layout and registered port positions.

Once section and param contents render through retained scene data, port
positions must be metadata produced by layout and content renderers, not
screen-DOM measurements.

## HTML-In-Canvas Example Lessons

The local example repos at
`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` are useful
for browser constraints and interaction patterns.

Relevant examples:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/README.md`
  defines the core browser constraints: `layoutsubtree`, direct canvas child
  requirements, `changedElements`, `requestPaint()`, transform synchronization,
  and WebGPU `copyElementImageToTexture`.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  shows the WebGPU upload path with `copyElementImageToTexture`, explicit
  paint requests for controls, and transform sync for interactive DOM.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/multi-element-composition/demo.html`
  shows that multiple direct canvas children can be composed independently and
  ordered by the renderer instead of DOM order.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/3d-room-live-content/demo.html`
  shows a critical staging rule: source elements must remain actually laid out
  and painted. Do not use `display:none`, `visibility:hidden`, `opacity:0`,
  large negative offscreen positioning, or clipping patterns that prevent the
  browser from recording a usable paint snapshot.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas/plugins/html-cloth.mjs`
  is a useful reference for DOM controls rendered into a transformed canvas
  surface while native interaction is projected back to the source element.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/htmlTexture.ts`
  and `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/syncFormState.ts`
  are useful anti-pattern references for Setta's primary path: SVG/foreignObject
  capture and DOM-clone fallback logic are complex and fragile. Setta should
  rely on native html-in-canvas and renderer-owned primitives instead.

Design implications for Setta:

- Keep direct canvas child source surfaces for the DOM islands that remain.
- Use html-in-canvas only for those remaining DOM islands and source-local
  accessibility surfaces. Do not use it as the default implementation for
  dropdown lists, configured color choices, calendar grids, switches, sliders,
  rotary controls, validation bubbles, or drag/drop affordances that can be
  retained renderer primitives.
- Split independently invalidated things into independent renderer surfaces
  instead of one giant parent source surface.
- Do not hide or offscreen-stage source DOM in ways that suppress browser paint
  snapshots.
- Use `changedElements` and dirty rects only for true DOM islands. They are not
  a substitute for removing high-cardinality DOM from the hot path.
- Treat SVG/foreignObject capture as out of scope for the main renderer.

## Target Architecture

### Full `GpuFlowScene`

Introduce a renderer-owned scene snapshot that is flat, explicit, and derived
from Go-owned/generated project contracts:

```ts
type GpuFlowScene = {
  sections: GpuSectionSceneNode[];
  edges: GpuEdgeSceneRecord[];
  contentSurfaces: GpuContentSurface[];
  domIslands: GpuDomIsland[];
  revision: number;
};
```

The exact TypeScript names can differ, but the ownership cannot: `GpuFlow`
should be able to render, hit-test, scroll, resize, and reorder visible
sections from this scene without reading layout back from React DOM.

Each section scene node should carry at least:

- `sectionId`
- `parentSectionId`
- `childSectionIds` or a stable child range/order reference
- layout mode: vertical, horizontal, kanban, absolute, or none
- local rect relative to parent content space
- world rect in flow space
- chrome rect, body rect, and child viewport rect
- clip rect
- scroll offset for owned overflow regions
- resize policy and min/max constraints
- z order and interaction layer
- port anchor descriptors
- content renderer descriptor

Go should own the durable section tree, size policy, layout mode identifiers,
validation, and generated metadata. `GpuFlow` should own the live pixel layout
execution, dirty flags, culling, and interaction geometry.

### Child Sections As Independent Scene Items

Nested sections must stop being DOM descendants of their parent section
surface.

Target behavior:

- A group/list parent owns chrome, body background, optional headers, and a
  child viewport/clip region.
- Child sections are independent `GpuFlow` scene items positioned inside that
  viewport.
- Sorting a child changes renderer-owned child order and local rects.
- Moving a child changes renderer-owned geometry and commits one durable move
  operation on interaction stop.
- Parent source surfaces do not rerender when a child is merely moved,
  reordered, dragged, or resized.
- Visible child sections are culled by parent clip rect and viewport.

This should delete the current `ManyNestedSections` render ownership and the
section-level dnd-kit DOM transform model.

### Unified Resize

All section resizing should use one live resize path in `GpuFlow`.

Target behavior:

- Top-level and nested sections use the same resize handles, hit-testing,
  constraints, dirty flags, and live layout store.
- Project-specific policy and persistence stay in the project adapter.
- Nested resize no longer uses `CustomResizable`.
- Size-dependent edge endpoints and port anchors update from renderer metadata
  during the same frame as the resize.

### Renderer-Owned Scroll And Clip Regions

CSS overflow should stop being the owner of high-cardinality section scrolling.

Target behavior:

- Group/list child areas and param areas are explicit `GpuFlow` scroll regions.
- Wheel, trackpad, drag-scroll, keyboard reveal, and programmatic reveal update
  renderer-owned scroll offsets.
- The renderer clips and culls visible children/rows from those offsets.
- DOM islands inside a scroll region receive synchronized transforms only while
  they are active or otherwise needed.

CSS overflow can remain only inside a DOM island whose native control requires
it, not as the parent owner for section or param layout.

### Canvas/GPU Param Content Renderer

Param dicts should be the first high-cardinality content moved out of DOM.

Target behavior:

- The param renderer receives generated/owner-defined param metadata, resolved
  display state, validation state, search/filter state, pinning state, and
  drag/drop state.
- It produces retained draw commands for rows, labels, nesting guides,
  controls, status/error indicators, ports, hover/selection state, and drag
  placeholders.
- It produces a hit-test tree matching those draw commands.
- It virtualizes by scroll offset and viewport, drawing only visible rows plus
  a small buffer.
- It emits port anchor metadata directly from row layout.
- It mounts DOM islands only for explicit native editor/picker controls.

The renderer must not duplicate non-trivial section/param business logic in
TypeScript. If a helper, type guard, normalized union, or metadata surface is
missing, extend the Go-owned/generated path first.

### Canvas-First Param Control Boundary

The retained row scene should carry concrete control descriptors instead of a
single `controlKind` string. Each descriptor should include:

- owner row id and renderer family from Go-owned `ParamUIRendererConfig`
- current display value and default/fallback display value
- disabled, frozen, selected, hovered, focused, error, and preview state
- renderer-owned control rects and sub-hit regions
- minimal generated config needed for drawing and interaction, such as
  slider/rotary min/max/step, dropdown choices, color choices, date/time mode,
  and dropzone attachment display metadata
- commit policy: immediate, preview plus commit, or native island activation

Move these controls to retained canvas/GPU by default:

- `switch`: draw track/thumb; click, Space, and Enter toggle and commit through
  the existing param update path.
- `slider`: draw track/range/thumb and value text; pointer drag updates preview
  with `skipBackendUpdate`, pointerup/cancel commits, keyboard arrows/Page/Home/
  End use the same min/max/step math, and direct numeric typing mounts a small
  text DOM island only while editing the number.
- `rotary`: draw knob/tick/value; pointer angle, wheel, and keyboard math stay
  in the renderer interaction controller, with preview during drag and commit on
  release/cancel.
- `dropdown`: draw the closed field and open option list as retained canvas
  popup content. Arrow keys, Home/End, Enter, Escape, click selection, wheel
  scrolling, and simple typeahead should be renderer-owned. Only mount a text
  DOM island if a future dropdown mode requires freeform search text editing.
- `color-picker` with configured `colorChoices`: draw the closed color preview
  and open swatch/list popup as retained canvas content, then commit the chosen
  color directly. The native `<input type="color">` remains a DOM island only
  when no configured choices exist or native browser color UI is explicitly
  required.
- `date-time` calendar mode: draw month header, weekday labels, date cells,
  selection/range state, Today state, Prev/Next controls, and summary text in
  canvas. Native date/time/text inputs remain DOM islands only for explicit
  input modes or direct typed time editing.
- `password`: draw the closed value placeholder and reveal affordance in
  canvas; the password text field and browser credential/editing behavior stay
  DOM only while active.
- `dropzone`: draw idle placeholder, attachment chips/list, upload/error state,
  delete affordances, and drag-over state in canvas. Native file input, OS file
  drop, and server-file modal activation remain DOM/native islands.
- `button` and other simple command controls: add them to Go-owned
  `ParamUIRendererConfig` before implementing canvas rendering, then draw the
  button and route click/Space/Enter through the existing action.
- Validation, status, search match, duplicate-name badges, drag previews,
  insertion markers, and row selection affordances are retained canvas overlays.
  CodeMirror lint/tooltips and active name-validation text editing remain DOM
  only while the editor island is mounted.

Do not spend more implementation work improving the generic retained-param
portal/activation path for the controls above. Once a control family has a
canvas descriptor and interaction controller, its retained hit records should
route to canvas handlers instead of `onActiveParamDomIslandChange`,
`GpuFlowDomIslandLayer`, `SETTA_POPOVER_PORTAL_PARENT_ID`, or replayed DOM
activation events.

Remaining DOM islands should use the html-in-canvas source-local path:

- The source element is a direct child of the `layoutsubtree` canvas.
- `requestPaint()` is used to obtain a fresh snapshot before upload.
- WebGPU upload uses `GPUQueue.copyElementImageToTexture` or the existing
  equivalent html-surface texture manager.
- `changedElements` and dirty rects are scoped to the island, not the parent
  param dict.
- The source element stays laid out and painted; no `display:none`,
  `visibility:hidden`, opacity-zero staging, or large offscreen positioning.
- `GpuFlow` owns transform synchronization so hit testing and accessibility
  match the composited texture.

### DOM Islands

DOM islands are explicit renderer resources, not arbitrary descendants inside a
large section component.

Valid default DOM island examples:

- focused CodeMirror editor
- active text input or textarea
- active direct numeric text field for a canvas slider or rotary value
- active dropdown freeform search field, only if a future dropdown mode needs
  true text editing instead of renderer-owned typeahead
- native `<input type="color">` when configured color choices are absent or
  native color UI is explicitly required
- native date/time/text input when date/time input mode requires browser editing
- file input, OS drop target, and server-file modal activation for dropzone
- media preview requiring native controls
- CodeMirror tooltip/lint UI tied to the mounted editor
- temporary accessibility fallback where canvas semantics are not yet adequate

Non-examples that should be canvas-owned:

- dropdown option menus for configured choices
- color choice popovers for configured choices
- date calendar month grids
- switches, sliders, rotary knobs, and simple command buttons
- validation/status bubbles that are not tied to an active DOM editor
- drag previews, insertion markers, selection bounds, resize handles, and edge
  labels/anchors

Each DOM island should have:

- stable id
- owning section/content id
- local rect
- clip owner
- z layer
- activation and deactivation rules
- source element lifecycle
- transform synchronization owned by `GpuFlow`
- dirtying behavior tied to the island, not the whole section

Inactive CodeMirror-like controls should render as canvas text/control
primitives. Mount the real DOM editor only on focus/activation.

### Port And Edge Geometry

Port anchors should be produced by section/content layout, not measured from
DOM.

Target behavior:

- Section chrome/content renderers emit local port anchor descriptors.
- `GpuFlow` transforms local anchors to world positions from the same layout
  store used for rendering.
- Edge paths, reconnect anchors, labels, hit regions, minimap state, and
  selection bounds consume the same edge scene.
- DOM handle registration and screen-space `getBoundingClientRect()` are not
  part of the steady-state edge geometry path.

## Implementation Slices

These slices are allowed to leave the branch temporarily broken while a slice
is in progress. Each completed slice should remove the previous owner for the
responsibility it moves.

### 1. Define The Clean Scene Contract

- Add a new `GpuFlowScene` model under `frontend/src/gpuFlow/`.
- Define section scene records, content surface records, scroll regions, port
  anchors, DOM island descriptors, and dirty flags.
- Extend Go-owned metadata/generation where section layout modes, size policy,
  param display metadata, or param type surfaces are missing.
- Replace top-level-only layout records with section-scene records.
- Delete any new local TypeScript mirrors that become unnecessary after
  generation.

Acceptance:

- `GpuFlow` can receive one flat scene snapshot containing top-level and nested
  sections.
- The project adapter is the only layer translating Setta project state into
  `GpuFlow` scene input.

### 2. Move Nested Section Layout Into `GpuFlow`

- Remove `ManyNestedSections` as the renderer for child section layout.
- Remove `SortableSectionContainer` as the owner of live child section
  transforms.
- Replace dnd-kit child layout with `GpuFlow` child layout and hit testing.
- Implement vertical, horizontal, and kanban child layout in the renderer scene
  model.
- Add parent clip rects and child viewport culling.

Acceptance:

- Group/list children are independent scene items.
- Reordering children updates scene geometry without rerendering the parent
  section surface.
- Parent source surfaces do not contain child section DOM.

### 3. Unify Section Resize

- Route top-level and nested section resize through one `GpuFlow` resize
  controller.
- Delete nested `CustomResizable` ownership.
- Move nested resize constraints into the scene record.
- Commit final size changes through the project adapter.
- Update edge/port geometry from renderer metadata during live resize.

Acceptance:

- Top-level and nested sections share the same resize implementation.
- No resize path reads screen DOM as the source of truth for section geometry.

### 4. Replace Section Sorting And Reparenting Interaction

- Replace section dnd-kit sensors/transforms with `GpuFlow` pointer
  interaction controllers.
- Render insertion markers, drag previews, and autoscroll through `GpuFlow`.
- Commit final reparent/reorder operations through existing project actions or
  new Go-backed endpoints if the current contracts are not sufficient.
- Delete `dndChildren` once renderer scene state owns live child order.

Acceptance:

- Dragging a child section changes renderer-owned layout every frame.
- React does not rerender the child list on every drag frame.

### 5. Introduce Renderer-Owned Scroll Regions

- Add scroll-region state to `GpuFlow`.
- Move group/list overflow to renderer clipping and scroll offsets.
- Add reveal-to-rect and keyboard navigation APIs against renderer scroll
  regions.
- Keep DOM scroll only inside active DOM islands that require native scrolling.

Acceptance:

- Scrolling a large group/list changes a numeric renderer scroll offset and
  culls children.
- Parent/child section DOM is not the scroll owner.

### 6. Build The Param Canvas Renderer

- Define a retained param content scene from generated/owner-defined metadata.
- Replace the current `controlKind`-only retained rows with concrete control
  descriptors sourced from Go-owned `ParamUIRendererConfig` and generated param
  config/value surfaces.
- Render rows, labels, nesting, closed-state controls, errors, hover,
  selection, search matches, duplicate-name indicators, and drag state as
  canvas/GPU primitives.
- Virtualize visible rows by scroll offset.
- Emit row, label, control, control-subpart, popup, popup-option, drag marker,
  and port hit records from the same row layout.
- Add project-adapter conversion from `ParamUI` state to retained descriptors:
  text-like, date-time, slider, rotary, switch, color-picker, dropdown,
  password, dropzone, and any future Go-owned renderer families.
- Mount DOM islands only for focused CodeMirror/text/textarea/IME editing,
  direct numeric typing, native color/date/time controls, file picker/drop
  targets, server picker/modal activation, media controls, and temporary
  accessibility fallbacks.
- Delete the DOM row rendering hot path for dict params once parity is reached
  for the target branch.

Acceptance:

- A large param dict scrolls without rendering all rows as DOM.
- Param edge anchors come from retained layout metadata.
- Closed and inactive states for dropdown, color picker, date calendar, switch,
  slider, rotary, password, dropzone, and button-style controls are
  canvas-rendered.
- The retained scene has enough typed descriptor data that `GpuRetainedContentSurfaces`
  no longer draws generic renderer-family placeholder pills for supported
  controls.
- Clicking a closed switch, slider, rotary, configured color picker, dropdown,
  or calendar control does not mount a full `ParamInput` DOM island.

### 7. Move Param Popups And Simple Controls Into Canvas

- Add retained canvas interaction controllers for switch, slider, rotary,
  dropdown, configured color picker, calendar date/time picker, password reveal,
  dropzone display/delete affordances, and button-style controls.
- Route retained hits for these controls to canvas handlers instead of
  `onActiveParamDomIslandChange`.
- Preserve existing `ParamValueChange` semantics: slider/rotary/color preview
  uses `skipBackendUpdate`, final pointerup/cancel/selection commits through the
  same project update path, and immediate controls commit once per user action.
- Render dropdown and configured color-picker popups as retained canvas popup
  layers with renderer-owned z order, clipping, scrolling, highlighted option,
  selected option, and outside-click/Escape dismissal.
- Render date calendar popups as retained canvas popup layers with month
  navigation, weekday headers, date cells, range/multi/single selection,
  optional time summary, and typed time DOM island only when direct text editing
  is required.
- Render validation/status/search bubbles as retained canvas overlays unless
  they are attached to a focused CodeMirror/text DOM island.
- Keep native DOM activation only for `ParamNameInput`, text-like `ParamUI`,
  direct numeric editing, native color/date/time inputs, file picker/dropzone
  OS integration, server picker/modal activation, media controls, and temporary
  accessibility fallbacks.
- Delete retained-param coupling to generic popover portal preservation once
  dropdown/color/date validation popups are canvas-owned.
- Narrow `projectGpuDomIslandActivation.ts` so it replays activation only for
  the remaining native editor/picker island families, not for role
  `combobox`/`switch` or configured color/date popovers.

Acceptance:

- Dropdown choices, configured color choices, date calendar cells, switch,
  slider, rotary, password reveal, and dropzone attachment/delete interactions
  work from retained canvas hit records.
- DOM island count remains zero while interacting with dropdown/configured
  color/date/switch/slider/rotary controls in a large param dict, except for
  explicitly activated text/native picker/file cases.
- `SETTA_POPOVER_PORTAL_PARENT_ID` is not required for retained-param dropdown,
  configured color picker, calendar, validation, or status UI.
- Existing persisted value behavior matches current `ParamUI` behavior,
  including preview-vs-commit behavior for slider, rotary, and color picker.
- Frontend tests cover pointer, keyboard, wheel, Escape/outside dismissal, and
  scroll clipping for the canvas-owned controls.

### 8. Move Edge Labels, Reconnect Anchors, And Selection Overlays Into Scene

- Render edge labels, reconnect anchors, selected bounds, insertion markers,
  drag previews, and resize affordances through `GpuFlow`.
- Remove viewport-synchronized DOM overlay ownership where it duplicates
  renderer state.
- Keep DOM only when the overlay is an active island.

Acceptance:

- Edge visuals and interaction hit regions are built from one edge scene.
- Selection and group drag use the same live layout store as section rendering.

### 9. Delete Old DOM Measurement Paths

- Remove DOM handle registration as a steady-state source of port geometry.
- Remove screen-space section rect fallback helpers from project focus/reveal
  paths after equivalent scene APIs exist.
- Remove param area DOM measurements that computed row/container heights.
- Remove nested-section DOM sort/resize stores.
- Remove retained-param DOM activation, portal preservation, and
  `getBoundingClientRect()` list-position code for controls that are now
  canvas-owned.

Acceptance:

- Renderer geometry is not reconstructed from `getBoundingClientRect()` in the
  steady-state canvas scene.
- Remaining DOM measurement is limited to active DOM islands and intrinsic size
  measurement that is explicitly content-owned.
- The remaining retained-param DOM island path is a small editor/picker/file
  path, not the default path for controls and popups.

## Performance Verification

Create repeatable fixtures before implementing the renderer rewrite:

- param dict with 1,000+ top-level params
- nested param tree with deep child rows
- group with hundreds of child sections
- list root with hundreds of child sections
- kanban-style horizontal child layout with many columns/cards
- mixed CodeMirror-active and CodeMirror-inactive param states
- mixed control-heavy param dict with dropdown, configured color picker, native
  color picker, date calendar, date/time input, slider, rotary, switch,
  password, and dropzone rows
- active native islands for text editing, numeric typing, native color/date/time
  picking, file picking, and dropzone OS drag/drop

Measure before and after:

- scroll FPS and input latency
- JS time per wheel event
- JS time per reorder/drag frame
- React commits per interaction
- DOM node count in the project surface
- DOM island count during retained-param interactions
- texture uploads per frame
- uploaded texture bytes per frame
- paint event changed-surface count
- GPU memory and source texture count
- edge/port geometry update cost

For implementation work, record before/after reports under `perf/` as
append-only artifacts.

## Testing And Debugging Requirements

- Add unit tests for pure layout calculators and hit-test reducers.
- Add focused frontend tests for scene generation from project state.
- Add interaction tests for child section sort, resize, scroll, reveal, and
  param row activation.
- Add retained-control tests for dropdown selection/typeahead, configured color
  selection, date calendar navigation/selection, switch toggle, slider drag,
  rotary pointer/wheel/keyboard, password reveal, and dropzone display/delete
  affordances.
- Add tests that assert canvas-owned retained controls do not mount
  `GpuFlowDomIslandLayer` entries or viewport portal roots during normal
  interaction.
- Use Chrome DevTools performance profiling for the large fixtures.
- Add debug overlays for scene rects, clip rects, scroll regions, port anchors,
  DOM islands, and dirty surfaces.
- Fail loudly when a required scene record, generated metadata field, or DOM
  island owner is missing.

Do not add generator drift tests that only rerun generators and compare
checked-in output.

## Visual Fidelity Checkpoint Work

Visual fidelity is part of this loop's implementation scope. The loop should
not pause waiting for manual review of every screenshot blocker; it should use
the checkpoint output as its work queue, fix real rendering/layout regressions,
fix capture instability when the fixture is wrong, and rerun the checkpoint
after each visible fix.

Run the temporary baseline-vs-candidate checkpoint with:

```bash
node scripts/gpuflow-visual-fidelity-checkpoint.mjs
```

The checkpoint must use Chrome for Testing 149 from
`scripts/resolve-chrome-for-testing-149.sh` for both the `ai.sh` browser and
Playwright screenshot capture. Do not compare screenshots from Playwright's
bundled Chromium.

The current checkpoint artifact path is:

`perf/visual-fidelity/2026-05-05-gpuflow-full-scene/`

The checkpoint compares:

- `baseline-primary`: `37bdaa5efed8fb8d86425ecfa43fc85f61d0d08d`
  from `go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan`.
- `candidate`: the current checkout running
  `scripts/gpuflow-visual-fidelity-checkpoint.mjs`, with `HEAD` recorded when
  the checkpoint starts. This intentionally covers uncommitted visible changes
  before a loop iteration commits them.
- optional `baseline-secondary`: `6b6036f456ad8a093cd3a364870d6ee1632b376b`
  from `go-rewrite-canvas-replace-xyflow-2`, enabled with
  `node scripts/gpuflow-visual-fidelity-checkpoint.mjs --include-secondary`.

The script prepares and validates isolated baseline worktrees under
`../setta-visual-fidelity-worktrees/` by default, or under
`SETTA_VISUAL_FIDELITY_WORKTREE_ROOT` when that environment variable is set:

- `gpuflow-baseline-primary`
- `gpuflow-baseline-secondary`

It does not require or use a separate candidate worktree. If a required
baseline worktree is missing, the script creates it. If it exists at the wrong
commit and is clean, the script switches it to the required detached commit. If
it is dirty, the script fails loudly rather than overwriting local state. The
script also links `.venv` and `frontend/node_modules` into prepared visual
worktrees when those dependency directories are missing. The dependency source
is `SETTA_VISUAL_FIDELITY_DEPENDENCY_ROOT` when set, otherwise the current
checkout when it has dev dependencies, otherwise the primary Git worktree root.

To check only baseline worktree and dependency preparation without launching the
app or capturing screenshots, run:

```bash
node scripts/gpuflow-visual-fidelity-checkpoint.mjs --prepare-only
```

Current required fixtures:

- project surface overview
- closed retained param controls
- dense param dict rows
- callable edge/handle layout
- selection/resize affordances
- dropdown open popup
- configured color picker open popup
- date calendar open popup
- active native text island
- drag preview

Each fixture must be captured at `1440x900`, `1024x768`, and `390x844`.

Expanding checkpoint coverage:

- Expand coverage in `scripts/gpuflow-visual-fidelity-checkpoint.mjs`; do not
  add one-off screenshots outside the checkpoint when a visible renderer/control
  state becomes part of the required loop evidence.
- Keep the primary comparison against `baseline-primary`
  (`37bdaa5efed8fb8d86425ecfa43fc85f61d0d08d` from
  `go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan`) and the current
  checkout as candidate. The same fixture setup and interaction sequence must
  run against both runs.
- Add representative project content through `controlSections` or
  `createFixtureSections` using production project/param mutation paths. Avoid
  candidate-only fixtures. If the primary baseline cannot create or display a
  proposed fixture, choose the closest comparable baseline state or document why
  the fixture is supplemental rather than required.
- Add every required visual state to `fixtureDefinitions` with a stable fixture
  id, description, and required selector that represents the owner being
  compared.
- Capture the new state from `captureViewportFixtures` for all required
  viewports, using existing helpers such as `capturePane`, `captureSectionClip`,
  `openSectionVisualState`, or a new deterministic helper when a state needs a
  specific interaction.
- For param UI work, expand fixtures around the visible states most likely to
  drift: closed, open popup/menu, active native island, hover/focus/selection,
  disabled/error, preview-drag, long-content/scrolling, and file drag-over or
  attachment display states. Do not try to create an exhaustive Cartesian
  product; add focused coverage when a control family or state moves ownership
  to canvas.
- Rerun the checkpoint with Chrome for Testing 149 after adding coverage, commit
  the updated artifact set or a newer timestamped artifact directory, and update
  `review.md` with any accepted differences or remaining blockers.

Loop visual-fidelity requirements:

- Visible canvas-owned replacements require baseline-vs-candidate screenshots;
  CDP smoke checks or "canvas exists" assertions are not enough.
- Screenshot timeout, missing fixture capture, or mismatched screenshot
  dimensions is a blocker for visible renderer/control changes unless a
  documented equivalent capture method succeeds.
- Page errors from `GpuFlow`, html-in-canvas, WebGPU texture upload, or retained
  control interaction are blockers for visible renderer/control changes until
  fixed or explicitly accepted in `review.md`.
- Logic-only cleanup can proceed with focused unit/integration tests when it
  does not change rendered output or interaction visuals.
- Any visible renderer/control change must update this checkpoint artifact set
  or create a newer timestamped artifact directory with the same fixture
  coverage.
- Do not loosen pixel thresholds, delete fixtures, or mark a blocker as
  `accepted-difference` unless the diff has been inspected and the reason is
  documented in `review.md`.
- If a blocker is caused by nondeterministic capture, framing, waiting, or
  fixture setup rather than product rendering, fix the checkpoint script or
  fixture first and rerun it.
- If a blocker is real visual drift, fix the renderer/layout/control behavior
  before taking unrelated visual expansion work.
- Do not emit
  `GPUFLOW_FULL_SCENE_CANVAS_CONTENT_CLEAN_BREAK_PLAN_COMPLETE` while required
  checkpoint fixtures have unexplained `blocking-regression`,
  `capture-blocked`, or runtime page-error groups.

Current checkpoint result:

- The checkpoint used `Google Chrome for Testing 149.0.7827.2`.
- `review.md` reports 30 primary comparisons: 21 pass, 9 blocking visual
  regressions, 0 capture-blocked fixtures, and 0 runtime page-error groups.
- Blocking visual regressions are `project-surface`, `param-controls-closed`,
  `dense-param-dict`, `selection-resize`, and `callable-edge-handles` across
  one or more desktop, compact-desktop, and narrow viewports.

Current visual-fidelity work queue:

1. Inspect and fix or classify `dense-param-dict` at desktop and
   compact-desktop; these are the largest diffs (`0.2822` changed pixels,
   `46.47` mean delta).
2. Inspect and fix or classify `selection-resize` at desktop and
   compact-desktop; verify selected-section frame, resize handles, and canvas
   framing against baseline.
3. Inspect and fix or classify `project-surface` and
   `param-controls-closed` at desktop; these may share the same root framing or
   layout drift.
4. Inspect and fix or classify narrow viewport blockers for
   `dense-param-dict`, `callable-edge-handles`, and `selection-resize`.
5. Rerun `node scripts/gpuflow-visual-fidelity-checkpoint.mjs` after each
   meaningful visible fix and update `review.md`.

## Final Target

The final architecture should have these properties:

- `GpuFlow` owns the complete live project-canvas scene.
- Child section layout is not React/CSS-owned.
- Section resize is unified across top-level and nested sections.
- High-cardinality param content is not persistent DOM.
- Dropdowns, configured color pickers, date calendars, switches, sliders,
  rotary controls, validation/status overlays, drag/drop markers, selection
  affordances, resize handles, and edge affordances are retained canvas/GPU
  widgets.
- DOM islands are explicit, sparse, active editor/picker/file/accessibility
  resources.
- Port and edge geometry comes from renderer layout metadata.
- Browser html-in-canvas source surfaces are used where they are strongest:
  native active editor/picker/file controls and accessibility surfaces, not bulk
  row rendering and not renderer-owned param popups.
- Old DOM render, sort, resize, scroll, and measurement owners are deleted.
