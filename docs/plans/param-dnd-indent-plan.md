# Param reorder + indent plan

## Goals
- Make parameter ordering, nesting, and un-nesting feel as fluid as editing a YAML document.
- Support drag-and-drop reordering for single params and multi-selection.
- Add keyboard shortcuts for moving, indenting, and unindenting selected params.
- Keep behavior predictable across pinned/unpinned views and nested params.

## Current state
- Param hierarchy is represented by `BaseParentCodeObjImpl.children` lists (`NestedParam` and callable roots).
- UI renders params via `ParamSwitch`/`ParamContainer` and `GetParamSwitch` in `frontend/src/components/Params/`.
- Selection is stored per section as `selectedParams` and toggled with the param-select shortcut (`SettingsShortcuts.paramSelect`).
- DnD is already wired for sections via the `frontend/src/forks/dnd-kit/` adapter and `GlobalDndContext`.

## UX behavior proposal
- Dragging is only enabled while holding the param-select shortcut.
- While param-select is held, dragging a selected param drags the full selection set for that section (excluding selected descendants).
- While param-select is held, dragging a non-selected param clears selection and drags just that param.
- Drop positions:
  - Vertical move within the same parent reorders siblings.
  - Indent: make dragged items children of the nearest valid nested param (default: previous sibling when using keyboard).
  - Unindent: move dragged items to the parent’s parent, positioned after the old parent.
- Keyboard shortcuts (YAML-like editing):
  - `Tab`: indent selected params (under previous sibling if it is a `NestedParam`).
  - `Shift + Tab`: unindent selected params (to parent’s parent).
  - `Alt + ArrowUp/ArrowDown`: move selection up/down within sibling list.
- Keyboard operations are allowed whenever there is an active selection (param-select shortcut does not need to be held).
- If selection spans multiple parents, operations either:
  - Reject with a brief toast/indicator, or
  - Normalize to the highest common parent and move only root-selected items (preferred).
 - Bonus: while holding a selection-box shortcut, allow drag-lasso selection of multiple params.

## Constraints and edge cases
- Indent only into `NestedParam` or other `BaseParentCodeObjImpl` nodes; avoid implicit conversion unless explicitly decided.
- Avoid reordering while `paramFilter` is active or when params are filtered/hidden (to prevent misleading order changes).
- Preserve pinned state and other param metadata; reordering only changes tree structure.
- Do not allow reparenting into own descendants (prevent cycles).
- If unindent leaves an empty `NestedParam`, decide whether to keep it (safer) or auto-remove (more YAML-like).

## Backend plan
1. Add request types for param movement
   - New request(s) in `backend/setta/project_state/project_manager_types.py`, e.g.:
     - `MoveParamsRequest` (sectionId, paramIds, newParentId, newIndex).
     - `IndentParamsRequest` / `UnindentParamsRequest` (sectionId, paramIds).
2. Implement helper functions
   - In `backend/setta/types/helpers_lvl2.py`, add:
     - `move_params_within_parent(...)`
     - `move_params_to_parent(...)`
     - `indent_params(...)` and `unindent_params(...)`
   - Use `traverse_hierarchy(..., build_parent_map=True)` to compute parent relationships.
   - Validate with type guards (use `get_curr_effective_code_obj_impl_with_type_guard`).
   - Explicitly raise `KeyError`/`TypeError` for invalid parents or missing IDs.
3. Wire into the manager and router
   - Add handlers in `backend/setta/project_state/base_project_manager.py`.
   - Add endpoints in `backend/setta/routers/project_manager.py`.
4. Regenerate endpoints
   - Run `source activate.sh && cd frontend && pnpm generate` after adding routes.

## Frontend plan
1. Param tree helpers
   - Add a selector to build a flattened param list with depth, parent id, and child ordering.
   - Exclude selected descendants from drag selection to avoid double moves.
2. DnD scaffolding
   - Add a param-specific `DragDropProvider` or nested context around param lists to avoid conflicts with section DnD.
   - Only enable param DnD sensors while `isSelectingParams` is true.
   - Add `useSortable` for each param row, disabled unless `isSelectingParams` is true.
   - Track param drag state separately (similar to `useDndState` but scoped to params).
3. DnD reorder + indent
   - For drag end, compute new parent/index from drop target + horizontal offset.
   - Call a new action `moveParamsWithBackend` that updates `codeObjImpl.children` optimistically and sends the backend request.
4. Keyboard shortcuts
    - Extend `SettingsShortcuts` with new param movement shortcuts.
    - In `frontend/src/state/actions/keyActivations.ts`, add handlers gated by:
      - `selectedParams.length > 0`
      - focus outside text inputs.
5. UI feedback
   - Add drop indicators (line + indent guide).
   - Highlight invalid drop targets (non-parent or descendant).
 6. Lasso selection (bonus)
   - Add a lasso mode gated by a shortcut (or reuse param-select + drag on empty space).
   - While active, render a selection box and select params whose bounds intersect the box.

## Suggested data flow for reorder
1. Build a flat list of visible params with `{id, parentId, depth, index}`.
2. On drag:
   - Use the flat order to compute projected depth (dnd-kit tree projection).
   - Resolve new parent based on depth and previous siblings.
3. On drop:
   - Convert the projection into `{newParentId, newIndex}`.
   - Send a backend request; update state optimistically.

## Testing/verification plan
- Manual:
  - Reorder simple sibling params (top-level and nested).
  - Indent/unindent single and multi-select groups.
  - Verify pinned/unpinned views stay consistent after reordering.
  - Ensure drag + keyboard shortcuts work with selection mode on/off.
- Automated:
  - Backend unit tests for `move_params_*` helpers in `tests/` (no mocks).

## Decisions
- Indent auto-converts a non-parent param into `NestedParam`.
- Unindent that leaves an empty `NestedParam` converts it back to `CodeParam` with value `"{}"`.
- Reorder/indent/unindent is disabled while `paramFilter` is active.
- Structural ops (drag, indent, move up/down) require selection within a single parent for now.
- Pinned/unpinned are filtered views of the same tree with shared selection.
- Move/indent operations use visible-sibling semantics (skip hidden siblings).
- Drag uses the visible list to compute insertion, but updates the full `children` list.

## Open questions
- None.

## Suggested default shortcuts
- Indent: `Tab`
- Unindent: `Shift + Tab`
- Move up/down: `Alt + ArrowUp` / `Alt + ArrowDown`
- Lasso selection (bonus): `Alt + Shift` + drag empty space
- Note: keep param-drag gated behind `paramSelect` (existing `Mod + Shift`).
