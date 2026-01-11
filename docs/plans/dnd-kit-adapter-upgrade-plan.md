# dnd-kit adapter upgrade plan

## Goals
- Replace the in-repo fork with a thin adapter layer built on the new dnd-kit packages.
- Preserve current Setta-specific drag behavior (nested rules, temp placeholders, free-move vs sort, React Flow zoom).
- Reduce long-term maintenance by aligning with upstream APIs.

## Non-goals
- No attempt to keep the legacy fork around or provide dual-path compatibility.
- No UI redesign or drag UX changes beyond parity with current behavior.

## Constraints
- Adapter must live in app code (no edits in external dnd-kit repos).
- Keep existing app-facing drag APIs stable where possible to limit call-site churn.
- Avoid using legacy `@dnd-kit/*` packages once adapter is in place.

## Behaviors to preserve
- Custom collision data: `pastHalfway`, `triggerDistCondition`, sibling-only sort mode.
- Collision hysteresis (bias toward previous over target to reduce jitter).
- Temp placeholder IDs (`-TempDND`) and using them as active/over while dragging.
- Free-move vs sorting modes and drop validation rules.
- React Flow zoom-aware geometry for transforms and hit testing.
- Disabled drag per section and per-mode modifiers.
- Autoscroll disabled in the global DnD provider.

## Adapter architecture (proposed)
- `frontend/src/forks/dnd-kit/adapter/`
  - `DragDropProvider.tsx` (wraps `@dnd-kit/react` provider, configures plugins/sensors/modifiers).
  - `useDndMonitor.ts` (adapts `useDragDropMonitor` to current event payloads).
  - `useDraggable.ts`, `useDroppable.ts`, `useSortable.ts` (adapter hooks, return old shapes where needed).
  - `SortableContext.tsx` (adapter context, provides items/indices/over info).
  - `collision.ts` (custom collision detectors + hysteresis state).
  - `sorting.ts` (pastHalfway index logic + sorting plugin glue).
  - `zoom.ts` (modifier or transform utilities for React Flow zoom).
- Keep `frontend/src/forks/dnd-kit/dndState.ts`, `dndChildren.ts`,
  `useDropType.ts`, `useMoveSection.ts` and rewire them to adapter events.

## Plan
1. Inventory and mapping
   - Enumerate call sites and dependencies on current fork APIs.
   - Map old event payloads to new `DragDropEvents` (`operation`, `source`, `target`).
   - Identify which parts require adapter shims vs call-site updates.
2. Dependency upgrade
   - Add new packages: `@dnd-kit/react`, `@dnd-kit/dom`, `@dnd-kit/abstract`,
     `@dnd-kit/collision`, `@dnd-kit/helpers`, `@dnd-kit/state`, `@dnd-kit/geometry`.
   - Remove legacy `@dnd-kit/*` packages once adapter is wired.
3. Provider and monitor adapter
   - Implement `DragDropProvider` to replace `CustomCore/DndContext`.
   - Configure plugins without `AutoScroller` to preserve `autoScroll={false}`.
   - Wrap `useDragDropMonitor` to emit current `onDragStart/Move/Over/End/Cancel`
     signatures and update `useDndState`.
4. Collision detection port
   - Port `customCollisionDetection` and `customCollisionDetectionSorting`
     to the new `CollisionDetector` signature (`{droppable, dragOperation}`).
   - Populate `collision.data` with `pastHalfway` and `triggerDistCondition`.
   - Implement hysteresis in the detector module (track previous collision id/value per drag).
   - Ensure collisions are available to `useDropType` and `useMoveSection`.
5. Sorting adapter
   - Decide whether to disable `OptimisticSortingPlugin` and replace with a custom plugin
     that updates indices based on `pastHalfway` and Setta rules.
   - Implement adapter `SortableContext` that mirrors existing fields
     (`items`, `overIndex`, `activeIndex`, `sortedRects`) using new signals.
   - Provide `useSortable` wrapper that yields `transform`, `transition`,
     `overIndex`, and `listeners` in the shape existing components expect.
6. Drag feedback + zoom handling
   - Decide whether to keep the built-in `Feedback` plugin or manage transforms manually.
   - If manual, compute transform from `dragOperation.transform` and apply
     React Flow zoom compensation (existing logic in `transformWithZoom` or a modifier).
   - If using `Feedback`, ensure overlay/transform math is zoom-safe and does not
     double-apply scaling.
7. Adapter integration updates
   - Swap imports in `frontend/src/forks/dnd-kit/GlobalDndContext.tsx` to the adapter provider.
   - Update `frontend/src/components/Section/Container/SortableSectionContainer.tsx`
     and `frontend/src/components/Section/Container/TopLevelContainer.tsx`
     to use adapter refs/listeners.
   - Update `frontend/src/forks/dnd-kit/useDropType.ts` and
     `frontend/src/forks/dnd-kit/useMoveSection.ts` to read from the new event/operation
     data and collisions payloads.
