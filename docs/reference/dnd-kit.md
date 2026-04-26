# dnd-kit Usage

This document explains how the frontend uses dnd-kit to drag, reorder, and
reparent both sections and params in the project UI.

## Where the integration lives

- dnd-kit is wrapped in `frontend/src/forks/dnd-kit/`.
- App code imports from `frontend/src/forks/dnd-kit/adapter` instead of directly
  from `@dnd-kit/*`.
- `frontend/src/components/Pages/Project/UiPage.tsx` wraps the UI with
  `GlobalDndContext`.
- Param dragging is hosted by `frontend/src/forks/dnd-kit/ParamDndContext.tsx`,
  mounted in `frontend/src/components/Params/GroupContainer.tsx`.

## Global context and sensors

- `GlobalDndContext` wires the adapter `DragDropProvider`, modifiers, sensors,
  and drag callbacks.
- `DragDropProvider` filters out the AutoScroller plugin and maps native dnd-kit
  events into local `DragStartEvent`/`DragMoveEvent`/`DragEndEvent` types.
- `useDNDSensors` returns Pointer + Keyboard sensors only when
  `useShareCapabilities().canEditLayout` is true.
- Drag activation is gated by the current mode (`isSorting` or `isMovingFree`)
  so the UI does not start drags by accident.
- Param dragging uses `useParamDndSensors`, which only activates when
  `isSelectingParams` is true and `useShareCapabilities().canEditStructure` is
  allowed, and only for draggables whose data type is `"param"`.

## State and temporary children

- `useDndState` stores the active/over ids, mode flags, and the current
  `behaviorDropType`. It also tracks `draggingIds` for multi-selection and
  `draggingRectsById` for selection bounding boxes.
- `useDndChildren` mirrors the current parent -> children map so drag reordering
  can happen without mutating project state. It is synced from project state in
  `frontend/src/state/subscriptions.ts`.
- Temporary placeholder ids use `getDndSectionId` (suffix `-TempDND`) and are
  swapped into the tree during free-move drags.
- Param drags keep their own state in `useParamDndState` and
  `useParamDndChildren`. Param ids are namespaced with
  `getParamDndItemId(paramId, listKey)` and placeholders use `::TempParamDND`.

## Drag modes

- Sorting mode (`activateDndSortingMode`) reorders children within a parent.
- Moving-free mode (`activateDndMovingFreeMode`) allows reparenting or moving a
  section onto the canvas.
- Shortcuts for both modes are registered in
  `frontend/src/state/actions/keyActivations.ts`.

## Selection-aware drags

- Dragging in share mode always targets the active section only.
- In non-share mode, drag selection is resolved from the lightweight
  `useActiveSectionUI` / `getActiveSectionUIIds()` store, not directly from
  `projectConfig.activeIds`.
- The UI-owned selection updates immediately during section clicks, marquee
  selection, and pane deselects. Durable `projectConfig.activeIds` sync is
  deferred until the gesture completes or the next sync point, so drag targeting
  follows the live UI state instead of waiting for the full project-store write.
- Dragging uses root selections (selected sections that do not have a
  selected ancestor).
- Selection across multiple parents is rejected with a notification and falls
  back to dragging the active section only.
- Moving-free drags derive a bounding rect for the selection. This keeps drag
  overlays and dnd shapes stable for multi-section moves.
- The selection rectangle exposes a drag handle (`NodesSelectionDragHandle`)
  during moving-free mode so users can drag the entire selection from the
  selection box.
- Marquee hit testing uses node internals when they are measured and falls back
  to live DOM bounds for unmeasured or nested sections, so box selection can
  capture nested children.

## Drag lifecycle

- Start: `useDropType.onDragStart` resolves the drag selection, sets the active
  section size (or selection-derived size), and swaps in the temp placeholder
  when moving free.
- Move/over: `useDropType` evaluates collisions, `pastHalfway`, and
  `triggerDistCondition` to update `useDndChildren` and `behaviorDropType`.
- End: `useMoveSection.useOnDragEnd` commits the move.
  - Sorting calls `moveSectionsWithBackend` with the new index.
  - Moving free resolves the new parent/index or per-section canvas positions
    (`positionsById`) and then calls `moveSectionsWithBackend`.
  - Cancelled drags force a reset via `forceDeactivateDnd`.
- `moveSectionsWithBackend` switches to `route_set_code_section_attached_terminal`
  when a single Terminal is dropped into a code section.
- During attach-through-move, the frontend also normalizes terminal width to the
  destination code section width (when that width is concrete) so terminal
  column reflow happens immediately after drop.

## Drop rules

- `getBehaviorDropType` marks a drop as INVALID when the target is neither a
  root section nor a code section (Code / GenPythonCode / GenPythonMetadata).
- It is also INVALID when the target variant is frozen.
- It is also INVALID when the active section is GlobalVariables.
- For code section targets, drops are INVALID unless the selection is exactly
  one Terminal section and the code section has no other child (or the child is
  the same terminal).
- `useHighlightDroppable` and `DndSlot` render the INVALID overlay state.

## Collision detection and sorting

