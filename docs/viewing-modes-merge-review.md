# Viewing Modes Merge Review

## Context

Review notes for merging `viewing-modes` into `main`, focusing on correctness and merge blockers.

## Merge Blockers

1. Selection hide/show only updates local state and never calls the backend.
   - Impact: view-mode visibility changes are not persisted or broadcast and can be
     overwritten by the next project-state update.
   - File: `frontend/src/components/Utils/ContextMenus/SelectionContextMenu.tsx`
   - Suggested fix: add a backend route that can toggle visibility for multiple
     sections, or reuse the existing single-section route per ID and include a
     `frontendOpId` so the optimistic update is reconciled.

2. `getActiveViewModeConfig` throws when `activeViewModeId` is unset.
   - Impact: initial render can crash before state arrives (notably in the default
     store config and the settings project).
   - Files:
     - `frontend/src/state/actions/sectionInfos.ts`
     - `frontend/src/state/definitions.ts`
     - `backend/setta/project_state/settings_project.py`
   - Suggested fix: ensure new projects and the settings project always initialize
     a view mode + active ID, and initialize the frontend default config with a
     placeholder view mode (or guard access until state is loaded).

3. Copying a project config does not remap `viewModes.visibilityBySectionId`.
   - Impact: copied configs lose visibility settings because section IDs change and
     the validator restores missing IDs to visible defaults.
   - File: `backend/setta/types/helpers_lvl3.py`
   - Suggested fix: remap `visibilityBySectionId` when `section_id_map` is present
     inside `copy_project_config`.

## Notes

- Breaking old project files is acceptable per direction; no migration path needed.
