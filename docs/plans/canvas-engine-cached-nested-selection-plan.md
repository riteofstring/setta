# Canvas Engine Cached Nested Selection Plan

## Goal

Keep marquee selection working for nested sections on the experimental
canvas-engine path after their DOM islands unmount and only cached nested
preview geometry remains visible.

## Problem

- The current nested-selection bridge only inspects mounted nested DOM bounds.
- The nested preview bridge already keeps nested section geometry visible after
  DOM-island unmount.
- That means nested previews can remain on screen while marquee selection stops
  seeing them, which is a real parity gap once virtualization kicks in.

## Approach

1. Extend scene selection queries for selection-only use.
   - Keep the existing top-level-only section query for DOM-island mount policy.
   - Add a selection query path that can include cached nested preview rects.

2. Reuse cached preview geometry instead of guessing.
   - Select nested preview ids from the cached world-space rects already owned
     by the scene adapter.
   - Keep the mounted DOM bridge as a supplement, not the primary source.

3. Keep the scope narrow.
   - This slice is only about marquee selection.
   - It does not claim full nested hit-testing or drag parity for every
     cached-preview interaction.

## Verification

- Scene-adapter regression coverage showing a selection query can return cached
  nested preview ids.
- Browser coverage that creates a nested child, zooms out until DOM islands
  unmount, then shift-drags a marquee over the cached preview and still selects
  the nested child.

## Non-goals

- Full recursive nested scene-graph interactivity.
- Replacing the mounted DOM bridge for nested drag/drop.
- Solving every cached-preview interaction gap in the same slice.
