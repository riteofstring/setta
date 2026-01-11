# dnd-kit fork vs legacy comparison

Scope: compares the in-repo fork under `frontend/src/forks/dnd-kit` against the legacy source under `dnd-kit-legacy` (specifically `packages/core/src` and `packages/sortable/src`). Focus is on functional differences, not formatting or import path changes.

## Core behavior differences

- Custom collision data and selection: collisions include `pastHalfway` and `triggerDistCondition`, and collision resolution is section-aware (nested, left distance, etc.). Motivation: enable section-aware ordering and richer drop heuristics. `frontend/src/forks/dnd-kit/collisionDetection.ts`
- Collision hysteresis: the previous collision is biased and `pastHalfway` uses a buffer to stabilize over-target selection during drag. Motivation: reduce jitter when hovering between candidates. `frontend/src/forks/dnd-kit/collisionDetection.ts`
- Alternate collision mode for sorting: sibling-only comparison for sortable lists. Motivation: constrain list sorting to siblings only. `frontend/src/forks/dnd-kit/collisionDetectionSorting.ts`
- DndContext exposes `overId` and `pastHalfway` in public/internal context and uses them in downstream logic. Motivation: make collision metadata available to app logic and sortable calculations. `frontend/src/forks/dnd-kit/CustomCore/components/DndContext/DndContext.tsx`
- Droppable registration uses layout effect (timing change), `isOver` is computed from `overId`, and `over` is no longer returned. Motivation: align measurement timing and depend on a stable `overId`. `frontend/src/forks/dnd-kit/CustomCore/hooks/useDroppable.ts`
- Pointer sensor drops `pointercancel` handling and pending/abort callbacks are removed; drag events no longer include `activatorEvent` or pending/abort events. Motivation: simplify the event surface to the app's needs. `frontend/src/forks/dnd-kit/CustomCore/sensors/pointer/AbstractPointerSensor.ts` `frontend/src/forks/dnd-kit/CustomCore/sensors/pointer/PointerSensor.ts` `frontend/src/forks/dnd-kit/CustomCore/types/events.ts`
- Transform inversion accounts for React Flow zoom. Motivation: keep drag geometry correct under zoom. `frontend/src/forks/dnd-kit/CustomCore/utilities/transform/inverseTransform.ts`

## Sortable behavior differences

- Sorting strategies use `pastHalfway` to derive an effective `overIndex` (instead of using `overIndex` directly). Motivation: allow reorder behavior to depend on crossing midpoints. `frontend/src/forks/dnd-kit/CustomSortable/strategies/horizontalListSorting.ts` `frontend/src/forks/dnd-kit/CustomSortable/strategies/verticalListSorting.ts` `frontend/src/forks/dnd-kit/CustomSortable/strategies/computeNewIndex.ts`
- Sorting strategy contract change: horizontal/vertical strategies now accept `pastHalfway` and return `[transform, effectiveOverIndex]`, and `useSortable` consumes that tuple. Motivation: let the strategy drive index decisions. `frontend/src/forks/dnd-kit/CustomSortable/strategies/horizontalListSorting.ts` `frontend/src/forks/dnd-kit/CustomSortable/strategies/verticalListSorting.ts` `frontend/src/forks/dnd-kit/CustomSortable/hooks/useSortable.ts`
- `useSortable` uses that effective index for `newIndex` and passes `pastHalfway` into strategies. Motivation: keep new index logic consistent with the midpoint rules. `frontend/src/forks/dnd-kit/CustomSortable/hooks/useSortable.ts`
- Sortable context uses `overId` and treats temp placeholders as the active item for index calculations. Motivation: support temp placeholder ids during drag. `frontend/src/forks/dnd-kit/CustomSortable/components/SortableContext.tsx`
- Transitions no longer depend on `isSorting` alone; they require `shouldAnimateLayoutChanges`. Motivation: avoid unnecessary animation when layout changes should be suppressed. `frontend/src/forks/dnd-kit/CustomSortable/hooks/useSortable.ts`

## Temp placeholder and free-move mode

- Temp placeholder IDs (`-TempDND`) are used for drag overlays and as list items while dragging; draggable detection is updated to treat temp IDs as active. Motivation: represent the dragged item in lists without losing its original id. `frontend/src/forks/dnd-kit/dndState.ts` `frontend/src/forks/dnd-kit/CustomCore/hooks/useDraggable.ts` `frontend/src/forks/dnd-kit/CustomSortable/components/SortableContext.tsx`
- Custom per-project DnD state (sorting vs free-move, disabled states, drop behavior type, timers). Motivation: encode app-specific drag modes and constraints. `frontend/src/forks/dnd-kit/dndState.ts` `frontend/src/forks/dnd-kit/useDndUtils.ts`
- Temporary child mapping during drag to model reparenting and ordering. Motivation: simulate new parent/ordering before committing changes. `frontend/src/forks/dnd-kit/dndChildren.ts`

## App-specific DnD layer (not in legacy)

