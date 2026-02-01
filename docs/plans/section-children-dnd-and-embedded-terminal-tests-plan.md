# Plan: Section Children DnD + Embedded Terminal Run Routing Tests

## Goal
Add Playwright coverage to ensure:
1) Group section children can be moved within, into, and out of the Group.
2) List Root section children can be moved within, into, and out of the List Root.
3) An embedded terminal only receives Run output from its owning Code section.
4) (Bonus) DnD placeholder size for Terminal-over-Code hover is correct.

## Non‑Goals
- No production logic changes unless required to make the tests deterministic.
- No changes to backend behaviors beyond any needed instrumentation for tests.

## Proposed Test Locations
- New spec: `frontend/tests/e2e/section-children-dnd.spec.ts`
  - Group and List Root tests live here.
- Extend `frontend/tests/e2e/code-section-terminal-attachment.spec.ts`
  - Add the run‑routing test (embedded terminal isolation).
- Optional: add a new test in the same spec for DnD placeholder sizing if stable.

## Test Strategy
### 1) Group children DnD
**Setup**
- Create a project config.
- Create a Group section (top‑level).
- Create two simple children sections (e.g., Text or Code) and one external section.

**Actions**
- Move a child into the Group.
- Reorder children within Group.
- Move a child out of the Group to top‑level.

**Assertions**
- `parentSectionMap` and Group `children` order reflect the moves.
- Section layout updates (top‑level layout contains the moved‑out child).

**Implementation Notes**
- Prefer calling the same front‑end action DnD uses (`moveSectionsWithBackend`) in `page.evaluate` for determinism.
- Use `loadProjectConfig` via `/loadProjectConfig` to assert children order and parent map after each step.

### 2) List Root children DnD
**Setup**
- Create a List Root section (top‑level).
- Create two children sections and one external section.

**Actions / Assertions**
- Same as Group: move in, reorder, move out.
- Verify children order and `parentSectionMap` updates.

### 3) Embedded terminal run‑routing isolation
**Setup**
- Create two Code sections: X and Y.
- Run X once to create its embedded terminal.
- Prepare code in X/Y that prints unique markers (e.g., `print("X_MARKER")`, `print("Y_MARKER")`).

**Actions**
- Run Y and then read terminal output from X’s embedded terminal container.

**Assertions**
- X terminal contains `X_MARKER` but **not** `Y_MARKER` after running Y.
- Y terminal (if it becomes embedded after running) contains `Y_MARKER`.

**Implementation Notes**
- Use DOM text from xterm: query within `[data-attached-terminal-section-id="<terminalId>"]` for `.xterm-rows` text.
- If DOM text is flaky, add a test‑only helper to read the xterm buffer (via a safe accessor exposed by `useTerminal`), but only if required.

### 4) Bonus: DnD placeholder size over Code section
**Setup**
- Create a Code section (with or without an embedded terminal).
- Create a standalone Terminal section.

**Action**
- Hover/drag the Terminal over the Code section to show the drop placeholder.

**Assertion**
- Placeholder height/width matches the terminal’s size constraints for the embedded layout.

**Risk**
- Placeholder DOM may be transient; add a test id to placeholder only if needed.
- This test is optional; skip if it proves too flaky.

## Work Plan
1) Add helper utilities for:
   - Creating Group/List Root sections.
   - Calling `moveSectionsWithBackend` in tests.
   - Reading terminal output text from embedded terminals.
2) Implement Group and List Root tests in new spec.
3) Implement embedded terminal run‑routing test in existing terminal spec.
4) (Optional) Implement placeholder size test, guarded with a stable selector.
5) Run targeted Playwright suite(s) and confirm they pass.

## Risks / Mitigations
- **DnD flakiness**: prefer `moveSectionsWithBackend` for deterministic state updates.
- **Terminal output timing**: wait for unique marker text with a polling helper.
- **Placeholder sizing**: only add if we can reliably locate the placeholder element.

## Expected Files
- `frontend/tests/e2e/section-children-dnd.spec.ts` (new)
- `frontend/tests/e2e/code-section-terminal-attachment.spec.ts` (extended)
- (Optional) add test selectors for placeholder if needed.
