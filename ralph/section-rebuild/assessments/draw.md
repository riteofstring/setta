# Draw Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` confirms `Draw` is a real frontend section type.
  - `internal/projectstate/top_level_section_creation.go` defines Draw defaults: one layer, `activeLayerIdx`, `brushColor`, `brushSize`, `brushShape`, `brushOpacity`, `eraserBrushSize`, `drawThrottleDelay`, `canvasMode`, and `colorChoices`.
  - `internal/projectstate/draw_area_layer_items.go` and `internal/projectstate/draw_area_layer_items_test.go` define layer item payloads as `Image` or `BrushStroke` with `dataPath` and `transformId`.
  - `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx` shows the section body as controls plus stacked canvases, with active-layer mouse handlers for draw, erase, edit, drag, resize, and snapshot flushing.
  - `frontend/src/components/Section/Layouts/DrawArea/DrawAreaControls.tsx` shows color, mode, brush, eraser, layer opacity, layer list, layer add/delete/visibility/reorder, active layer, and clear-strokes controls.
- Data shown:
  - Current draw mode (`draw`), brush color, brush opacity, brush size, brush shape, eraser size, active layer index, layer opacity, layer visibility, layer names, layer item counts, `Image` and `BrushStroke` layer item types, `dataPath`, and `transformId`.
- Controls/actions:
  - Color picker/swatch, draw mode, erase mode, edit/move mode, brush size/opacity/shape, eraser size, active layer opacity, layer visibility toggle, active layer selection, layer reorder affordance, layer delete, add layer, and clear strokes.
- Important states:
  - Active layer, hidden layer, visible layer, active draw mode, inactive erase/edit modes, brush stroke item, image item, editable transform/resize handles, and draft canvas overlay.
- Interactions that must stay recognizable:
  - Drawing/erasing/editing happens on the active canvas layer; non-active layers are visually present but not directly interactive. Layer list actions manage visibility, active layer, ordering, add/delete. Clear strokes targets brush stroke elements on the active layer.

## Layout Invariants
- Conceptual regions and ordering:
  - Flat shell/titlebar, then Draw-specific controls, then a canvas/layers workspace.
  - The canvas preview is the primary body region and should be larger than controls.
  - Layer controls belong beside or near the canvas preview, not inside unrelated port rows.
- Relative placement of important controls:
  - Mode and brush controls stay in the top Draw control strip.
  - Layer list/settings stay grouped as layer controls.
  - Clear strokes remains a destructive draw-area action, not a generic section close/minimize action.
- Grouping/containment relationships:
  - Brush controls group color, size, opacity, and shape.
  - Eraser controls group eraser mode and eraser size.
  - Layer controls group active layer, opacity, visibility, reorder, add, and delete.
  - Canvas preview contains separate layer planes and a draft overlay.
- Scroll or overflow expectations:
  - The real Draw section is media/canvas-oriented and can be taller than compact list/group sections.
  - The prototype may use a fixed preview height with clipped canvas content and a horizontally/vertically contained layer list, but it should not expose unrelated empty areas.

## Intentional Differences
- What the flat prototype is allowed to change:
  - Replace production rounded/shadowed popovers and live canvas DOM with a static pure HTML/CSS representation in the accepted flat prototype language.
  - Simplify popover settings into always-visible compact controls so the section affordances are visible in a static prototype.
- What production layout logic is intentionally not reused:
  - No production Tailwind class chains, canvas refs, mouse hooks, artifact loading hooks, popover implementation, drag-and-drop implementation, or generated section runtime mutations are copied.
- Confirmation that the prototype is not fictional and is not an old-design lift:
  - Every fixture value maps to real Draw fields or layer item payloads; the layout is newly composed for the flat prototype.
- Confirmation that every visible prototype affordance maps to real section behavior or data:
  - Toolbar mode buttons, color/brush/eraser settings, layer opacity/list/actions, clear strokes, layer planes, draft canvas, image item, brush stroke item, and transform handles all map to inspected Draw behavior or payload data.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component:
  - The `Draw` label will be added only through `FlatPrototypeGalleryItem`, outside `FlatSectionShell`.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed:
  - The Draw task will not alter Callable or Param Dict/Dict component bodies, fixtures, row hierarchy, controls, ports, section structure, or accepted CSS.

## Component Plan
- New files or functions:
  - Add Draw-only fixture types/data and `FlatDrawSectionPrototype`/`FlatDrawBody` in `FlatSectionPrototype.tsx`.
  - Add Draw-only CSS selectors in `FlatSectionPrototype.css`.
  - Add Draw markup and sizing tests in `FlatSectionPrototype.test.tsx`.
- Static fixture data:
  - Three layers: an active ink layer with brush strokes, a visible image layer with an image item and transform id, and a hidden notes layer with zero elements.
  - Brush settings: red color, round brush, size 16, opacity 0.8, eraser size 24, layer opacity 0.65, and `canvasMode` draw.
- Tests/verification:
  - Run Prettier for touched frontend prototype files.
  - Run `pnpm -C frontend exec vitest run src/components/Section/Layouts/FlatSectionPrototype.test.tsx`.
  - Run `git diff --check`.
  - Run CDP visual verification for the Draw prototype when feasible.
