# Workspace Graph Pan/Zoom Surface Runtime Phase 0

This append-only report tracks the phase 0 baseline for
`docs/plans/workspace_graph_pan_zoom_surface_runtime_refactor_plan.md`.

Regenerate the phase 0 matrix from a production Electron build with:

```bash
pnpm --dir desktop build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario phase0 --skip-build --keep-artifacts --write-report
```

The `stress` workload is report-only for timing until `normal` passes
reliably. Non-reference machines enforce structural gates and emit timing
reports; timing thresholds are not used as cross-hardware proof.

Phase 0 instrumentation captures:

- wheel handler, camera update, event delivery, and first-Pixi-render proxy
  timing from renderer samples and user timing marks; compositor presented-frame
  budgets stay blocked until a presentation trace source is wired;
- frame timing, camera-frame scene visits, display object counts, and Pixi
  render buckets from workflow graph debug snapshots;
- active renderer lifecycle evidence through renderer instance, canvas
  creation, and destroy counters;
- pane chrome DOM mutations by owner and causal source through a
  MutationObserver installed only by the Electron recorder;
- React Profiler commits by surface and causal source while the recorder is
  active;
- CDP trace summaries naming the largest complete events and top-level tasks.

These archived runs capture the diagnostic baseline before Phase 1 readiness.


## Run 2026-06-19T14:21:19.282Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T141614Z`

Phase 1 readiness: blocked

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 25.60 | 98.10 | 100.50 | 83.00 / 544.00 | 58 | 0 | 0 | 0 | 2 |
| normal | phase0-normal | 125 | 33.30 | 89.90 | 95.50 | 1848.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 41.70 | 172.90 | 193.60 | 10998.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 42.50 | 218.40 | 235.60 | 24418.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 41.70 | 112.10 | 113.50 | 2124.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 33.40 | 132.40 | 136.50 | 10524.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 33.40 | 139.20 | 140.50 | 21024.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 41.80 | 236.60 | 239.30 | 52524.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 42.50 | 327.30 | 329.40 | 105024.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: fail; actual=5 budget=0; 125:p95=2124.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=10524.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=21024.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=52524.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=105024.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent: fail; actual=48.44632768361582 budget=0.05; smallest=125:2124, largest=5025:105024, growth=48.45

## simple / phase0-simple

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 108Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:16:22.103Z, lastInputAt=2026-06-19T14:16:31.407Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.599999999998545 budget=24; p95FrameMs=25.599999999998545; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=81 budget=100; maxLongTaskMs=81; non-reference runner remains report-only

## normal / phase0-normal

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:16:45.141Z, lastInputAt=2026-06-19T14:16:55.953Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.29999999999927 budget=24; p95FrameMs=33.29999999999927; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=155 budget=100; maxLongTaskMs=155; non-reference runner remains report-only

## dense / phase0-dense

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:17:14.723Z, lastInputAt=2026-06-19T14:17:35.130Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.69999999999709 budget=24; p95FrameMs=41.69999999999709; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=467 budget=100; maxLongTaskMs=467; non-reference runner remains report-only

## stress / phase0-stress

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 24Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:17:57.845Z, lastInputAt=2026-06-19T14:18:24.504Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.5 budget=24; p95FrameMs=42.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=443 budget=100; maxLongTaskMs=443; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:18:34.649Z, lastInputAt=2026-06-19T14:18:46.505Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.70000000000073 budget=24; p95FrameMs=41.70000000000073; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=138 budget=100; maxLongTaskMs=138; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:18:54.941Z, lastInputAt=2026-06-19T14:19:11.164Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=136 budget=100; maxLongTaskMs=136; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:19:19.898Z, lastInputAt=2026-06-19T14:19:37.535Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=130 budget=100; maxLongTaskMs=130; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:19:47.508Z, lastInputAt=2026-06-19T14:20:15.646Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.80000000000291 budget=24; p95FrameMs=41.80000000000291; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=136 budget=100; maxLongTaskMs=136; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:20:27.508Z, lastInputAt=2026-06-19T14:21:11.482Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.5 budget=24; p95FrameMs=42.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=171 budget=100; maxLongTaskMs=171; non-reference runner remains report-only


## Run 2026-06-19T14:30:10.194Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T142528Z`

Phase 1 readiness: blocked

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 18.20 | 49.50 | 50.80 | 83.00 / 544.00 | 58 | 0 | 0 | 0 | 2 |
| normal | phase0-normal | 125 | 24.50 | 83.80 | 87.30 | 1848.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 25.80 | 213.70 | 225.80 | 10998.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 33.50 | 210.50 | 225.80 | 24418.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 25.90 | 96.20 | 97.30 | 2124.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 34.20 | 114.60 | 116.30 | 10524.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 34.50 | 134.90 | 136.30 | 21024.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 41.70 | 184.00 | 185.30 | 52524.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 42.70 | 327.10 | 328.70 | 105024.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: fail; actual=5 budget=0; 125:p95=2124.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=10524.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=21024.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=52524.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=105024.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent: fail; actual=48.44632768361582 budget=0.05; smallest=125:2124, largest=5025:105024, growth=48.45

## simple / phase0-simple

