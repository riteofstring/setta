# Dynamic Viewing Modes Plan

## Current state (investigation)
- `backend/setta/types/project_config.py` defines `ViewingEditingMode` with `DEV`, `USER`, and `USER_EDIT`, stored on `ProjectConfig.viewingEditingMode`.
- `backend/setta/types/section_impls.py` defines `Visibility` with `DEV` and `USER` booleans.
- Frontend rendering/editing behavior hinges on those enums:
  - `frontend/src/state/actions/sectionInfos.ts` maps `USER_EDIT` -> `USER` visibility and renders hidden sections with opacity.
  - `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx` hardcodes the three buttons.
  - `frontend/src/components/Section/Container/*`, `frontend/src/components/Section/Header/*`, and `frontend/src/components/Utils/ContextMenus/SelectionContextMenu.tsx` gate UI controls based on `USER` vs `USER_EDIT`.
  - `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx` and `frontend/src/components/Panes/Overview/RunInstructions.tsx` filter lists using `viewingEditingMode` as a visibility key.

## Goal
Allow arbitrary, developer-defined view modes per project, each with its own visibility map, and a way to edit each view without hardcoded `DEV/USER/USER_EDIT`.

## Proposed data model
- Replace the enum with a configurable view mode list:
  - Add `ViewModeConfig` (new model in `backend/setta/types/project_config.py`) with fields like `id`, `name`, a flag describing whether the mode is user-facing, and `visibilityBySectionId: dict[ID, bool]`.
  - Add `viewModes: dict[ID, ViewModeConfig]` and `activeViewModeId: ID` to `ProjectConfig`.
  - Add `isEditingViewMode: bool` (or `editingViewModeId: ID | None`) to describe whether the active view is being edited.
- Keep visibility owned by each view mode:
  - Use `visibilityBySectionId` on `ViewModeConfig` instead of `Visibility` on each section impl.
  - Provide helpers to keep the visibility map complete (every view has every section id) when creating/deleting sections or view modes.

## Behavior changes
- Rendering:
  - When `isEditingViewMode` is `true`, render all sections and show hidden ones with opacity (current `USER_EDIT` behavior).
  - When `isEditingViewMode` is `false`, render only sections visible in `viewModes[activeViewModeId].visibilityBySectionId`.
- Editing:
  - Visibility toggles update `viewModes[activeViewModeId].visibilityBySectionId`.
  - UI controls (delete, move, minimize, lock) are hidden when in a user-facing mode with `isEditingViewMode === false`.

## UI/UX changes
- Replace `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx` with a view modes manager:
  - List view modes and allow selection.
  - Toggle Edit/Preview for the active view.
  - Create/duplicate/rename/delete view modes.
  - (Optional) allow marking a mode as user-facing vs dev-facing for control gating.

## Backend + generated types updates
- Update:
  - `backend/setta/types/project_config.py` (add `ViewModeConfig`, update `ProjectConfig` fields).
  - `backend/setta/types/section_impls.py` (change visibility type).
  - `backend/setta/project_state/project_state_summary_types.py` (visibility type change).
- Regenerate frontend types with `source activate.sh && cd frontend && pnpm generate`.
- Update all frontend uses of `ViewingEditingMode` and `ViewingEditingModeEnum`.

## Migration
- No migration needed. Require projects to be re-saved under the new schema.

## Implementation steps
1. [x] Backend schema: introduce `ViewModeConfig`, `ProjectConfig.viewModes/activeViewModeId/isEditingViewMode`, and move visibility to per-view map.
2. [x] Add a validator/helper to populate missing visibility entries for all sections whenever view modes change.
3. [x] Regenerate types (`pnpm generate` after `source activate.sh`).
4. [x] Replace `viewingEditingMode` logic in `frontend/src/state/actions/sectionInfos.ts` and subscriptions with `activeViewModeId` + `isEditingViewMode`.
5. [x] Update components/menus that assume `USER` or `USER_EDIT` (`ViewingEditingMode`, `SelectionContextMenu`, `DeleteOrHideButton`, container wrappers, overview lists).
6. [~] Implement a view mode manager UI for create/rename/delete and preview/edit toggles. (Done: list/select, edit/preview toggle, create, user-facing toggle; TODO: rename/duplicate/delete.)
7. [ ] Validate manually: create multiple view modes, toggle visibility, switch preview/edit, confirm controls and rendering match expectations.

## Frontend initialization
- Added a frontend guard to ensure `viewModes` + `activeViewModeId` are initialized for fresh configs (prevents "Active view mode is not set" when starting from blank state).
