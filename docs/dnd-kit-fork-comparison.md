# dnd-kit fork vs legacy comparison

Scope: compares the in-repo fork under `frontend/src/forks/dnd-kit` against the legacy source under `dnd-kit-legacy` (specifically `packages/core/src` and `packages/sortable/src`). Focus is on functional differences, not formatting or import path changes.

## Core behavior differences

- Custom collision data and selection: collisions include `pastHalfway` and `triggerDistCondition`, and collision resolution is section-aware (nested, left distance, etc.). `frontend/src/forks/dnd-kit/collisionDetection.ts`
- Alternate collision mode for sorting: sibling-only comparison for sortable lists. `frontend/src/forks/dnd-kit/collisionDetectionSorting.ts`
- DndContext exposes `overId` and `pastHalfway` in public/internal context and uses them in downstream logic. `frontend/src/forks/dnd-kit/CustomCore/components/DndContext/DndContext.tsx`
- Droppable registration uses layout effect (timing change), `isOver` is computed from `overId`, and `over` is no longer returned. `frontend/src/forks/dnd-kit/CustomCore/hooks/useDroppable.ts`
- Pointer sensor drops `pointercancel` handling and pending/abort callbacks are removed; drag events no longer include `activatorEvent` or pending/abort events. `frontend/src/forks/dnd-kit/CustomCore/sensors/pointer/AbstractPointerSensor.ts` `frontend/src/forks/dnd-kit/CustomCore/sensors/pointer/PointerSensor.ts` `frontend/src/forks/dnd-kit/CustomCore/types/events.ts`
- Transform inversion accounts for React Flow zoom. `frontend/src/forks/dnd-kit/CustomCore/utilities/transform/inverseTransform.ts`

## Sortable behavior differences

- Sorting strategies use `pastHalfway` to derive an effective `overIndex` (instead of using `overIndex` directly). `frontend/src/forks/dnd-kit/CustomSortable/strategies/horizontalListSorting.ts` `frontend/src/forks/dnd-kit/CustomSortable/strategies/verticalListSorting.ts` `frontend/src/forks/dnd-kit/CustomSortable/strategies/computeNewIndex.ts`
- `useSortable` uses that effective index for `newIndex` and passes `pastHalfway` into strategies. `frontend/src/forks/dnd-kit/CustomSortable/hooks/useSortable.ts`
- Sortable context uses `overId` and treats temp placeholders as the active item for index calculations. `frontend/src/forks/dnd-kit/CustomSortable/components/SortableContext.tsx`
- Transitions no longer depend on `isSorting` alone; they require `shouldAnimateLayoutChanges`. `frontend/src/forks/dnd-kit/CustomSortable/hooks/useSortable.ts`

## Temp placeholder and free-move mode

- Temp placeholder IDs (`-TempDND`) are used for drag overlays and as list items while dragging; draggable detection is updated to treat temp IDs as active. `frontend/src/forks/dnd-kit/dndState.ts` `frontend/src/forks/dnd-kit/CustomCore/hooks/useDraggable.ts` `frontend/src/forks/dnd-kit/CustomSortable/components/SortableContext.tsx`
- Custom per-project DnD state (sorting vs free-move, disabled states, drop behavior type, timers). `frontend/src/forks/dnd-kit/dndState.ts` `frontend/src/forks/dnd-kit/useDndUtils.ts`
- Temporary child mapping during drag to model reparenting and ordering. `frontend/src/forks/dnd-kit/dndChildren.ts`

## App-specific DnD layer (not in legacy)

- Global wiring for sensors, modifiers, measuring, collision detection, and custom drag overlay; autoscroll is disabled. `frontend/src/forks/dnd-kit/GlobalDndContext.tsx` `frontend/src/forks/dnd-kit/useDNDSensors.ts` `frontend/src/forks/dnd-kit/useModifiers.ts` `frontend/src/forks/dnd-kit/useMeasuring.ts` `frontend/src/forks/dnd-kit/DummySection.tsx`
- Drop validation and reparenting logic using section metadata and behavior types. `frontend/src/forks/dnd-kit/useDropType.ts` `frontend/src/forks/dnd-kit/dropTypes.ts`
- Drag-end integration with backend move operations and React Flow coordinates. `frontend/src/forks/dnd-kit/useMoveSection.ts`

## Likely reasons for the fork (functional requirements)

- Section-aware collision resolution and "past-halfway" ordering logic that the legacy API does not expose directly.
- Temp placeholder support and free-move vs sort modes during complex nested layout moves.
- React Flow zoom-aware geometry math.
- Tight coupling to app state (drop validation, disabled sections, reparenting, backend updates).
