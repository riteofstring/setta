# Code Section Embedded Terminal as True Child Container Plan

## Goal
Make the attached terminal a real child section container (like Group/ListRoot
children) while preserving the current embedded styling and layout. DnD should
work identically to other child sections (no special drag handle), and the code
editor must remain readable when the terminal is attached.

## Success Criteria
- Terminal appears under `children` for the code section and is not a top‑level
  section when attached.
- Terminal renders with the existing embedded styling (no header/frame/resizers,
  same padding/border/background as today).
- DnD detach/attach works like other child sections (no special handle).
- Code editor stays visible and keeps a reasonable height when terminal is shown.
- Playwright tests cover attach/reuse, code visibility, and DnD detach.
- CDP visual verification confirms no UI regressions.

## Non‑Goals
- Changing terminal behavior, commands, or backend execution flow.
- Introducing new section types or alternate terminal UI.

## Current State (Problem Summary)
- Code sections bypass the standard child container pipeline (`ManyNestedSections`)
  and instead embed the terminal directly inside `CodeArea`.
- The embedded terminal doesn’t get the standard section container/drag surface,
  so DnD activation is intercepted by the parent section.

## Proposed Approach
### 1) Backend State Consistency (no model changes)
- Keep the existing child relationship (`children` + `attachedTerminalSectionId`).
- Ensure attach/detach operations always update `children`, `attachedTerminalSectionId`,
  and parent mappings, and log the transitions.
- When attaching, enforce a minimum size so code+terminal are both visible.
  (Backend size bump + frontend min-height logic.)

### 2) Introduce an Embedded Render Mode for Child Containers
- Add a `renderMode` (or similar) prop to section containers:
  - `default`: current behavior.
  - `embedded`: suppress header, frame, resize handles, and outer outline.
- For `embedded` terminal:
  - Render `EmbeddedTerminalArea` inside the container (same as today).
  - Keep `data-attached-terminal-section-id` for selectors/tests.
  - Preserve existing styling (border, padding, background).
- Ensure `useSectionRefAndInit` still registers refs so DnD has correct rects.

### 3) Render Code Children via Standard Sortable Containers
- Replace the custom `EmbeddedTerminalSortable` in `CodeArea` with a reusable
  `EmbeddedSortableSectionContainer` (wrapper around `SortableSectionContainer`)
  that passes `renderMode="embedded"` to `SectionContainer`.
- Maintain `DNDSortable` and child ordering so DnD logic is unchanged.
- Keep `attachedTerminalSectionId` fallback only as a temporary guard if `children`
  hasn’t arrived yet, but prefer `children` for rendering.

### 4) Layout + Sizing
- Keep the existing flex split between code editor and terminal.
- Ensure min-height logic accounts for code+terminal so the editor doesn’t collapse.
  - Backend: bump section height on attach if height is below the combined minimum.
  - Frontend: enforce min-height in `useSectionMinMaxDims` for code sections with
    an embedded terminal.
- Make sure the embedded terminal container remains `min-h-0` and `flex-1` to avoid
  overflow issues.

### 5) DnD Behavior
- Once terminal renders as a true child container, remove any pointer‑event or
  activation hacks specific to embedded terminals.
- Confirm DnD behavior matches Group/ListRoot (same drag activation path).

### 6) Logging (per request, not gated)
- Keep existing frontend logs for attach and DnD.
- Add explicit logs when:
  - Embedded render mode is used.
  - Terminal is attached/detached.
  - Embedded terminal size adjustments occur (backend + frontend).

## Testing Plan
### Playwright (write tests first, confirm failing, then implement)
1. Attach + reuse:
   - Run a code section twice; assert the same terminal ID is reused.
   - Verify terminal is not top‑level and is listed in `children`.
2. Embedded layout:
   - Verify code editor height remains > terminal height and above a threshold.
3. DnD detach:
   - Drag terminal out; assert it becomes a top‑level section and is removed from
     the code section `children`.

### Backend Tests
- Extend existing `tests/project_state/test_code_section_attached_terminal.py`
  to assert size bump/min-height logic and correct parent mapping after attach/detach.

## CDP Visual Verification
- Verify code section styling stays unchanged with embedded terminal.
- Verify terminal still matches the current embedded look.
- Verify DnD attach/detach visually behaves like Group/ListRoot children.

## Risks / Mitigations
- **Risk:** embedded render mode accidentally hides UI in other contexts.
  - **Mitigation:** gate by explicit `renderMode="embedded"` and section type.
- **Risk:** layout regressions for code sections without terminals.
  - **Mitigation:** keep existing code area layout for no‑child case; add tests.
- **Risk:** DnD rect calculations wrong if ref setup changes.
  - **Mitigation:** keep `useSectionRefAndInit` for embedded containers; add logs.

## Implementation Steps (Sequence)
1. Add Playwright tests (failing) for embedded child container DnD + layout.
2. Add embedded render mode to section containers.
3. Replace CodeArea embedded terminal rendering with embedded child container.
4. Update min-height/size logic to prevent squashing.
5. Update backend attach/detach logs + size bump.
6. Re‑run tests and CDP visual verification.
