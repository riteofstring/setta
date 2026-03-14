# Canvas Engine Context Menu Parity Plan

## Goal

Restore the workspace context menus on the experimental canvas engine path.

## Problem

- `UIPage` currently disables `PaneContextMenu`, `SelectionContextMenu`, and `TypeErrorContextMenu` whenever `useCanvasEngineV1` is enabled.
- The engine host now exposes pane-compatible DOM, but it still does not open pane or selection context menus.
- This leaves the engine path missing basic workspace actions that exist on the React Flow path.

## Approach

1. Re-enable the shared context-menu components on the engine path.
   - Keep `ResponsiveMiniMap` out of this slice.

2. Add engine-host context-menu openers.
   - Blank-pane right click opens the pane context menu.
   - Right click inside a selected top-level DOM island opens the selection context menu for the selected top-level ids.
   - Do not override default-prevented type-error menu events or editable controls inside DOM islands.

3. Add focused coverage.
   - Vitest: host-level pane and selection context-menu open-state coverage
   - Playwright: blank-pane right click creates a section through the pane menu
   - Playwright: right click on a selected engine-host section opens the selection menu and deletes it

## Exit Criteria

- Engine path renders the shared context-menu components
- Pane and selection context menus open from engine-host interactions
- The new browser coverage passes on the experimental engine path
