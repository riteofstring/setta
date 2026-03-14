## Canvas Engine Cached Nested Context Menu Plan

### Goal

Make right-click behavior work for selected cached nested previews on the
experimental canvas-engine path after their DOM islands unmount.

### Problem

The host currently resolves `contextmenu` events in two ways:

- selected top-level DOM islands
- otherwise the blank pane

That means a selected nested section can be visible as a cached preview, but a
right-click on that preview still falls through to the pane because there is no
mounted DOM island target to inspect.

### Scope

This slice covers selection-context-menu parity for selected sections under the
cursor, including cached nested previews.

In scope:

- host context-menu hit testing for selected cached nested previews
- reusing the existing selection context menu for selected nested sections
- focused unit coverage
- browser coverage that proves a cached nested preview can open the selection
  menu and perform a real action

Out of scope:

- full drag/edit parity for cached nested previews
- unselected right-click behavior changes across the whole canvas
- recursive DOM remount behavior beyond what already exists

### Implementation Steps

1. Make host `contextmenu` resolution selection-aware.
   - If the event target maps to a selected section, open the selection menu.
   - If there is no mounted DOM target, fall back to scene hit testing.
2. Keep the behavior narrow.
   - Only selected sections should open the selection menu.
   - Unselected cached previews should keep the existing pane-fallback behavior.
3. Reuse existing selection-menu behavior.
   - Do not fork a new nested-only context menu.
   - Pass the active section ids through the existing selection menu pathway.
4. Add regression coverage for:
   - unit-level cached nested preview contextmenu handling
   - browser-level cached nested preview delete flow after DOM-island unmount

### Verification

- `vitest` for host coverage
- targeted Playwright on `canvas-engine-host.spec.ts`
- CDP visual check on a disposable project:
  - select a cached nested preview
  - right-click it after DOM unmount
  - confirm the selection context menu opens instead of the pane menu

### Exit Criteria

This slice is done when, after nested DOM islands unmount:

- right-clicking a selected cached nested preview opens the selection menu
- the same selection-menu actions work on that cached nested preview
- blank-pane right-click behavior remains unchanged
