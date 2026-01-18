# Separate Section and Param DnD Contexts Plan

## Goal
Split section drag-and-drop and param drag-and-drop into separate DnD contexts so
the param registry does not inflate section collision checks. This should reduce
pointer-move collision work when large param lists are present.

## Non-goals
- Change param reparenting rules, shortcuts, or selection UX.
- Rewrite drag visuals or overlay styling.
- Rework backend param move endpoints or state shape.

## Current State Summary
- `GlobalDndContext` wraps the entire UI and owns a single `DragDropProvider`.
- Param drag uses `useSortable`/`SortableContext` under the same provider, so
  param droppables are visible to section collisions.
- Collision hysteresis is module-global in `adapter/collision.ts`.
- `useCollisionDetector` and `useSortable` depend on `useDndState` (section mode),
  even for param drags.

## Proposed Architecture
- `SectionDndContext` (rename/keep `GlobalDndContext`) owns section drag only.
- `ParamDndContext` is a second `DragDropProvider` for param drags.
- Each provider has its own:
  - sensors
  - collision tracker/hysteresis state
  - collision detector selection (section vs param)
- Param DnD components (`ParamDndMonitor`, `ParamDragOverlay`, `ParamDndProvider`)
  are mounted under the param provider only.

## Alignment With dnd-kit Docs
- dnd-kit supports multiple independent contexts via nested `DndContext` or
  multiple `DragDropProvider` instances.
- Nested contexts isolate interactions to the nearest provider; draggables and
  droppables do not cross context boundaries.
- Drag events are captured by the first context whose sensor activates
  (similar to event bubbling), so sensor activation constraints and gating are
  critical if providers are nested.

## Recommended Nesting Strategy
- Use nested providers to avoid moving param UI out of the main tree:
  - Outer: section provider (`SectionDndContext`).
  - Inner: param provider (`ParamDndContext`) wrapping only param lists.
- Gate param sensors to param drags (by `data.current.type === "param"` and
  selection mode) so section drags are not captured by the inner provider.
- Keep param droppables out of the section provider so section collisions never
  traverse param lists.
- If it becomes feasible to render param UI outside the section provider,
  prefer sibling providers instead of nesting to avoid sensor contention.

## Key Files and Ownership
- `frontend/src/forks/dnd-kit/GlobalDndContext.tsx`: section provider wrapper.
- `frontend/src/forks/dnd-kit/ParamDndContext.tsx`: new param provider wrapper.
- `frontend/src/forks/dnd-kit/adapter/DragDropProvider.tsx`: provider wiring.
- `frontend/src/forks/dnd-kit/adapter/collision.ts`: collision logic.
- `frontend/src/forks/dnd-kit/adapter/useCollisionDetector.ts`: detector choice.
- `frontend/src/forks/dnd-kit/useDNDSensors.ts`: split into section/param sensors.
- `frontend/src/components/Params/ParamDndMonitor.tsx`: param drag lifecycle.
- `frontend/src/components/Pages/Project/UiPage.tsx`: provider placement.

## Implementation Plan

### 1) Create provider-level collision tracking
- Extract collision hysteresis state into an instance-based tracker, e.g.
  `createCollisionTracker()` that returns `{ update, reset }`.
- Update `DragDropProvider` to accept an optional tracker instance, defaulting
  to a shared singleton to preserve current behavior.
- Instantiate two trackers:
  - `sectionCollisionTracker` for section DnD provider
  - `paramCollisionTracker` for param DnD provider
- Ensure `onCollision` in each provider uses its own tracker.

### 2) Split sensors by drag type
- Extract current `useDNDSensors` into:
  - `useSectionDndSensors()` (current section behavior)
  - `useParamDndSensors()` (param distance + selection gating)
- The param provider should not consult `useDndState` or section-only flags.
- Ensure param sensors only activate for param drags so section drags are not
  captured by the nested provider.
- Document activation constraints (distance, selection mode) so sensor capture
  remains predictable with nested providers.

### 3) Add a param-specific provider component
- New file: `frontend/src/forks/dnd-kit/ParamDndContext.tsx`.
- Use `DragDropProvider` with:
  - `useParamDndSensors()`
  - no section modifiers or drop-type handlers
  - param collision tracker
  - param-specific `DragOperationShapeSync` (or a simplified variant)
