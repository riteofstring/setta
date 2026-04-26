# CanvasFlow Settings Pan/Zoom Performance Plan

## Goal
Make pan/zoom in the Settings project, All Settings view, feel consistently smooth after the HTML-in-Canvas renderer replacement.

The immediate target is to remove avoidable React, ResizeObserver, layout persistence, and backend round-trip work from viewport-only gestures. The longer-term target is to make the real Settings view perform well, not only synthetic TextBlock graphs.

## Current Diagnosis
CanvasFlow replaced the old DOM/SVG viewport renderer, but the real Settings view still keeps rich HTML node bodies mounted. Pan/zoom now updates a live canvas viewport ref and repaints quickly, but adjacent systems still observe, measure, mount, and persist node/layout state during or near viewport gestures.

The latest Chrome recording did not include a CPU trace, but it showed these strong signals after switching to All Settings:

- A large `UpdateFrontendProjectState` websocket payload arrived immediately after the view-mode change.
- Multiple `POST /api/setTopLevelSectionLayout` requests followed in the same interaction window.
- Chrome repeatedly reported `ResizeObserver loop completed with undelivered notifications.`
- The minimap lagged because it still reads the delayed xyflow/Zustand `transform`, while CanvasFlow's live viewport lives in a ref.

This points to layout and measurement churn as the primary current problem, not d3 zoom math or upstream React Flow rendering.

## Source Context
- Active canvas entrypoint:
  - `frontend/src/components/Pages/Project/UiPage.tsx`
  - `frontend/src/canvasflow/CanvasFlow.tsx`
  - `frontend/src/canvasflow/CanvasFlowCanvas.tsx`
- Pan/zoom hot path:
  - `frontend/src/canvasflow/CanvasFlowInteractions.ts`
  - `frontend/src/canvasflow/canvasFlowViewport.ts`
  - `frontend/src/canvasflow/canvasFlowPaint.ts`
- HTML node mounting and culling:
  - `frontend/src/canvasflow/CanvasFlowNodeLayer.tsx`
  - `frontend/src/canvasflow/canvasFlowGeometry.ts`
- Legacy xyflow-derived state still used by CanvasFlow and the minimap:
  - `frontend/src/forks/xyflow/core/store/index.ts`
  - `frontend/src/forks/xyflow/minimap/MiniMap.tsx`
  - `frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx`
