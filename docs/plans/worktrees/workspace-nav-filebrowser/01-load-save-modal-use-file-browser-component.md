# Load/Save Modal Uses File Browser Component

## Goal
Unify load/save flows by reusing the existing file explorer/browser section component inside the modal.

## Scope
- In scope: load modal, save-as modal, shared file browser component integration.
- Out of scope: backend filesystem API redesign.

## Plan
1. Audit current load/save modal implementations and extract duplicate file-navigation UI.
2. Embed or compose the file browser section component for both flows.
3. Map modal-specific actions (load, save-as, overwrite prompts) onto shared browser events.
4. Validate path navigation, filtering, and selection consistency.

## Acceptance Criteria
- Load and save-as modals render the shared file browser UI.
- File navigation behavior is consistent across both modals.

## Verification
- Add/update Vitest coverage for modal-browser integration.
- Add Playwright E2E for load and save-as path selection.
- CDP visual check on both modals.
