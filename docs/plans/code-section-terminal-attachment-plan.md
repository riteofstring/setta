# Code Section Terminal Attachment Plan

## Summary
Provide a dedicated terminal for each runnable code section on first run that
feels integrated with the code section (embedded panel, not a separate floating
node). The attachment is stored in project state and reused on subsequent runs.
This plan favors the simplest behavior and keeps future attach/detach flows easy
to add.

## Goals
- First run of a code section creates a dedicated terminal section.
- Subsequent runs use the attached terminal instead of a free/temporary terminal.
- The terminal feels integrated with the code section (embedded, not a separate node).
- Minimal behavioral changes outside of run + layout.

## Simplest Behavior Decisions
- **Placement:** New terminal is embedded in the code section layout (split panel).
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
  - If no attached terminal exists, create a terminal section and call
    `setCodeSectionAttachedTerminal`.
  - Render the attached terminal inside the code section (split panel).
  - Pass `terminalSectionId` into `route_run_code`.
- On drag:
  - No separate terminal node to move; the embedded terminal moves with the code
    section automatically.

## UX Flow
1. User clicks Run on a code section.
2. If no attached terminal exists, a terminal section is created and embedded
   in the code section.
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
- Run a code section and confirm the terminal panel appears inside the section.

## Follow-Up (Future Enhancements)
- Attach/detach actions in section menus.
- Attach existing independent terminal to a code section.
- Optional anchored layout for nested/grouped code sections.
