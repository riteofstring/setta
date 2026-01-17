# dnd-kit adapter vs upstream

Scope: documents what remains in the in-repo adapter under `frontend/src/forks/dnd-kit/adapter` and what is now provided by the upstream `@dnd-kit/*` packages. Focus is on functional responsibilities, not formatting or import churn.

## Adapter responsibilities (in repo)

- Provider/monitor mapping: wraps `@dnd-kit/react` so app callbacks keep the current event payload shape (`active`, `over`, `collisions`, `delta`). `frontend/src/forks/dnd-kit/adapter/DragDropProvider.tsx` `frontend/src/forks/dnd-kit/adapter/useDndMonitor.ts`
- Custom collisions + hysteresis: section-aware collision scoring, `pastHalfway`, `triggerDistCondition`, and hysteresis state. `frontend/src/forks/dnd-kit/adapter/collision.ts`
- Sorting logic: `pastHalfway`-driven strategies, index math, and helper utilities. `frontend/src/forks/dnd-kit/adapter/sorting.ts`
- Sortable wiring: adapter context and hook that mirror the app-facing return shape. `frontend/src/forks/dnd-kit/adapter/SortableContext.tsx` `frontend/src/forks/dnd-kit/adapter/useSortable.ts`
- Zoom helpers: transform utilities that apply React Flow zoom compensation. `frontend/src/forks/dnd-kit/adapter/zoom.ts`

## Upstream responsibilities (packages)

- Drag/drop manager, sensors, plugins, collision observer, registry, and overlays. `@dnd-kit/react` and `@dnd-kit/dom`
- Geometry utilities and shared types. `@dnd-kit/geometry`, `@dnd-kit/abstract`
- Sortable entities and keyboard plugin behavior. `@dnd-kit/dom/sortable`

## App-specific DnD layer (still in repo)

- App state for drag modes, temp placeholders, and disabled flags. `frontend/src/forks/dnd-kit/dndState.ts`
- Temporary parent/child tracking during drags. `frontend/src/forks/dnd-kit/dndChildren.ts`
- Drop validation, reparenting, and backend move integration. `frontend/src/forks/dnd-kit/useDropType.ts` `frontend/src/forks/dnd-kit/useMoveSection.ts`
- Global wiring for sensors/modifiers/overlay. `frontend/src/forks/dnd-kit/GlobalDndContext.tsx` `frontend/src/forks/dnd-kit/DummySection.tsx`

## Status summary

- The in-repo fork (`CustomCore`, `CustomSortable`) is removed.
- Only the thin adapter and Setta-specific behavior remain in the repo.
- Legacy `@dnd-kit/*` packages are no longer used in app code.