8. Fork removal
   - Delete `frontend/src/forks/dnd-kit/CustomCore` and `CustomSortable`.
   - Replace exports in `frontend/src/forks/dnd-kit/index.ts` (if needed)
     to point at adapter modules.
   - Cleanup unused legacy utilities (`@dnd-kit/utilities`, `@dnd-kit/modifiers`,
     `@dnd-kit/accessibility`) once adapter is stable.
9. Documentation
   - Update `docs/dnd-kit-fork-comparison.md` with a final summary of what remains
     in the adapter and what is now upstream-provided.

## Validation checklist
- Sort within a list: reorder, hover jitter, `pastHalfway`-based insertion.
- Free-move: reparenting, `triggerDistCondition`, invalid drop behavior.
- Temp placeholder flow: overlay presence and correct `isDragging` semantics.
- Top-level container drag: `disabled` state respects locked sections.
- Zoomed canvas: hit testing and transforms match the legacy behavior.
- Keyboard drag (if used): still works and does not scroll unexpectedly.

## Risks and mitigations
- Transform/zoom mismatch from the new Feedback plugin.
  - Mitigate by disabling Feedback and applying transforms manually.
- Sorting plugin conflicts with React render ordering.
  - Mitigate by owning the index/group updates in the adapter and not letting
    the plugin reorder DOM outside React.
- Collision data timing mismatches.
  - Mitigate by storing collisions in adapter state and emitting them with
    monitor events, not reading stale `target` state.

## Open questions
- Should we keep the existing import path `forks/dnd-kit/*` to minimize churn,
  or rename to `dnd-kit-adapter/*` and update call sites?
- Do we need the keyboard sensor flow in the new system, or can it be disabled?
- Is the built-in Feedback plugin acceptable once zoom compensation is applied?

## Implementation clarifications (lock these before coding)
- Package versions and import replacements:
  - Replace legacy `@dnd-kit/*` with the new stack:
    - `@dnd-kit/react`, `@dnd-kit/dom`, `@dnd-kit/abstract`,
      `@dnd-kit/collision`, `@dnd-kit/helpers`, `@dnd-kit/state`, `@dnd-kit/geometry`.
    - `@dnd-kit/modifiers` -> `@dnd-kit/dom/modifiers`.
    - `@dnd-kit/utilities` -> split between `@dnd-kit/react/utilities` and
      `@dnd-kit/dom/utilities` as needed.
- Event mapping:
  - `onDragStart` -> `dragstart` (use `event.operation.source` and `operation.activatorEvent`).
  - `onDragMove` -> `dragmove` (use `event.operation.position` and `manager.collisionObserver.collisions`).
  - `onDragOver` -> `dragover` (use `event.operation.target` and collisions).
  - `onDragEnd` -> `dragend` (use `event.canceled` and `event.operation`).
  - Synthesize `onDragCancel` when `dragend` fires with `canceled: true`.
  - Always emit collisions from `manager.collisionObserver.collisions` rather
    than the target alone.
- Sensors and activators:
  - Port `useDNDSensors` to configure `PointerSensor` with `activatorElements`
    and `activationConstraints` matching current behavior.
  - Decide whether to include `KeyboardSensor` (keep for parity unless explicitly dropped).
- Feedback/overlay and zoom:
  - Choose between the built-in `Feedback` plugin vs manual transforms.
  - If manual, apply `dragOperation.transform` to node styles and apply React Flow
    zoom compensation in the adapter.
  - If using `Feedback`, ensure zoom is compensated once (avoid double scaling).
- Sorting plugin decision:
  - Decide whether to disable `OptimisticSortingPlugin`.
  - If disabled, implement a custom sorting plugin or event handler that updates
    indices based on `pastHalfway`, temp IDs, and sibling-only rules.
- Adapter hook contracts:
  - Define the exact return shape for adapter `useSortable` to match current
    call sites (`listeners`, `attributes`, `transform`, `transition`, `overIndex`, `items`).
  - Define `SortableContext` inputs/outputs (`items`, `sortedRects`, `activeIndex`,
    `overIndex`, `useDragOverlay`, `disableTransforms`) and where they are derived.

## Docs notes (next.dndkit.com)
- Migration guidance: replace legacy `@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities` with `@dnd-kit/react` plus `@dnd-kit/helpers` and
  add `@dnd-kit/dom`/`@dnd-kit/collision`/`@dnd-kit/abstract` as needed.
- `DndContext` -> `DragDropProvider` and event handlers now receive `(event, manager)`.
  Use `event.operation` for `source`, `target`, and `position` instead of legacy payloads.
- `onDragCancel` behavior is represented by `dragend` with `canceled: true`.
- Collision detection is configured via `@dnd-kit/collision` algorithms (e.g. `closestCenter`).
