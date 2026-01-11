# dnd-kit deeper alignment plan (short)

## Goal
Align Setta's DnD adapter with the new dnd-kit APIs and built-in sortable flow while preserving all current behaviors.

## Principles
- Keep all current DnD features and UX behavior.
- Prefer upstream dnd-kit mechanisms over custom code.
- Use dnd-kit-provided geometry/state; avoid `getBoundingClientRect` unless dnd-kit does not expose needed data.

## Scope
- Sorting path: integrate upstream sortable (`@dnd-kit/dom/sortable`) where possible.
- Collision + geometry: rely on `dragOperation.shape`, droppable shapes, and modifiers.
- Keep Setta-specific rules: temp placeholder IDs, `pastHalfway`, hysteresis, free-move vs sort, zoom compensation.

## Reference paths
- New dnd-kit code: `/Users/kevin/Documents/AppDevelopment/dnd-kit-new`
  - Sortable: `packages/dom/src/sortable/`
  - Feedback: `packages/dom/src/core/plugins/feedback/`
  - Sensors: `packages/dom/src/core/sensors/`
  - React wrappers: `packages/react/src/`
- Current adapter: `frontend/src/forks/dnd-kit/adapter/`

## Phases
1. Audit + mapping
   - Map current custom sorting/collision pieces to upstream equivalents.
   - Identify what can be replaced by `Sortable`, `OptimisticSortingPlugin`, or modifiers.
2. Upstream sortable integration
   - Prototype adapter wrapper around `@dnd-kit/dom/sortable` or `@dnd-kit/react/sortable`.
   - Decide whether to keep or disable `OptimisticSortingPlugin` based on Setta reorder rules.
3. Geometry + modifiers cleanup
   - Remove manual rect math where dnd-kit already supplies shapes.
   - Keep fallback DOM measurements only when required.
4. Validation
   - Sorting reorder stability (top to bottom) and no clumping.
   - Free-move behavior, temp placeholder flow, zoom correctness.

## Done when
- Sorting and free-move behave identically to current Setta behavior.
- Adapter is primarily built on new dnd-kit APIs with minimal legacy code.
- DOM measurements are only used as fallbacks, not the primary source of geometry.