- Move `ParamDndMonitor` and `ParamDragOverlay` inside this provider.
- Keep `DummyDragOverlay` and section drag lifecycle in the section provider.

### 4) Scope providers in the UI tree
- Keep section provider wrapping the canvas and section drag overlays:
  - `GlobalDndContext` continues to wrap `ReactFlow`, panes, and section overlays.
- Mount `ParamDndContext` around the param UI subtree. Options:
  1) wrap the entire `UIPage` content (simpler wiring)
  2) wrap just param panes in `UiEditor` / `GroupContainer` (smaller registry)
- Ensure param DnD components (`ParamDndProvider` and `ParamSwitch`) remain
  descendants of the param provider.
- If nesting providers, rely on param sensor activation gating so the inner
  provider only captures param drags.
- Recommended: wrap the param lists only (pinned/unpinned) so the param registry
  is as small as possible.

### 5) Detach collision detection from section state
- `useCollisionDetector` currently reads `useDndState` (section mode).
  For the param provider, add one of:
  - `useParamCollisionDetector()` that always uses the non-sorting detector
  - a `SortableContext` flag (e.g. `collisionMode`) to choose detector
- Use the param-specific hook in `ParamDndProvider` or a param-specific
  `useSortable` wrapper.
- Ensure collision code does not read section-only state for param drags.

### 6) Remove cross-type guards from section logic
- After separation, section `useDropType` should never see param ids.
- Remove `type === "param"` checks from:
  - `useDropType`
  - `useDNDSensors` (section path)
  - `collision` heuristics (section path)
- Ensure section drag collisions never include param droppable ids.

### 7) Drag overlays and shape sync
- `DummyDragOverlay` stays inside the section provider only.
- Param overlay stays in param provider only.
- If `DragOperationShapeSync` is reused for both, ensure it does not
  depend on section state for param drags. Consider a param-only variant
  that uses `useParamDndState` exclusively.
- Verify overlays render only when their provider is active.

### 8) Update imports and component wiring
- Replace `GlobalDndContext` in `UIPage` with:
  - `SectionDndContext` wrapper
  - nested `ParamDndContext` wrapper
- Update any adapter exports if new hooks are introduced.
- Ensure `ParamDndProvider` is not rendered outside the param context.

### 9) Clean up shared utilities
- Move section-only helpers out of shared adapter paths used by param drags.
- Keep adapter utilities free of section state unless explicitly section-only.

### 10) Add targeted performance instrumentation
- Add a temporary dev-only counter for collisions per pointer move in each
  provider to validate the expected reduction during section drags.
- Remove instrumentation after validation.

## Testing Plan
- Section DnD:
  - Free-move drag over sections with large param lists
  - Sorting mode reorders within groups and top-level sections
  - Drop type restrictions for non-root parents still enforced
- Param DnD:
  - Drag within pinned and unpinned lists
  - Drag across nested parents
  - Indent/unindent shortcuts unaffected
  - Drag disabled when param filter active or in share mode
- Mixed:
  - Ensure section drag never triggers param collisions
  - Ensure param drag never triggers section overlays or drop-type checks

## Performance Validation
- Use existing profiling tooling to compare:
  - collision count per pointer move (section drag)
  - average drag frame time for sections with 100+ params
- Track before/after on large param projects.
- Confirm that section drag collision counts do not scale with param count.

## Risks and Mitigations
- Nested providers may cause overlapping sensors.
  - Mitigation: gate param sensor activation to param drags so the inner context
    does not capture section drags (per dnd-kit event capture behavior).
- Shared module-level collision state.
  - Mitigation: per-provider collision tracker instances.
- Adapter hooks still reading section state.
  - Mitigation: add param-specific hook variants or context-driven behavior.
- Param provider not wrapping all param droppables.
  - Mitigation: add a dev-only warning if `useParamDndContext()` is null in
    param components.

## Acceptance Criteria
- Section drags never evaluate param droppables or param collision logic.
- Param drags never trigger section drop-type logic or overlays.
- Collision counts for section drags stay flat as param count grows.
- No regressions in section reorder, param reorder, or shortcuts.

## Open Questions
- Best mount point for `ParamDndContext` to minimize registry size without
  breaking overlays?
- Should param DnD use a simplified collision detector tuned for vertical lists?
