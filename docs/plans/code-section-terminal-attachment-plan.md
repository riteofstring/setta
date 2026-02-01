# Code Section Terminal Attachment Plan

## Summary
Provide a dedicated terminal section for each runnable code section on first run.
The attached terminal is placed next to the code section, stored in project state,
and reused on subsequent runs. This plan favors the simplest behavior and keeps
future attach/detach flows easy to add.

## Goals
- First run of a code section creates a dedicated terminal section.
- Subsequent runs use the attached terminal instead of a free/temporary terminal.
- The terminal appears physically attached (adjacent) to the code section.
- Minimal behavioral changes outside of run + layout.

## Simplest Behavior Decisions
- **Placement:** New terminal appears to the right of the code section (fixed offset).
- **Scope:** Attach only for `Code` sections (manual code blocks).
- **Lifecycle:** No auto-detach on delete. If the terminal is deleted, we recreate on next run.
- **Movement:** If a top-level code section is dragged, its attached terminal moves by
  the same delta. Nested/group movement is not handled yet.

## Data Model
- Add `attachedTerminalSectionId: ID | None` to `BaseCodeSectionImpl` so the mapping
  persists in the project state.
- On copy/paste, if the attached terminal is included in the copy, remap the ID;
  otherwise clear the attachment.

## Backend Changes
- `RunCodeRequest` accepts optional `terminalSectionId`.
- `run_command` uses the provided terminal ID (create PTY if missing) instead of
  a free terminal.
- New endpoint `setCodeSectionAttachedTerminal` updates the attachment on the
  code section (with type guard enforcement and terminal validation).

## Frontend Changes
- On run:
  - Resolve the runnable code section (selected or entry).
  - If no attached terminal exists, create a terminal section at an adjacent
    position and call `setCodeSectionAttachedTerminal`.
  - Pass `terminalSectionId` into `route_run_code`.
- On drag:
  - When a top-level code section moves, move its attached terminal by the same
    delta to preserve the adjacency.

## UX Flow
1. User clicks Run on a code section.
2. If no attached terminal exists, a terminal section is created to the right
   of the code section.
3. The run executes in that terminal; subsequent runs reuse it.

## Edge Cases
- If the attached terminal is deleted, the next run recreates and reattaches.
- If a code section is deleted, the terminal remains as an independent section.
- If placement info is unavailable, fall back to default empty-space placement.

## Testing Plan
- Backend unit tests:
  - Setting and clearing the attached terminal updates project state.
  - Invalid terminal IDs raise KeyError.
- Manual verification:
  - Run a code section with no attached terminal.
  - Confirm terminal appears adjacent and future runs reuse it.
  - Drag the code section and confirm the terminal follows.

## Follow-Up (Future Enhancements)
- Attach/detach actions in section menus.
- Attach existing independent terminal to a code section.
- Optional anchored layout for nested/grouped code sections.
