# Canvas Engine Selection Overlay Drag Parity Plan

## Goal

Restore pointer-drag behavior for the canvas-engine selection overlay so a
selected top-level section group can be moved from anywhere inside the
selection bounds, not only by grabbing an underlying section body.

## Problem

- The engine path now renders and focuses a `.react-flow__nodesselection`
  overlay.
- Keyboard nudging works, but pointer-down on empty space inside that overlay
  still falls through to pane behavior.
- That means dragging from the selection box can pan the canvas instead of
  moving the selected group.
- React Flow's normal selected-node box acts as a drag affordance, so this is
  a real parity gap.

## Approach

1. Add an engine-native selection-overlay pointer session.

   - Start it when pointer-down lands on the selection overlay rect.
   - Snapshot the currently selected top-level section layouts up front.

2. Reuse the existing top-level layout patch flow.

   - During pointer move, update the selected top-level sections with the same
     delta math used by section drag.
   - On pointer release, persist through the normal
     `route_set_top_level_section_layout` endpoint.

3. Preserve overlay focus and click semantics.
   - Keep the overlay as the keyboard focus target after pointer interaction.
   - A stationary overlay click should not clear selection or start pane pan.

## Verification

- Vitest: host-level coverage for dragging a multi-selection from empty space
  inside the overlay bounds
- Playwright: browser coverage showing a selected group moves together when the
  drag starts from the overlay gap between sections

## Non-goals

- Recursive nested selection-box drag parity
- Snap-to-grid changes for the existing section drag runtime
- Replacing the current top-level drag math with React Flow's d3 drag runtime
