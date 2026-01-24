# Section Multi-Select DnD (Sorting + Free-Move) Plan

## Goal
Enable multi-select drag for sections in both sorting mode and free-moving mode, with a full batch backend endpoint to apply grouped section moves atomically and with clean history entries.

## Current Behavior Summary
- Sections support multi-selection (activeIds) and multi-drag in React Flow free-move, but DnD sorting/free-move in the forked dnd-kit only handles a single active section.
- Param DnD supports multi-selection via a single placeholder and grouped move request (move_param_groups).
- Section DnD uses a temp placeholder for a single active section in sorting and free-move modes.

## Desired Behavior
- When multiple sections are selected, dragging any selected section moves the entire selection as a group.
- Sorting mode: reorder selected siblings as a contiguous group within the parent container, preserving their relative order.
- Free-moving mode:
  - Drop onto another parent list: insert the group at the computed index as a contiguous block, preserving order.
  - Drop onto the pane (top-level): move every selected top-level section to new positions using drag delta from each section’s drag-start rect.
- If selected sections are not neighbors, they become neighbors after the group drop (same behavior as param DnD).
- If selection spans multiple parents, block group drag (or reduce to single active) with a notification, matching param DnD behavior.
- If selection contains ancestor + descendant pairs, collapse to root selections so each section moves at most once.

## Implementation Plan

### 1) Define selection + drag group utilities (frontend)
- Create a helper to resolve “root selected sections” and validate same-parent constraint.
  - Inputs: activeIds, parentSectionMap, optional root filtering.
  - Output: ordered list of selected ids with descendants removed.
- Add helper to order selected ids by parent children ordering.
- Location suggestion:
  - `frontend/src/state/actions/sections/moveSections.ts` or a new helper under `frontend/src/state/actions/sections/`.

### 2) Extend section DnD state for group drags
- Update `frontend/src/forks/dnd-kit/dndState.ts`:
  - Add `draggingIds: string[]`.
  - Add `draggingRectsById?: Record<string, {left, top, right, bottom, width, height}>` for free-move positioning.
- Set these in `frontend/src/forks/dnd-kit/useDropType.ts` `onDragStart`:
  - If the active section is part of the current activeIds, compute root selection set.
  - Enforce same-parent constraint for any list drop (sorting and free-move list drops); if violated, fall back to `[active.id]` and raise a notification.
  - Capture initial bounding rects for each dragging section from `manager.registry.droppables` (or section refs) for free-move delta.
- Clear group data on drag end/cancel.

### 3) Add group placeholder behavior (dndChildren)
- Add a helper in `frontend/src/forks/dnd-kit/dndChildren.ts`:
  - `replaceDndSectionsWithTemp(activeId: string, sectionIds: string[])` mirroring `replaceParamsWithTemp`.
  - Replace all dragging ids under the same parent with a single temp id (`getDndSectionId(activeId)`).
  - Ensure stale temp ids are cleared.
- Call this in `useDropType.ts` when starting a drag in sorting or free-move modes.

### 4) Update collision logic to ignore selected siblings
- Update `frontend/src/forks/dnd-kit/adapter/collision.ts`:
  - When active drag type is “section”, ignore droppables that are part of `draggingIds` (except the temp id).
  - Prevent overId resolving to another selected section.

### 5) Sorting mode group reorder (frontend)
- Update `frontend/src/forks/dnd-kit/useMoveSection.ts` `onSortEnd`:
  - Replace single `activeId` logic with `draggingIds`.
  - Compute new index using the temp placeholder position (or via collisions + `sortingOverState`).
  - Remove selected ids from current child list, then insert the ordered selected list at the computed index (contiguous block).
  - Send a batch move request (see backend section).