- build: production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 119Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:25:35.645Z, lastInputAt=2026-06-19T14:25:42.853Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=18.200000000000728 budget=24; p95FrameMs=18.200000000000728; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=103 budget=100; maxLongTaskMs=103; non-reference runner remains report-only

## normal / phase0-normal

- build: production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 63Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:25:54.918Z, lastInputAt=2026-06-19T14:26:03.934Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=24.5 budget=24; p95FrameMs=24.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=139 budget=100; maxLongTaskMs=139; non-reference runner remains report-only

## dense / phase0-dense

- build: production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 41Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:26:20.863Z, lastInputAt=2026-06-19T14:26:38.206Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.799999999995634 budget=24; p95FrameMs=25.799999999995634; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=215 budget=100; maxLongTaskMs=215; non-reference runner remains report-only

## stress / phase0-stress

- build: production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 24Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:26:59.196Z, lastInputAt=2026-06-19T14:27:22.921Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.5 budget=24; p95FrameMs=33.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=468 budget=100; maxLongTaskMs=468; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:27:31.904Z, lastInputAt=2026-06-19T14:27:41.419Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.899999999999636 budget=24; p95FrameMs=25.899999999999636; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=127 budget=100; maxLongTaskMs=127; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:27:49.215Z, lastInputAt=2026-06-19T14:28:03.923Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=34.20000000000073 budget=24; p95FrameMs=34.20000000000073; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=112 budget=100; maxLongTaskMs=112; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 41Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:28:12.745Z, lastInputAt=2026-06-19T14:28:30.009Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=34.5 budget=24; p95FrameMs=34.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=134 budget=100; maxLongTaskMs=134; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:28:39.625Z, lastInputAt=2026-06-19T14:29:07.563Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.69999999999709 budget=24; p95FrameMs=41.69999999999709; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=145 budget=100; maxLongTaskMs=145; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:29:19.386Z, lastInputAt=2026-06-19T14:30:02.673Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.69999999999709 budget=24; p95FrameMs=42.69999999999709; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=159 budget=100; maxLongTaskMs=159; non-reference runner remains report-only


## Run 2026-06-19T14:37:31.643Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T143236Z`

Phase 1 readiness: blocked

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 17.40 | 66.50 | 67.90 | 83.00 / 544.00 | 58 | 0 | 0 | 0 | 1 |
| normal | phase0-normal | 125 | 25.20 | 84.50 | 88.40 | 1848.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 25.90 | 141.20 | 156.50 | 10998.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 33.80 | 231.00 | 250.10 | 24418.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 25.60 | 66.80 | 73.20 | 2124.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 34.10 | 112.30 | 115.60 | 10524.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 34.00 | 163.90 | 165.40 | 21024.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 42.40 | 204.30 | 207.10 | 52524.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 42.10 | 343.20 | 344.90 | 105024.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: fail; actual=5 budget=0; 125:p95=2124.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=10524.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=21024.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=52524.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=105024.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent: fail; actual=48.44632768361582 budget=0.05; smallest=125:2124, largest=5025:105024, growth=48.45

## simple / phase0-simple

- build: production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 115Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:32:43.881Z, lastInputAt=2026-06-19T14:32:51.576Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.399999999997817 budget=24; p95FrameMs=17.399999999997817; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=91 budget=100; maxLongTaskMs=91; non-reference runner remains report-only

## normal / phase0-normal

- build: production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:33:04.251Z, lastInputAt=2026-06-19T14:33:13.478Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.200000000000728 budget=24; p95FrameMs=25.200000000000728; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=131 budget=100; maxLongTaskMs=131; non-reference runner remains report-only

## dense / phase0-dense

- build: production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:33:31.272Z, lastInputAt=2026-06-19T14:33:48.851Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.900000000001455 budget=24; p95FrameMs=25.900000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=318 budget=100; maxLongTaskMs=318; non-reference runner remains report-only

## stress / phase0-stress

- build: production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 24Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:34:10.551Z, lastInputAt=2026-06-19T14:34:36.057Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.80000000000291 budget=24; p95FrameMs=33.80000000000291; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=458 budget=100; maxLongTaskMs=458; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:34:45.486Z, lastInputAt=2026-06-19T14:34:55.027Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.600000000000364 budget=24; p95FrameMs=25.600000000000364; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=127 budget=100; maxLongTaskMs=127; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 57Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:35:03.147Z, lastInputAt=2026-06-19T14:35:18.996Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=34.099999999998545 budget=24; p95FrameMs=34.099999999998545; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=145 budget=100; maxLongTaskMs=145; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:35:27.961Z, lastInputAt=2026-06-19T14:35:45.995Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=34 budget=24; p95FrameMs=34; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=143 budget=100; maxLongTaskMs=143; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:35:56.008Z, lastInputAt=2026-06-19T14:36:25.147Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.400000000001455 budget=24; p95FrameMs=42.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=144 budget=100; maxLongTaskMs=144; non-reference runner remains report-only

## scaling / phase0-scaling

- build: production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:36:37.280Z, lastInputAt=2026-06-19T14:37:23.505Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.099999999998545 budget=24; p95FrameMs=42.099999999998545; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=180 budget=100; maxLongTaskMs=180; non-reference runner remains report-only
