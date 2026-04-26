# CanvasFlow Rich Pan/Zoom Follow-Up

Date: 2026-04-27
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree
Related plan: `docs/plans/canvasflow-pan-zoom-performance-plan.md`

## Goal

Remove avoidable React, ResizeObserver, layout persistence, backend, minimap, and per-paint DOM work from CanvasFlow viewport-only gestures in a real rich-node view after the HTML-in-Canvas renderer replacement.

## Method

- View: Settings project, All Settings view. This was used as a rich-node CanvasFlow repro, not as a Settings-specific optimization target.
- Browser helper: `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement" ./ai.sh`.
- Browser: CDP-attached Chromium with CanvasDrawElement enabled.
- Gesture: fixed scripted canvas pan plus wheel zoom over the active CanvasFlow canvas.
- Signals recorded:
  - network requests during the measured gesture window
  - console ResizeObserver loop errors
  - canvas paint dataset stats
  - mounted DOM node counts
  - minimap mask changes
  - delayed xyflow/Zustand transform behavior
- Raw trace artifacts, ignored by git:
  - `perf/artifacts/frontend/canvasflow-settings-baseline-before-trace.json`
  - `perf/artifacts/frontend/canvasflow-settings-after-trace.json`
  - `perf/artifacts/frontend/canvasflow-settings-after-visual.png`

React commit counts were not directly emitted by this local build. React work was instead checked through the owner paths changed here: CanvasFlowNodeLayer no longer replaces its mount window for every live viewport event while the viewport stays inside the overscan refresh margin, and the minimap live path updates only the minimap mask subscriber rather than syncing the whole xyflow store every frame.

## Changes

- `updateNodeDimensions` now returns without writing node internals or persisting layout for empty or unchanged dimension observations, even when ResizeObserver delivered a forced measurement event.
- Dimension changes observed during an active pan, wheel pan, or wheel zoom queue a single top-level layout persistence flush after the viewport gesture finishes.
- CanvasFlow publishes a tiny live viewport external store. The minimap reads that store with `useSyncExternalStore`, so its viewport mask follows live pan/zoom before delayed xyflow transform sync.
- CanvasFlowNodeLayer keeps a coarse overscanned mount window and recomputes mounted IDs only after the visible rect approaches the refresh margin, after material zoom changes, or after canvas size changes.
- Canvas paint skips redundant node transform and pointer-event style writes, and paint diagnostic dataset writes are sampled unless `data-canvas-flow-diagnostics="enabled"` is set.
- Stale direct `d3-drag`, `d3-interpolate`, `d3-selection`, `d3-zoom`, and `@types/d3` dependencies were removed through the dependency update workflow.
- Active E2E selectors were moved from stale `.react-flow__pane` and transform DOM reads to CanvasFlow-owned selectors or store transform reads. Remaining `.react-flow__viewport` references are absence assertions/report text for the hard renderer replacement.

## Results

| Signal                                                     | Baseline |   After |
| ---------------------------------------------------------- | -------: | ------: |
| `POST /api/setTopLevelSectionLayout` during gesture window |        0 |       0 |
| `POST /api/setViewport` during gesture window              |        1 |       0 |
| ResizeObserver loop console errors                         |        0 |       0 |
| Canvas paint sequence delta                                |       76 |      74 |
| Registered nodes                                           |       46 |      46 |
| Mounted node elements before gesture                       |       45 |      39 |
| Mounted node elements after gesture                        |       39 |      36 |
| Drawn nodes after gesture                                  |       30 |      27 |
| Total paint after gesture                                  |  0.80 ms | 0.90 ms |
| Minimap mask changed during gesture                        |      yes |     yes |

Separate CDP minimap check after the change:

| Signal                                 | Result                                    |
| -------------------------------------- | ----------------------------------------- |
| Store transform before live pan        | `[1300.65390625, 267.4796874999999, 0.1]` |
| Store transform during live pan        | `[1300.65390625, 267.4796874999999, 0.1]` |
| Store sync still delayed               | true                                      |
| Minimap mask changed before store sync | true                                      |

The paint time itself was already low in this view, so the useful movement here is in the surrounding work: no top-level layout persistence is posted by unchanged ResizeObserver measurements, viewport-only gestures no longer force full minimap/store sync, small pans inside the overscan window do not cause React mount-window updates, and normal paints no longer rewrite diagnostics attributes every frame.

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/ResponsiveMiniMap.test.ts src/state/actions/nodeInternals.test.ts src/canvasflow/CanvasFlowNodeLayer.test.tsx src/canvasflow/canvasFlowPaint.test.ts src/forks/xyflow/minimap/MiniMap.test.ts`
- `./check_quality.sh`
- `pnpm -C frontend exec tsc --noEmit` was run and still fails on existing frontend strictness debt outside this slice. First failures are in `AppHeader/FollowAIToggleButton.tsx`, `Header.tsx`, `ChatInput`, and existing minimap node files; touched CanvasFlow/minimap files were checked with focused Vitest and filtered typecheck review.
- CDP visual/runtime check with CanvasDrawElement enabled on Settings All Settings view. Screenshot artifact: `perf/artifacts/frontend/canvasflow-settings-after-visual.png`.
- `rg` audit found no remaining direct stale d3 dependencies/imports.
- `rg` audit found no active `.react-flow__pane` selectors and only intentional `.react-flow__viewport` absence assertions/report strings.

## Decision

The plan's remaining actionable performance issues are addressed in the CanvasFlow owner paths rather than through Settings-specific logic. The old xyflow renderer and d3 zoom path remain absent, the xyflow fork stays only for the still-owned store/minimap/controls/handle surfaces, and the rich-node section bodies are preserved.