- Global wiring for sensors, modifiers, measuring, collision detection, and custom drag overlay; autoscroll is disabled. Motivation: centralize config and align drag behavior with the app's UX. `frontend/src/forks/dnd-kit/GlobalDndContext.tsx` `frontend/src/forks/dnd-kit/useDNDSensors.ts` `frontend/src/forks/dnd-kit/useModifiers.ts` `frontend/src/forks/dnd-kit/useMeasuring.ts` `frontend/src/forks/dnd-kit/DummySection.tsx`
- Drop validation and reparenting logic using section metadata and behavior types. Motivation: enforce section constraints and drop rules. `frontend/src/forks/dnd-kit/useDropType.ts` `frontend/src/forks/dnd-kit/dropTypes.ts`
- Drag-end integration with backend move operations and React Flow coordinates. Motivation: persist layout updates and map to flow coordinates. `frontend/src/forks/dnd-kit/useMoveSection.ts`

## Side-by-side highlights

| Area | Legacy behavior (path) | Fork behavior (path) | Probable motivation |
| --- | --- | --- |
| Collision detection | Built-in algorithms; collisions only carry value metadata (`dnd-kit-legacy/packages/core/src/utilities/algorithms/*`). | Custom section-aware collision logic, adds `pastHalfway` and `triggerDistCondition` (`frontend/src/forks/dnd-kit/collisionDetection.ts`). | Support nested layouts and reparenting heuristics. |
| DndContext | Exposes `over` only, no `overId`/`pastHalfway`; supports `onDragPending`/`onDragAbort` (`dnd-kit-legacy/packages/core/src/components/DndContext/DndContext.tsx`). | Exposes `overId`/`pastHalfway` in context and drops pending/abort hooks (`frontend/src/forks/dnd-kit/CustomCore/components/DndContext/DndContext.tsx`). | Provide collision metadata and trim unused events. |
| useDroppable | Registers in effect; `isOver` uses `over?.id` and returns `over` (`dnd-kit-legacy/packages/core/src/hooks/useDroppable.ts`). | Registers in layout effect; `isOver` uses `overId` and does not return `over` (`frontend/src/forks/dnd-kit/CustomCore/hooks/useDroppable.ts`). | Earlier registration and `overId`-driven state. |
| Pointer sensor/events | Listens to `pointercancel` and supports pending/abort callbacks (`dnd-kit-legacy/packages/core/src/sensors/pointer/AbstractPointerSensor.ts`). | Drops `pointercancel` and pending/abort callbacks; slimmer event surface (`frontend/src/forks/dnd-kit/CustomCore/sensors/pointer/AbstractPointerSensor.ts`). | Simplify sensor behavior to match app usage. |
| useDraggable | `isDragging` only when `active.id === id` (`dnd-kit-legacy/packages/core/src/hooks/useDraggable.ts`). | Treats temp placeholder IDs as active and returns `pastHalfway` (`frontend/src/forks/dnd-kit/CustomCore/hooks/useDraggable.ts`). | Support temp placeholder ids during drag. |
| Sortable strategies | `overIndex` is used directly (`dnd-kit-legacy/packages/sortable/src/strategies/horizontalListSorting.ts`). | Uses `pastHalfway` to compute an effective `overIndex` (`frontend/src/forks/dnd-kit/CustomSortable/strategies/horizontalListSorting.ts`). | Make index changes depend on crossing midpoints. |
| Strategy contract | Strategies return `Transform | null` and only accept `overIndex` (`dnd-kit-legacy/packages/sortable/src/types/strategies.ts`). | Horizontal/vertical strategies return `[transform, effectiveOverIndex]` and accept `pastHalfway`; `useSortable` consumes the tuple (`frontend/src/forks/dnd-kit/CustomSortable/strategies/horizontalListSorting.ts`, `frontend/src/forks/dnd-kit/CustomSortable/strategies/verticalListSorting.ts`, `frontend/src/forks/dnd-kit/CustomSortable/hooks/useSortable.ts`). | Allow strategies to drive the final index. |
| useSortable | `newIndex` uses `overIndex` and transitions gate on `isSorting` (`dnd-kit-legacy/packages/sortable/src/hooks/useSortable.ts`). | `newIndex` uses effective `overIndex`, transitions only when `shouldAnimateLayoutChanges` (`frontend/src/forks/dnd-kit/CustomSortable/hooks/useSortable.ts`). | Keep newIndex aligned with pastHalfway and reduce extra animation. |
| SortableContext | Uses `over` and `active.id` for indices (`dnd-kit-legacy/packages/sortable/src/components/SortableContext.tsx`). | Uses `overId` and temp placeholder IDs for indices (`frontend/src/forks/dnd-kit/CustomSortable/components/SortableContext.tsx`). | Handle temp placeholder ids and `overId` flow. |
| Transform inversion | Uses parsed transform only (`dnd-kit-legacy/packages/core/src/utilities/transform/inverseTransform.ts`). | Adjusts translation by React Flow zoom (`frontend/src/forks/dnd-kit/CustomCore/utilities/transform/inverseTransform.ts`). | Maintain correct geometry under zoom. |

## Likely reasons for the fork (functional requirements)

- Section-aware collision resolution and "past-halfway" ordering logic that the legacy API does not expose directly.
- Temp placeholder support and free-move vs sort modes during complex nested layout moves.
- React Flow zoom-aware geometry math.
- Tight coupling to app state (drop validation, disabled sections, reparenting, backend updates).
