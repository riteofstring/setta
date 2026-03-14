# Canvas Engine Selection Overlay Parity Plan

## Goal

Restore the visible selected-sections overlay and keyboard nudge behavior on
the experimental canvas-engine path.

## Problem

- The engine host already supports top-level selection, multi-selection,
  group drag, and resize.
- It does not render the React Flow style selected-nodes bounding box.
- It also does not provide the focus target that normal React Flow uses for
  arrow-key nudging of selected sections.
- That leaves a visible parity gap even when the underlying selection state is
  correct.

## Scope

1. Derive top-level selection bounds from the engine's source-of-truth layout.
2. Sync those bounds into shared React Flow selection state so common workspace
   selectors can observe them.
3. Render an engine-native `.react-flow__nodesselection` overlay.
4. Make the overlay focusable and support arrow-key nudging with the existing
   snap-grid semantics.
5. Persist the nudged top-level layout through the normal backend endpoint.

## Verification

- Focused unit coverage for selection-bound calculation.
- Host-level unit coverage for overlay publication and keyboard nudging.
- Browser coverage showing a multi-selection overlay appears and arrow-key
  nudging moves the selected sections together on the engine path.

## Non-goals

- Full recursive nested selection-box parity.
- Reusing the existing React Flow d3 drag runtime for selection dragging.
- Solving every remaining node-internals compatibility gap in the same slice.
