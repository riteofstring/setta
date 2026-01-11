# Pan/zoom performance plan

## Goals
- Identify the dominant cause of low FPS during pan and zoom.
- Separate JavaScript/render cost from paint/compositing cost.
- Define measurable before/after numbers for any fix.

## Current signals
- Pan/zoom jank suggests paint/compositing more than React rerenders.
- Nested grid/subgrid means a large DOM tree that is repainted on transform.
- Grid background is an SVG pattern updated each transform.

## Hypotheses
- Expensive paint from shadows, outlines, and rounded borders on every section.
- Background pattern redraw on every transform.
- Large DOM tree being repainted each frame, even if React is not rerendering.
- Node-level transforms plus viewport transform increasing paint cost.

## Plan
1. Repro and baseline
   - Pick a project with 50-100 sections and record a consistent pan/zoom path.
   - Capture FPS and frame time using Chrome Performance + FPS meter.
2. Determine React vs paint bottleneck
   - React DevTools Profiler on the same pan/zoom interaction.
   - If commits are tiny but FPS is low, prioritize paint/compositing.
3. Rendering instrumentation
   - Chrome Rendering: enable Paint flashing, Layer borders, FPS meter.
   - Confirm if most of the viewport repaints on each transform.
4. A/B toggles (quick local patches)
   - Disable grid lines/background: `frontend/src/forks/xyflow/background/Background.tsx`.
   - Remove or reduce shadows/outlines in `frontend/src/components/Section/Container/SectionContainerCore.tsx`.
   - Temporarily simplify section container styles to isolate paint cost.
5. Focused experiments (one at a time)
   - Add `will-change: transform` to `.react-flow__viewport` and `.react-flow__node` (CSS).
   - Test `contain: layout paint` on section containers and check for regressions.
   - Disable subgrid usage for a sample layout and compare FPS.
6. Candidate fixes
   - Reduce per-section paint effects while panning/zooming (toggle a "pan mode" class).
   - Cache or rasterize the grid background (or hide it during pan/zoom).
   - Consider viewport-only transform with simpler node styles (minimize nested transforms).
   - Evaluate visibility/virtualization for offscreen sections.
7. Verify and regressions
   - Re-run the same traces and compare average frame time and dropped frames.
   - Confirm no visual regressions in normal editing state.

## Measurements to capture
- FPS meter during pan/zoom.
- Chrome Performance trace (frame timeline + main thread).
- React Profiler commit durations during pan/zoom.

## Open questions
- How many sections does a typical heavy project have (50, 100, 200)?
- Is grid visibility always required, or can it be toggled off during pan/zoom?
- Are there sections with large canvas/iframe content that need special handling?
