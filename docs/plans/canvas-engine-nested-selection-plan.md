# Canvas Engine Nested Selection Plan

## Goal

Make marquee selection on the experimental canvas engine path include nested sections that are currently rendered inside mounted DOM islands.

## Problem

- The current canvas-engine scene adapter only tracks top-level section rects.
- Shift-drag marquee selection queries that top-level scene only.
- Nested sections inside mounted `Group` or similar containers are therefore visible but not selectable by the host marquee runtime.

## Approach

1. Treat mounted DOM islands as a temporary nested-geometry bridge.
   - Keep the existing top-level scene query.
   - During marquee selection, also inspect mounted section DOM bounds inside the host.
   - Union those DOM hits with the scene hits before publishing active ids.

2. Keep the scope narrow.
   - Only use mounted DOM bounds for marquee selection.
   - Do not claim full nested scene-graph parity or broader nested DnD parity in this slice.

3. Add focused coverage.
   - Vitest: mounted nested section DOM can be selected by a marquee drag even when it is absent from the top-level scene
   - Playwright: real engine-host project with a `Group` containing a nested child section, selected via Shift-drag marquee

## Exit Criteria

- Mounted nested sections participate in engine-host marquee selection
- Existing top-level marquee selection behavior still passes
- The new nested marquee browser test passes on the experimental engine path
