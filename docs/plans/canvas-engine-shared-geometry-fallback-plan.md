# Canvas Engine Shared Geometry Fallback Plan

## Goal

Make shared section-geometry helpers work on the canvas-engine path even when
React Flow node internals and mounted DOM refs are unavailable.

## Problem

- Shared helpers in `graph.ts` still treat missing node internals and missing
  section refs as "no geometry".
- On the canvas-engine path, that drops valid source-of-truth geometry that
  already exists in:
  - `projectConfig.topLevelSections`
  - cached `canvasEngineNestedPreviewRects`
- That leaves downstream shared actions brittle, especially copy/paste and any
  selection-bounds logic that relies on `getSectionRect(...)` or
  `getActiveSectionsBounds()`.

## Scope

1. Add a source-of-truth engine fallback to `getSectionRect(...)`.
2. Reuse that fallback in `getSectionBounds(...)` / `getActiveSectionsBounds()`
   without changing React Flow behavior when measured DOM or node internals are
   present.
3. Add graph-level unit coverage for:
   - top-level layout fallback
   - cached nested preview fallback
   - mixed active-bounds fallback
4. Add a consumer-level unit test proving `paste()` still computes the correct
   position from engine-only geometry.

## Verification

- `graph.test.ts`
- `copyPaste.test.ts`

## Non-goals

- A full browser clipboard parity test in this slice
- Replacing all shared geometry consumers at once
- Introducing heuristic default sizes when canonical geometry is absent