- Layout persistence path:
  - `frontend/src/state/actions/nodeInternals.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
- Relevant prior reports:
  - `perf/reports/frontend/2026-04-27_html-in-canvas-pan-zoom-matrix.md`
  - `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`

## Non-Goals
- Do not reintroduce React Flow or d3 zoom as the primary renderer.
- Do not remove the xyflow fork wholesale until remaining state, minimap, controls, handles, and tests have clear replacements.
- Do not optimize only synthetic TextBlock graphs.
- Do not add heuristic fallbacks for browsers or project shapes.
- Do not silently suppress ResizeObserver or backend errors; fix the cause or fail specifically.

## Working Hypotheses
1. `updateNodeDimensions` schedules store writes and top-level layout persistence even when observed dimensions are unchanged or effectively unchanged.
2. Pure viewport gestures can indirectly trigger node measurement and layout persistence through mounted HTML node wrappers.
3. The node mounting layer reacts to every live viewport event, pulling React work into pan/zoom even though the renderer intentionally keeps the viewport in refs.
4. Per-paint DOM writes such as canvas diagnostic `dataset` updates and repeated node style assignments add avoidable main-thread work.
5. The minimap lags because it is subscribed to the delayed xyflow/Zustand transform rather than the live CanvasFlow viewport.
6. Stale direct `d3-*` dependencies are cleanup debt, but they are probably not the active performance cause because source code no longer imports them.

## Work Plan

### 1. Capture a real baseline
- Record a CPU/performance trace for Settings project, All Settings view, with a fixed pan and zoom script.
- Record counts for:
  - `setTopLevelSectionLayout` requests during viewport-only gestures
  - `setViewport` requests
  - `ResizeObserver` loop errors
  - canvas paint timing stats
  - React commits during pan/zoom
  - visible, mounted, and registered node counts
- Save the baseline as a new append-only report under `perf/reports/frontend/`.

### 2. Stop no-op dimension updates from persisting layout
- Audit `updateNodeDimensions` and `applyNodeDimensionUpdates`.
- Make the action return early when there are no material dimension changes.
- Only update `useNodeInternals` and call `debounced_route_set_top_level_section_layout` when at least one node dimension actually changed.
- Add focused Vitest coverage for:
  - empty update list
  - unchanged dimensions
  - one changed dimension
  - changed dimensions still trigger the existing layout path

### 3. Keep layout persistence out of pure viewport gestures
- Treat pan, wheel pan, and wheel zoom as viewport-only interactions.
- Prevent dimension/layout persistence from firing during active viewport gestures unless a real non-viewport node resize occurred.
- If a real resize occurs during an interaction, queue one layout persistence flush after the gesture instead of posting repeatedly during the gesture.
- Verify that drag-resize or content-driven node resize behavior still persists correctly.

### 4. Decouple minimap viewport feedback from delayed store sync
- Keep the main xyflow/Zustand transform sync delayed so pan/zoom does not re-render the graph every frame.
- Add a minimal live viewport path for the minimap mask, using the existing CanvasFlow viewport event/ref or a tiny dedicated external store.
- Do not update all xyflow store consumers every frame just to fix the minimap.
- Add coverage that the minimap viewport mask updates during canvas pan/zoom before the delayed store sync fires.

### 5. Reduce React work from node mounting during pan/zoom
- Measure how often `CanvasFlowNodeLayer` recomputes mounted node IDs during a typical gesture.
- Replace every-frame mount-window updates with a coarse threshold or tile-based update.
- Keep the large overscan behavior, but only recompute the mounted set when the viewport approaches an overscan boundary or when zoom changes enough to alter the mount window materially.
- Verify that nodes do not pop in late during fast pans.

### 6. Remove avoidable per-paint DOM mutations
- Gate or throttle canvas diagnostic `dataset` writes so normal pan/zoom frames do not mutate DOM attributes every paint.
- Avoid writing node `pointerEvents` and transform styles when the intended value has not changed.
- Keep any diagnostics required by tests behind an explicit perf/test flag or low-frequency sampler.

### 7. Audit stale renderer dependencies and selectors
- Confirm no source imports remain for `d3-drag`, `d3-interpolate`, `d3-selection`, and `d3-zoom`.
- Remove stale direct d3 dependencies through the normal dependency update workflow if they are truly unused.
- Inventory tests that still refer to `.react-flow__pane` or `.react-flow__viewport`.
- Rename or replace stale selectors with CanvasFlow-owned selectors where the tests cover active behavior.

### 8. Re-measure the real Settings view
- Re-run the same Settings All Settings pan/zoom trace.
- Compare before/after:
  - FPS / frame time
  - scripting time
  - rendering and layout time
  - React commits
  - ResizeObserver errors
  - layout persistence request count
  - minimap lag
- Append the results to the performance report.

## Verification
- Targeted Vitest for `nodeInternals` dimension update behavior.
- Targeted Vitest or component test for minimap live viewport updates.
- Browser verification in Settings project, All Settings view.
- CDP performance trace before and after the changes.
- Network check confirming no repeated `setTopLevelSectionLayout` calls during pure pan/zoom.
- Console check confirming no repeated ResizeObserver loop errors during the tested gesture.
- `./check_quality.sh` before finishing the implementation branch unless scope is explicitly narrowed.

## Acceptance Criteria
- Pure pan/zoom in Settings All Settings does not trigger repeated top-level layout persistence.
- Pure pan/zoom does not produce repeated ResizeObserver loop errors.
- The minimap viewport mask tracks canvas pan/zoom without the current visible delay.
- React work during active pan/zoom is materially reduced from the baseline.
- Real Settings All Settings performance improves in a recorded before/after trace.
- Synthetic TextBlock benchmark performance does not regress.
- Stale d3 dependencies and stale React Flow selectors are either removed or documented with a concrete remaining use.

## Suggested Execution Order
1. Capture the CPU baseline for the real Settings view.
2. Fix no-op dimension update persistence.
3. Suppress or defer layout persistence during viewport gestures.
4. Add live minimap viewport updates.
5. Coarsen node mounting updates.
6. Remove avoidable per-paint DOM mutations.
7. Clean stale d3 dependencies and selectors.
8. Re-profile and document before/after results.