### 6) Free-move mode group drop (frontend)
- Update `frontend/src/forks/dnd-kit/useMoveSection.ts` `onFreeMoveEnd`:
  - If dropping into a parent list: compute insertion index and move group as contiguous block (same logic as sorting mode).
  - If dropping onto pane: compute new positions for each selected section using drag delta + stored rects, then send a batch move with `position` for each section.
  - Preserve z-order for moved top-level sections (reuse existing zIndex, or re-apply `setZIndices` after the batch move). Ensure layout persistence via `route_set_top_level_section_layout`.
  - If selection spans multiple parents and we decide to block: degrade to single active section.

### 7) Backend batch endpoint
- Add new route + request type with explicit contiguous-block semantics:
  - `MoveSectionsRequest` with `projectConfigId`, `sectionIds: string[]`, `newParentId`, `newIndex`, and optional `positionsById` (for pane drops).
  - Semantics:
    - If `newParentId` is not null: remove all `sectionIds` first, then insert the ordered list at `newIndex` as a contiguous block.
    - If `newParentId` is null: ignore `newIndex` and apply `positionsById` for each section.
- Implement handler in `backend/setta/project_state/base_project_manager.py`:
  - Apply all moves to a copy of the project state (like `move_param_groups`) using the block-insert semantics above.
  - Use a single history entry for the entire group move.
- Add route in `backend/setta/routers/sections.py` and entry in `backend/setta/types/routes.py`.
- Run `pnpm generate` after `source activate.sh` to update `frontend/src/utils/generatedEndpoints.ts` and generated types.

### 8) Frontend action for batch moves
- Add `moveSectionsWithBackend` to `frontend/src/state/actions/sections/moveSections.ts`:
  - Use optimistic updates via existing `moveSections` helper with block-insert semantics (remove + insert ordered group).
  - Send a single backend request with `sectionIds`, `newParentId`, `newIndex`, and optional `positionsById`.
- Update DnD drop handlers to use the batch action for group moves.

### 9) UX + edge cases
- Notifications:
  - "Section selection spans multiple parents." when group drag is invalid.
  - Optional: "Nested selection collapsed to parents." if ancestors are removed from selection.
- Disable multi-selection moves in share mode (consistent with other actions).
- Ensure temp placeholders don’t appear for empty selection.
- Policy consistency with param DnD:
  - Multi-parent selection: fall back to dragging only the active section.
    - Example: select child A in Group G1 and child B in Group G2, then drag A → only A moves; show the multi-parent notification.
  - Ancestor + descendant selection: drop descendants from the drag group.
    - Example: select Group G and child C, then drag C → only G moves (C follows as its child); optional nested-selection notification.

### 10) Tests + verification
- Manual verification steps:
  - Select 2+ sibling sections and sort within parent (vertical + horizontal orientations).
  - Free-move selected top-level sections on the canvas; verify relative positioning and layout persistence.
  - Move selected sections into a different parent; verify order and hierarchy.
  - Ensure invalid multi-parent selection triggers notification and falls back to single drag.
- Backend tests (if adding): unit test for batch move order + parent changes under `tests/project_state/`.

## Files Likely Touched
- Frontend
  - `frontend/src/forks/dnd-kit/dndState.ts`
  - `frontend/src/forks/dnd-kit/useDropType.ts`
  - `frontend/src/forks/dnd-kit/useMoveSection.ts`
  - `frontend/src/forks/dnd-kit/dndChildren.ts`
  - `frontend/src/forks/dnd-kit/adapter/collision.ts`
  - `frontend/src/state/actions/sections/moveSections.ts`
  - `frontend/src/state/actions/notifications.ts` (if new notification strings)
  - `frontend/src/utils/generatedEndpoints.ts` (generated)
  - `frontend/src/utils/generatedTypes.ts` (generated)
- Backend
  - `backend/setta/routers/sections.py`
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/types/routes.py`
  - `backend/setta/types/` request model file (or where section request types are defined)

## Commands
- Activate environment before python or generate:
  - `source activate.sh && cd frontend && pnpm generate`
- If tests are added:
  - `source activate.sh && python -m unittest discover`
