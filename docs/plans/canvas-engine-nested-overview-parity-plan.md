# Canvas Engine Nested Overview Parity Plan

## Goal

Make shared engine overview affordances consume cached nested preview geometry
instead of treating the workspace as top-level-only.

## Problem

- The nested preview bridge currently lives only inside `CanvasEngineHost`.
- Shared overview features such as the engine minimap and the engine fit-view
  fallback still only see `topLevelSections`.
- That creates a mismatch where nested previews are visible on the main canvas
  but absent from overview/framing behavior.

## Scope

1. Promote cached nested preview rects into shared React Flow store state.
2. Add a reusable helper that converts:
   - top-level section layouts
   - cached nested preview rects
     into overview/fit-view node snapshots.
3. Update the engine minimap to render those combined nodes.
4. Update the engine fit-view fallback to use the same combined nodes when
   React Flow node internals are unavailable.

## Verification

- Focused unit coverage for the overview-node helper.
- Update minimap tests for nested preview nodes.
- Add a browser guardrail showing a nested child appears in the engine minimap
  and remains represented after the corresponding DOM island unmounts.

## Non-goals

- Nested edge overview parity.
- A full pure-state recursive scene graph.
- Replacing the nested preview bridge with a permanent final architecture.
