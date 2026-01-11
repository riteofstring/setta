# XYFlow Edge Reintroduction Plan

## Goals

- Persist edges in backend project state and sync to the frontend via generated types.
- Support interactive edge creation + reconnection with visible handles.
- Attach edges to explicit ports (not just node centers), including nested sections.
- Keep alignment with the existing “edge ports” UX (inputs/outputs in section UI).
- No backward compatibility requirements.

## Non-goals (for now)

- Auto-layout or automatic edge routing beyond basic edge types.
- Complex edge validation rules beyond connection-mode + port type checks.
- Frontend test suite additions (no Vitest currently).

## Current State Summary

- Forked xyflow removed edges entirely (`frontend/src/forks/xyflow` only renders nodes).
- Node layout is driven by `projectConfig.topLevelSections` and `useNodeInternals`.
- Nested sections are rendered in DOM, not in the xyflow node layer.
- There is an existing plan for edge ports UI in `docs/plans/edge-ports-plan.md`.

## Reference Implementation (Original Repo)

- Repo root: `/Users/kevin/Documents/AppDevelopment/xyflow-11.11.4`
- Edge rendering: `packages/core/src/container/EdgeRenderer`
- Edge components: `packages/core/src/components/Edges`
- Handle logic: `packages/core/src/components/Handle`
- Connection line: `packages/core/src/components/ConnectionLine`

## Data Model + Persistence

### Edge model (backend)

- Add a dedicated edge model to backend types and store it in `ProjectConfig` so it is per-config:
  - `Edge` fields: `id`, `sourceSectionId`, `sourceVariantId`, `sourcePortId`,
    `targetSectionId`, `targetVariantId`, `targetPortId`,
    `type`, `label`, `style`, `animated`, `hidden`, `zIndex`, `data` (optional).
  - Avoid Pydantic aliases; use explicit snake_case or camelCase consistently.
- Add `edges: list[Edge] = []` to `ProjectConfig` in `backend/setta/types/project_config.py`.
- Add a port descriptor model if we need stable output IDs (see “Ports” below).

### Ports (inputs/outputs)

- Extend `BaseSectionWithParamsImpl` to carry port configuration (per `edge-ports-plan.md`):
  - `edgeInputParams`: list of param IDs.
  - `edgeOutputAccessors`: list of accessor strings.
- Use stable UUIDs for output ports:
  - `edgeOutputPorts: list[{ id, accessor, side? }]`
  - Edges reference `sourcePortId` / `targetPortId` UUIDs (no accessor identity).

### Variant scoping rules

- Edges are variant-scoped:
  - Render edge only when `projectConfig.sectionVariantMap[sectionId]` matches the edge’s
    `sourceVariantId` and `targetVariantId`.
- When a new variant is created/duplicated, copy edges that reference the source variant:
  - Replace `sourceVariantId` or `targetVariantId` if the edge’s endpoint matches the source.
  - Keep port UUIDs if the new variant reuses the same ports; otherwise the edge is pruned.
- When a variant is deleted, delete all edges that reference that variant.

### Cleanup + consistency rules

- When a section is deleted, remove any edges referencing that section.
- When a port is removed (param unmarked as input, output accessor deleted), remove edges
  that reference that port.
- Use explicit KeyError checks (no `.get`) when pruning so missing IDs are surfaced.

## Backend Endpoints

- Add CRUD endpoints for edges (exact names mirrored frontend → backend):
  - `create_edge`, `delete_edges`, `update_edge`, `reconnect_edge`, `set_edges` (bulk replace).
- Add endpoints for port configuration (already planned in `edge-ports-plan.md`):
  - `set_section_edge_inputs`, `set_section_edge_outputs` (or `set_section_edge_ports` if
    we switch to stable IDs).
