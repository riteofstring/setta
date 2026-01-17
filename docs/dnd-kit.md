# dnd-kit Usage

This document explains how the frontend uses dnd-kit to drag, reorder, and
reparent sections in the project UI.

## Where the integration lives

- dnd-kit is wrapped in `frontend/src/forks/dnd-kit/`.
- App code imports from `frontend/src/forks/dnd-kit/adapter` instead of directly
  from `@dnd-kit/*`.
- `frontend/src/components/Pages/Project/UiPage.tsx` wraps the UI with
  `GlobalDndContext`.

## Global context and sensors

- `GlobalDndContext` wires the adapter `DragDropProvider`, modifiers, sensors,
  and drag callbacks.
- `DragDropProvider` filters out the AutoScroller plugin and maps native dnd-kit
  events into local `DragStartEvent`/`DragMoveEvent`/`DragEndEvent` types.
- `useDNDSensors` returns Pointer + Keyboard sensors only when
  `useShareCapabilities().canEditLayout` is true.
- Drag activation is gated by the current mode (`isSorting` or `isMovingFree`)
  so the UI does not start drags by accident.

## State and temporary children

- `useDndState` stores the active/over ids, mode flags, and the current
  `behaviorDropType`.
- `useDndChildren` mirrors the current parent -> children map so drag reordering
  can happen without mutating project state. It is synced from project state in
  `frontend/src/state/subscriptions.ts`.
- Temporary placeholder ids use `getDndSectionId` (suffix `-TempDND`) and are
  swapped into the tree during free-move drags.

## Drag modes

- Sorting mode (`activateDndSortingMode`) reorders children within a parent.
- Moving-free mode (`activateDndMovingFreeMode`) allows reparenting or moving a
  section onto the canvas.
- Shortcuts for both modes are registered in
  `frontend/src/state/actions/keyActivations.ts`.

## Drag lifecycle

- Start: `useDropType.onDragStart` sets the active section size and swaps in the
  temp placeholder when moving free.
- Move/over: `useDropType` evaluates collisions, `pastHalfway`, and
  `triggerDistCondition` to update `useDndChildren` and `behaviorDropType`.
- End: `useMoveSection.useOnDragEnd` commits the move.
  - Sorting calls `moveSectionWithBackend` with the new index.
  - Moving free resolves the new parent/index (or canvas position) and then
    calls `moveSectionWithBackend`.
  - Cancelled drags force a reset via `forceDeactivateDnd`.

## Drop rules

- `getBehaviorDropType` marks a drop as INVALID when:
  - The target is not a root section.
  - The target variant is frozen.
  - The active section is GlobalVariables.
- `useHighlightDroppable` and `DndSlot` render the INVALID overlay state.

## Collision detection and sorting

- `adapter/collision.ts` defines two detectors:
  - `customCollisionDetection` for moving free.
  - `customCollisionDetectionSorting` for sorting within a container.
- Collisions carry extra metadata (`pastHalfway`, `triggerDistCondition`) used to
  place the placeholder.
- `adapter/collisionCompare.ts` promotes the best collision, preferring child
  collisions, and adds hysteresis to reduce flicker.
- `SortableContext` caches rects and uses `sortingOverState` to stabilize over
  resolution during sort drags.
- `useSortable` applies the configured sorting strategy and optional axis
  restrictions.

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

## Viewport and zoom

- `adapter/zoom.ts` scales transforms by the ReactFlow zoom factor.
- `ZoomPane` disables pan/zoom while dragging (`isSorting` or `isMovingFree`).

## Other usage

- `@dnd-kit/helpers/arrayMove` is used in `DrawAreaControls` for layer ordering.

## Extension points

- Add new drop rules in `getBehaviorDropType` in
  `frontend/src/forks/dnd-kit/useDropType.ts`.
- Update axis rules in `useModifiers` and `DNDSortable`.
- For new draggable UI, use `useDndProps` and the adapter hooks from
  `frontend/src/forks/dnd-kit/adapter`.
