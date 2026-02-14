# Load/Save Modal Uses File Manager Component

## Goal
Unify load/save flows by reusing the shared file browser component inside the modal.

## Scope
- In scope: load modal, save-as modal, and integration with the shared browser component API/events.
- Out of scope: backend filesystem API redesign.

## Plan
1. Audit current load/save modal file navigation and identify duplicated behavior.
2. Replace modal-specific explorers with the shared file browser component composition.
3. Map modal actions (load/save/overwrite) to shared browser selection/navigation events.
4. Preserve expected modal-specific affordances (double-click open, filename field, validation).

## Acceptance Criteria
- Load and save-as modals render the shared file browser UI.
- File navigation and selection behavior are consistent across both modals.

## Verification
- Add/update Vitest coverage for modal-browser integration.
- Add Playwright E2E for load and save-as path selection flows.
- CDP visual check on both modals.