- Update:
  - `backend/setta/project_state/project_manager_types.py`
  - `backend/setta/types/routes.py`
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/types/helpers_lvl2.py`
- Regenerate types: `source activate.sh && cd frontend && pnpm generate`.

## Frontend State + Types

- Add edge types in `frontend/src/forks/xyflow/core/types/edges.ts` (avoid name collision
  with `Position` from generated types; use `HandlePosition`).
- Extend `useProjectState` to include `projectConfig.edges` from generated types.
- Add an edge handle registry store:
  - Map of `{ sectionId, portId, type, side, element }`
  - Derived map of flow coordinates `{ sectionId, portId, type, x, y }`.
- Extend `useReactFlow` store with connection-related state:
  - `connectionStartHandle`, `connectionEndHandle`, `connectionPosition`,
    `connectionStatus`, `connectionMode`, `autoPanOnConnect`, `connectionRadius`.

## Port UI + Handle Rendering

- Implement the “edges strip” from `edge-ports-plan.md` and render handles inside it:
  - Input ports render a target handle on the left side.
  - Output ports render a source handle on the right side.
  - Provide `data-nodeid`, `data-handleid`, `data-handlepos` attrs for connection logic.
- Add a `NodeIdContext` (like xyflow) and wrap each `SectionContainer` so handles
  know their `sectionId`.
- Ensure handles exist for nested sections as well (nested containers still receive the
  `NodeIdContext`).

## Edge Rendering Layer

- Port the minimal edge components from xyflow:
  - `BaseEdge`, `BezierEdge`, `StraightEdge`, `EdgeText`, `wrapEdge`, `EdgeAnchor`.
- Implement a forked `EdgeRenderer` in `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`:
  - Read edges from `useProjectState`.
  - Resolve handle positions from the handle registry.
  - Render edges inside the viewport before nodes.
  - Skip edges when either handle is missing or section/port is hidden.
- Add `ConnectionLine` rendering during active connect/reconnect.

## Interaction Logic (Connect + Reconnect)

- Port `Handle` + `handlePointerDown` logic from xyflow, adapted to our store:
  - Replace `getNodes()` dependency with a handle-lookup built from the registry.
  - Use `screenToFlowPosition` to compute handle coordinates.
  - Keep connection-mode validation (strict vs loose).
- Implement `onConnect` to:
  - Validate source/target port types.
  - Call backend `create_edge` with source/target section + port IDs.
- Implement reconnect by dragging edge anchors:
  - Update edge endpoint via backend `reconnect_edge`.
  - Update frontend state on response.

## Nested Sections Support

- Derive handle positions from DOM for *all* sections using `useSectionRefs`:
  - Use `withNested` refs for nested sections.
  - Convert handle center via `screenToFlowPosition`.
- Update positions on layout changes:
  - `ResizeObserver` on handle elements or sections.
  - Trigger a render tick in edge store when positions change.

## Deletion + Selection

- Add edge selection state (in edge model) and visual styling.
- Support delete key to remove selected edges (respect share policy).
- Add context menu support for edge delete if needed.

## Migration Notes (No Backward Compatibility)

- No data migration from old configs.
- Default empty edges in `ProjectConfig` and ports in impls.
- Remove edges automatically when endpoints are missing.

## Verification Checklist

- Create edge between two top-level sections → persists, reloads, renders.
- Create edge to nested section → persists, renders, updates on layout changes.
- Reconnect edge from one port to another → persists, redraws.
- Remove port or section → edges referencing it are removed.
- Share mode forbids edge changes (gated by share capabilities).

## Implementation Checklist (Backend → Frontend)

### Backend

1. Add edge + port models.
   - `backend/setta/types/project_config.py`: add `edges: list[Edge]`.
   - `backend/setta/types/section_impls.py`: add `edgeInputParams` + `edgeOutputPorts`.
   - New `Edge` + `EdgePort` models (UUID ids, no aliases).
2. Variant lifecycle rules.
   - `backend/setta/types/helpers_lvl2.py`: when creating/duplicating variants, copy
     edges that reference the source variant and retarget `sourceVariantId`/`targetVariantId`.
   - `backend/setta/types/helpers_lvl2.py`: when deleting a variant, delete edges
     that reference that variant.
3. Edge cleanup rules.
   - When removing a section: delete all edges that reference the section.
   - When removing ports: delete all edges that reference the port UUID.
4. Add endpoints.
   - `backend/setta/project_state/project_manager_types.py`: request/response models.
   - `backend/setta/types/routes.py`: route registrations.
   - `backend/setta/routers/project_manager.py`: handlers.
   - `backend/setta/project_state/base_project_manager.py`: mutation logic.
5. Regenerate frontend types.
   - `source activate.sh && cd frontend && pnpm generate`

### Frontend

6. Wire generated types into state.
   - `frontend/src/state/definitions.ts`: ensure `ProjectStateSingleConfig` includes
     `projectConfig.edges` + port data.
   - Avoid editing generated types directly.
7. Add edge/port registries.
   - New edge store (if needed) or derive from `useProjectState`.
   - Handle registry to map `{ sectionId, portId } -> handle DOM + flow coords`.
8. Port UI + handles.
   - Implement edges strip from `docs/plans/edge-ports-plan.md`.
   - Render handles for input/output ports with UUID `data-handleid`.
   - Wrap section containers with `NodeIdContext` (sectionId).
9. Edge rendering.
   - Add `EdgeRenderer` to `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`.
   - Port minimal edge components from xyflow (Bezier/Straight/Base/EdgeText).
   - Use handle registry for endpoint positions; skip edges missing ports/variants.
10. Interaction + reconnection.
    - Port handle pointer logic (connect + reconnect) adapted to handle registry.
    - Call generated endpoints to create/update/reconnect edges.
11. Selection + deletion.
    - Track edge selection state and remove with delete shortcut.
    - Respect share policy flags.
12. Nested sections.
    - Ensure handles inside nested sections register and compute positions via
      `screenToFlowPosition`.
    - Update positions on resize/layout change (ResizeObserver or layout tick).

## Open Decisions

- Edge validation rules beyond strict/loose mode (if any).
