# Show Current Worktree Combobox in Top Right

## Goal
Display the active Setta worktree in a top-right combobox dropdown.

## Scope
- In scope: worktree label display, dropdown trigger, worktree option list, and active state sync.
- Out of scope: creating or deleting worktrees from UI unless already supported.

## Plan
1. Identify source of active worktree state and available worktree options.
2. Add top-right combobox control in header and bind it to active worktree state.
3. Wire selection behavior to existing workspace/worktree switch flow.
4. Handle loading/error/empty states clearly.

## Acceptance Criteria
- Active worktree is visible in top-right combobox.
- Selecting another worktree triggers the correct switch behavior and updates label state.

## Verification
- Add store/unit tests for active worktree state wiring.
- Add Playwright flow for dropdown select and UI update.
- CDP visual check for top-right header layout.
