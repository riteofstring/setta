# Large-project frontend performance 10x plan

## Goal
- Deliver order-of-magnitude performance gains (target: 10x) for:
  - View switching in large projects (especially `settings` project tabs).
  - Canvas pan/zoom smoothness with many sections and parameters.

## Hard constraints
- Do not add zoom-level or pan-level feature activation/deactivation behavior.
- Do not rely on heuristic shortcuts when a typed/source-of-truth pathway exists.

## Baseline investigation (2026-03-01, `http://127.0.0.1:3002/settings`)

### DOM scale by settings tab
- `Core`: 3696 total elements, 5 nodes, 301 param rows.
- `Param Defaults`: 1868 total elements, 13 nodes, 76 param rows.
- `All Settings`: 9715 total elements, 42 nodes, 697 param rows, max DOM depth 30, max children 166.

### View switch long-task cost (2.2s observation window per transition)
- `Core -> All Settings`: 2 long tasks, 1447ms total, 885ms max.
- `Param Defaults -> All Settings`: 2 long tasks, 1669ms total, 1067ms max.
- `All Settings -> Core`: 1 long task, 422ms total/max.
- `All Settings -> Param Defaults`: 1 long task, 277ms total/max.

### Pan/zoom stress signal (transform loop, 180 frames)
- `Core`: 120.3 FPS avg, 0 long tasks.
- `Param Defaults`: 120.7 FPS avg, 0 long tasks.
- `All Settings`: 56.9 FPS avg, 0 long tasks.
- Interpretation: heavy views are primarily paint/layout/compositing bound, not blocked by long JavaScript tasks during transform.

### Code-level pressure points
- Full project snapshot broadcast path on view changes:
  - `backend/setta/project_state/base_project_manager.py` (`set_active_view_mode` -> `_update_and_broadcast_project_state_no_name_validation` -> `_broadcast_project_state_snapshot`).
  - `frontend/src/state/actions/sectionInfos.ts` (`processProjectStateUpdateFromBackend`) rebuilds node internals and replaces full project state.
- Subscription and deep-equality density in render-critical paths:
  - 96 `useProjectState(...)` call sites across section/params/xyflow areas.
  - 78 `isEqual` usages in those areas.
- Param measurement observer load:
  - `frontend/src/components/Params/GroupContainer.tsx` installs `ResizeObserver` + `MutationObserver` + repeated `querySelectorAll`/`offsetHeight` passes.
  - `frontend/src/components/Params/paramAreaObservers.ts` adds observers and input/change/composition listeners per param area.
- Param list/filter work inside selectors:
  - `frontend/src/components/Params/GetParamSwitch.tsx` performs match/filter work in selector and still carries a TODO for efficiency.
- Paint-heavy styling and background coupling:
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx` has expensive per-section chrome (outlines, shadows, rings, many class combinations).
  - `frontend/src/forks/xyflow/background/Background.tsx` recomputes pattern geometry from transform continuously.

## Target outcomes
- View switch: reduce worst-case long-task total from ~1.4-1.7s to <=150ms (10x+).
- View switch: reduce worst-case single long task from ~0.9-1.1s to <=100ms.
- Heavy view pan/zoom: keep >=55 FPS floor, target >=60 FPS on `All Settings`.
- DOM budget in `All Settings`: reduce from ~9715 elements to <=3500 without zoom/pan-level LOD.

## Execution plan

### Phase 1: lock baselines and add automated guardrails (2-3 days)
- Add repeatable perf scenario script for `settings` tab switches and pan/zoom path.
- Add Playwright perf specs for:
  - tab switch long-task totals and max task durations,
  - DOM count budgets (`*`, `.react-flow__node`, `[data-param-row]`).
- Store before/after results as append-only reports under `perf/`.
- Gate later phases on measurable improvements, not subjective smoothness.

### Phase 2: stop full-tree invalidation on view switch (1-2 weeks)
- Backend:
  - Introduce typed delta/update message for view-mode changes (top-level layout, visibility map, viewport, active view id), separate from full project snapshot.
  - Keep full snapshot for initial load and recovery only.
- Frontend:
  - Split runtime canvas/view-mode state from large static project state.
  - Replace `useProjectState.setState(() => x.projectState)` full replace on view-change path with targeted store updates.
  - Diff and patch node internals incrementally instead of rebuilding the full map each switch.
- Expected gain: major drop in switch-time JS and reconciliation cost.

### Phase 3: redesign param rendering pipeline for large counts (1-2 weeks)
- Build memoized, typed per-section param view models keyed by explicit version counters (not deep object equality).
- Move expensive filtering/matching out of hot selectors and into stable memoized compute paths.
- Replace observer-heavy min-height measurement loops with deterministic layout constraints:
  - fixed row metrics + explicit section param-area sizing rules,
  - narrow explicit resize triggers only when width/column width changes.
- Flatten param row markup to remove non-essential wrappers and repeated nested grid shells.
- Expected gain: large reduction in render, style recalculation, and layout work.

### Phase 4: cut paint/compositing cost in heavy views (1 week)
- Simplify section chrome globally (always-on simplification, not zoom/pan-activated):
  - reduce outline/shadow/ring complexity,
  - remove expensive visual combinations from large repeated containers.
- Replace transform-coupled SVG background updates with a cheaper rendering strategy that does not recompute heavy pattern geometry each frame.
- Add CSS containment where behavior-safe (`contain: layout paint`) to shrink invalidation regions.
- Flatten section container wrapper depth where possible (`SectionContainer`, `SectionContainerCore`, nested sections containers).
- Expected gain: improved frame consistency during pan/zoom on high-element views.

### Phase 5: state subscription rationalization (3-5 days)
- Audit `useProjectState` usage in section/param/canvas paths and replace broad selectors with narrow keyed selectors.
- Remove `isEqual` in hot-path selectors where versioned keys or primitive selectors can guarantee stable updates.
- Consolidate repeated derived computations into cached typed selectors.
- Expected gain: fewer wasted renders and lower selector CPU.

### Phase 6: radical fallback if 10x target is still missed (parallel option)
- Build a specialized renderer for `settings` project editing that avoids React Flow node chrome for default-setting editing workflows.
- Keep canonical state model unchanged; only swap rendering surface for that project mode.
- This is the highest-impact fallback if phases 2-5 do not hit targets quickly.

## Non-goals
- No zoom-dependent or pan-dependent content activation/deactivation.
- No partial-detail mode that changes behavior as the camera moves.

## Validation checklist per phase
- Run Playwright perf spec(s) and record `perf/` report.
- Capture Chrome Performance trace for the same scenario.
- Confirm:
  - long-task budgets are improving toward targets,
  - DOM budgets trend downward,
  - no behavioral regressions in section editing, param editing, and tab switching.

## Risks and mitigations
- Risk: delta protocol introduces sync bugs.
  - Mitigation: keep full-snapshot fallback pathway and add deterministic version checks.
- Risk: layout simplification changes visual behavior.
  - Mitigation: add screenshot-based Playwright checks on representative large scenes.
- Risk: observer removal breaks edge-case sizing.
  - Mitigation: codify sizing rules, add explicit tests for pinned/unpinned/edge-strip combinations.
