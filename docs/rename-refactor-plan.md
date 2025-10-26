# Rename Refactor Flow Recovery Plan

## Background
- Rename refactors rely on backend `DependencyGraph.rename_references` to detect changed identifiers and broadcast `{sectionId, paramInfoId, value}` replacements (see `backend/setta/project_state/base_project_manager.py:522`, `backend/setta/code_gen/dependency_graph.py:322`).
- Frontend modal+state plumbing for rename confirmations has drifted, so rename prompts never appear and the app throws when rename messages arrive.
- The `makeReplacements` helper predates the current project-state shape and only performs local mutations, leaving the backend out of sync.

## Current Breakages
- `openRenameReferencesModal` is missing, causing runtime errors the first time we process rename refactor results (`frontend/src/state/actions/referenceRenaming.ts`).
- The modal store does not expose `modalData`, the modal type enum lacks a rename entry, and `ModalContainer` cannot render `RenameReferencesModal`.
- `makeReplacements` fetches variants with the wrong identifier (expects section variants rather than section IDs) and mutates `state.codeInfo`/variant `values` fields that no longer exist.
- `ALWAYS_RENAME` mode silently mutates the frontend store without informing the backend; state divergence occurs after any rename.

## Recovery Steps
1. **Modal Plumbing** ✅
   - `ModalTypeEnum` now includes `RENAME_REFERENCES`, and `ModalDataMap` stores `{ changedValues }`.
   - `ModalContainer` renders `RenameReferencesModal` and the modal consumes data via `useModalData(ModalTypeEnum.RENAME_REFERENCES)`.
   - `openRenameReferencesModal` is restored; it persists `{ changedValues }` and opens the dialog.
2. **State Updates for Replacements**
   - Redesign `makeReplacements` to translate the backend payload into the current project-state schema:
     - Resolve the section variant via `getCurrSectionVariantId(state, sectionId)`.
     - For callable renames (`paramInfoId` null) update `state.sections[sectionId].name` plus any dependent shared modifiers (if needed).
     - For param renames, route through `setCurrEffectiveCodeObjImplValue` with a `dispatchOptimisticProjectStateUpdate` wrapper so we get backend parity.
   - When the rename mode is `ALWAYS_RENAME`, call the rewritten `makeReplacements` immediately from `processRenameRefactorResults`.
3. **Backend Synchronization**
   - Decide whether renames should be applied server-side:
     - **Option A:** Frontend sends `route_set_section_name` / `route_set_code_obj_name` for each change (reuse optimistic pattern).
     - **Option B:** Backend applies replacements to `projectState` directly when mode is `ALWAYS_RENAME` so broadcast snapshots already contain the new names.
   - Update `SettingsState.renameRefactorMode` handling to keep mode changes persisted when users tick “Don’t ask again”.

## Follow-Up Considerations
- Add regression coverage that simulates a rename notification and asserts modal behavior across the three modes.
- Ensure websocket logging (currently `console.log` in `receiveMessage`) is gated or removed once debugging is complete.
- Audit other state helpers for lingering references to the old `variants`/`values` fields to prevent similar drift.