- `adapter/collision.ts` defines two detectors:
  - `customCollisionDetection` for moving free.
  - `customCollisionDetectionSorting` for sorting within a container.
- Collisions carry extra metadata (`pastHalfway`, `triggerDistCondition`) for
  placeholder placement.
- `adapter/collisionCompare.ts` promotes the best collision, preferring child
  collisions, and adds hysteresis to reduce flicker.
- `SortableContext` caches rects and uses `sortingOverState` to stabilize over
  resolution during sort drags.
- `useSortable` applies the configured sorting strategy and optional axis
  restrictions.
- Collision orientation can come from sortable item metadata
  (`sortableOrientation: "horizontal" | "vertical"`), not only section
  orientation. This is used by list-style sortables outside the canvas section
  tree.

## Component wiring

- `TopLevelContainer` uses `useDraggable` + `useDroppable` for top-level
  sections.
- `ManyNestedSections` wraps child lists in `DNDSortable` and renders each item
  with `SortableSectionContainer`.
- `SortableSectionContainer` applies zoom-aware transforms and renders
  `TempDNDSection` when needed.
- `DragOperationShapeSync` keeps drag shapes stable during sorting.
- `DeferredDndDeactivation` waits for dnd-kit to idle before resetting state.
- `DummyDragOverlay` renders the free-move drag overlay.

## Param dragging

Param drag-and-drop is a separate dnd-kit provider layered inside the params
panel. It only runs in param selection mode and targets the pinned/unpinned
param lists.

### Where it is wired

- `frontend/src/forks/dnd-kit/ParamDndContext.tsx` creates a DragDropProvider
  configured for param collisions (`mode: "param"`). It mounts:
  - `ParamDndMonitor` to handle start/over/end logic.
  - `ParamDragOverlay` for the blue drag overlay.
  - `DragOperationShapeSync` for stable drag shapes.
- `frontend/src/components/Params/ParamDndList.tsx` wraps each list
  (pinned/unpinned) in `ParamDndProvider`, which provides a SortableContext
  based on the current param tree.
- Individual params (`ParamSwitch` / `ParamContainer`) use `useSortable` with
  data `{ type: "param", sectionId, listKey, paramId }`.

### When param drag is enabled

- `useMisc().isSelectingParams` must be true.
- `useShareCapabilities().canEditStructure` must be true (share mode disables
  param drags).
- The section must be a param-capable type (Callable, Dict, GlobalVariables).
- Param filtering must be empty; active filters disable param drags and show a
  notification.
- Edge input params are filtered out of the draggable lists.

### How params are dragged

- **Select:** The active drag set is derived from the current param selection.
  If multiple params are selected, the drag will move the root selections
  (selected params without a selected ancestor). Selection that spans multiple
  parents is collapsed to the active param with a notification.
- **Reorder within a parent:** Drag vertically. The placeholder is inserted into
  the local `useParamDndChildren` map and moved with `pastHalfway` +
  `computeNewIndex` heuristics.
- **Reparent (indent):** Drag horizontally to the right. When the horizontal
  offset crosses the param trigger threshold (30px \* zoom), collisions report
  `triggerDistCondition` and `resolveParamDragParent` sets the new parent to the
  hovered param. Without crossing the threshold, the drop stays within the
  hovered param's parent.
- **Drop:** `ParamDndMonitor` computes the visible placeholder index, resolves
  the full index with `resolveFullIndexForVisibleInsertion` (so hidden params
  keep their order), and calls `moveParamsWithBackend` to sync with the backend.

### Param drag rules and safeguards

- Collisions are filtered by `listKey`, so pinned and unpinned params never
  intermix during drag.
- Dropping into descendants of the dragged selection is blocked.
- If param selection mode is toggled off mid-drag, the drag is canceled and the
  param DnD state resets.

## Viewport and zoom

- `adapter/zoom.ts` scales transforms by the CanvasFlow zoom factor stored in
  the shared graph store.
- `CanvasFlowInteractions` disables pan/zoom while dragging (`isSorting` or
  `isMovingFree`).

## Other usage

- `@dnd-kit/helpers/arrayMove` is used in `DrawAreaControls` for layer ordering.

## List-style sortables outside the canvas

- `frontend/src/components/Pages/Project/ViewModeDnd.tsx` adds a shared wrapper
  (`SortableListProvider` + `useSortableListItem`) for simple list reordering.
- This wrapper is used for:
  - view mode tabs (`ViewModeTabs`)
  - overview view mode rows (`ViewingEditingMode`)
  - overview project-config rows (`ProjectConfigs`)
  - section variant rows (`VariantList`)
- `useSortable` exposes `setActivatorNodeRef`, so drag handles can be
  separated from click-to-open row interactions.
- The list wrapper ignores tiny drags (4px threshold) so clicking a handle does
  not accidentally trigger a reorder.

## Extension points

- Add new drop rules in `getBehaviorDropType` in
  `frontend/src/forks/dnd-kit/useDropType.ts`.
- Update axis rules in `useModifiers` and `DNDSortable`.
- For new draggable UI, use `useDndProps` and the adapter hooks from
  `frontend/src/forks/dnd-kit/adapter`.
