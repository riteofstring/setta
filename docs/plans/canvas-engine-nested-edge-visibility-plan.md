# Canvas Engine Nested Edge Visibility Plan

## Goal

Keep nested data edges visible on the experimental canvas-engine path after the
corresponding DOM islands unmount.

## Problem

- The nested preview bridge already preserves nested section rectangles after a
  top-level DOM island unmounts.
- Data-edge geometry still depends on live edge-handle registry positions and on
  the scene adapter's top-level-only visibility set.
- Once a nested DOM island unmounts, nested edge handles disappear from the
  registry and nested section ids stop participating in edge visibility.
- The result is that nested sections can remain visible as previews while their
  connecting data edges disappear.

## Scope

1. Cache measured nested data-handle positions for nested preview sections.
2. Extend the scene adapter input/state so nested preview rects participate in:
   - snapshot output
   - visible-section edge collection
   - data-edge anchor fallback when live handle positions are absent
3. Expand the engine host's section-edge port metadata so nested sections can
   reuse the same robust typed port definitions as top-level sections.
4. Keep the bridge data exact:
   - no keyword matching
   - no fabricated handle coordinates
   - live measured positions always win over cached positions

## Verification

- Focused Vitest coverage for nested handle caching.
- Scene-adapter regression coverage showing nested preview rects keep nested
  data edges visible.
- Browser coverage that creates a nested data edge, zooms out until DOM islands
  unmount, and verifies the engine still reports a visible data edge.

## Non-goals

- Nested agentic-edge parity beyond what the existing rect-based path already
  provides.
- Full recursive scene hit testing for every nested interaction.
- Replacing the nested preview bridge with the final generalized scene graph.
