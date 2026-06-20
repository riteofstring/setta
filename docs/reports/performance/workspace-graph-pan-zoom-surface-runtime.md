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

The current implementation is a diagnostic baseline only. It does not move
canvas lifetime to a surface controller or replace the frame owner.

## Run 2026-06-19T05:48:49.905Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workspace-graph-surface-runtime-phase0-matrix-check-r2`

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 30.70 | 88.40 | 108.40 | 58 | 0 | 0 | 0 | 2 |
| normal | phase0-normal | 125 | 39.30 | 161.30 | 180.40 | 347 | 0 | 0 | 0 | 2 |
| dense | phase0-dense | 650 | 63.60 | 256.00 | 288.00 | 1597 | 0 | 0 | 0 | 2 |
| stress | phase0-stress | 1300 | 92.50 | 401.70 | 453.60 | 3147 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 125 | 41.60 | 123.30 | 142.50 | 347 | 0 | 0 | 0 | 2 |
| scaling | phase0-scaling | 525 | 55.30 | 203.80 | 232.00 | 347 | 0 | 0 | 0 | 2 |
| scaling | phase0-scaling | 1025 | 58.20 | 220.40 | 248.40 | 347 | 0 | 0 | 0 | 2 |
| scaling | phase0-scaling | 2525 | 73.40 | 296.00 | 321.80 | 347 | 0 | 0 | 0 | 2 |
| scaling | phase0-scaling | 5025 | 80.10 | 522.80 | 561.40 | 347 | 0 | 0 | 0 | 2 |

## simple / phase0-simple

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:41:51.122Z, lastInputAt=2026-06-19T05:42:02.282Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- hard display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=30.69999998807907 budget=24; p95FrameMs=30.69999998807907; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=101 budget=100; maxLongTaskMs=101; non-reference runner remains report-only

## normal / phase0-normal

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:42:15.759Z, lastInputAt=2026-06-19T05:42:31.062Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- hard display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=39.30000001192093 budget=24; p95FrameMs=39.30000001192093; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=170 budget=100; maxLongTaskMs=170; non-reference runner remains report-only

## dense / phase0-dense

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 24Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:42:51.164Z, lastInputAt=2026-06-19T05:43:22.781Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=6848, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- hard display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=63.60000002384186 budget=24; p95FrameMs=63.60000002384186; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=294 budget=100; maxLongTaskMs=294; non-reference runner remains report-only

## stress / phase0-stress

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 20Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:43:50.498Z, lastInputAt=2026-06-19T05:44:39.442Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7544, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=92.5 budget=24; p95FrameMs=92.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=223 budget=100; maxLongTaskMs=223; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:44:54.628Z, lastInputAt=2026-06-19T05:45:10.706Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- hard display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.59999996423721 budget=24; p95FrameMs=41.59999996423721; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=175 budget=100; maxLongTaskMs=175; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:45:20.317Z, lastInputAt=2026-06-19T05:45:43.406Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- hard display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=55.30000001192093 budget=24; p95FrameMs=55.30000001192093; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=165 budget=100; maxLongTaskMs=165; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:45:53.961Z, lastInputAt=2026-06-19T05:46:20.573Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- hard display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=58.200000047683716 budget=24; p95FrameMs=58.200000047683716; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=166 budget=100; maxLongTaskMs=166; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:46:32.928Z, lastInputAt=2026-06-19T05:47:15.771Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- hard display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=73.39999997615814 budget=24; p95FrameMs=73.39999997615814; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=214 budget=100; maxLongTaskMs=214; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1280x820 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T05:47:31.686Z, lastInputAt=2026-06-19T05:48:37.454Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- hard display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=80.10000002384186 budget=24; p95FrameMs=80.10000002384186; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=122 budget=100; maxLongTaskMs=122; non-reference runner remains report-only

## Run 2026-06-19T07:09:31.821Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T070338Z`

Phase 1 readiness: blocked

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 28.10 | 57.70 | 80.00 | 77.00 / 524.00 | 58 | 0 | 0 | 0 | 3 |
| normal | phase0-normal | 125 | 36.40 | 112.30 | 124.20 | 1848.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 51.90 | 238.70 | 268.00 | 10998.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 54.80 | 240.60 | 260.30 | 24418.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 43.30 | 112.70 | 125.60 | 2118.00 / 792.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 53.70 | 150.40 | 175.10 | 10518.00 / 796.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 42.50 | 114.70 | 118.10 | 21036.00 / 892.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 48.30 | 170.70 | 173.70 | 52536.00 / 916.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 50.70 | 335.80 | 337.80 | 105036.00 / 948.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: fail; actual=5 budget=0; 125:p95=2118.00 budget=792.00 visibleRenderableCount=70.00; 525:p95=10518.00 budget=796.00 visibleRenderableCount=71.00; 1025:p95=21036.00 budget=892.00 visibleRenderableCount=95.00; 2525:p95=52536.00 budget=916.00 visibleRenderableCount=101.00; 5025:p95=105036.00 budget=948.00 visibleRenderableCount=109.00
- hard scaling-scene-visits-grow-under-five-percent: fail; actual=48.59206798866855 budget=0.05; smallest=125:2118, largest=5025:105036, growth=48.59

## simple / phase0-simple

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:03:45.756Z, lastInputAt=2026-06-19T07:03:56.365Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=1
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=28.100000023841858 budget=24; p95FrameMs=28.100000023841858; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=114 budget=100; maxLongTaskMs=114; non-reference runner remains report-only

## normal / phase0-normal

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:04:09.062Z, lastInputAt=2026-06-19T07:04:23.382Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=36.39999997615814 budget=24; p95FrameMs=36.39999997615814; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=188 budget=100; maxLongTaskMs=188; non-reference runner remains report-only

## dense / phase0-dense

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:04:41.592Z, lastInputAt=2026-06-19T07:05:10.010Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=4988, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=51.90000003576279 budget=24; p95FrameMs=51.90000003576279; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=284 budget=100; maxLongTaskMs=284; non-reference runner remains report-only

## stress / phase0-stress

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 17Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:05:35.681Z, lastInputAt=2026-06-19T07:06:07.920Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=54.80000001192093 budget=24; p95FrameMs=54.80000001192093; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=443 budget=100; maxLongTaskMs=443; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:06:18.640Z, lastInputAt=2026-06-19T07:06:34.030Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=392, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=43.299999952316284 budget=24; p95FrameMs=43.299999952316284; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=161 budget=100; maxLongTaskMs=161; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:06:43.781Z, lastInputAt=2026-06-19T07:07:06.678Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=392, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=53.69999998807907 budget=24; p95FrameMs=53.69999998807907; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=162 budget=100; maxLongTaskMs=162; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:07:16.981Z, lastInputAt=2026-06-19T07:07:38.025Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.5 budget=24; p95FrameMs=42.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=156 budget=100; maxLongTaskMs=156; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:07:49.103Z, lastInputAt=2026-06-19T07:08:20.957Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=48.30000001192093 budget=24; p95FrameMs=48.30000001192093; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=182 budget=100; maxLongTaskMs=182; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:08:33.865Z, lastInputAt=2026-06-19T07:09:23.516Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=50.69999998807907 budget=24; p95FrameMs=50.69999998807907; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=221 budget=100; maxLongTaskMs=221; non-reference runner remains report-only


## Run 2026-06-19T07:30:43.545Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T072422Z`

Phase 1 readiness: blocked

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 28.60 | 95.30 | 96.40 | 83.00 / 544.00 | 58 | 0 | 0 | 0 | 3 |
| normal | phase0-normal | 125 | 33.30 | 125.10 | 129.00 | 1848.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 51.50 | 250.10 | 277.20 | 10998.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 89.30 | 347.80 | 398.50 | 24418.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 35.80 | 127.90 | 129.20 | 2136.00 / 856.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 53.70 | 163.30 | 190.60 | 10518.00 / 796.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 42.70 | 143.80 | 145.20 | 21036.00 / 892.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 49.50 | 177.70 | 180.70 | 52536.00 / 916.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 71.50 | 378.30 | 410.00 | 105018.00 / 796.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: fail; actual=5 budget=0; 125:p95=2136.00 budget=856.00 visibleRenderableCount=86.00; 525:p95=10518.00 budget=796.00 visibleRenderableCount=71.00; 1025:p95=21036.00 budget=892.00 visibleRenderableCount=95.00; 2525:p95=52536.00 budget=916.00 visibleRenderableCount=101.00; 5025:p95=105018.00 budget=796.00 visibleRenderableCount=71.00
- hard scaling-scene-visits-grow-under-five-percent: fail; actual=48.16573033707865 budget=0.05; smallest=125:2136, largest=5025:105018, growth=48.17

## simple / phase0-simple

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:24:30.177Z, lastInputAt=2026-06-19T07:24:40.036Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=28.600000023841858 budget=24; p95FrameMs=28.600000023841858; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=104 budget=100; maxLongTaskMs=104; non-reference runner remains report-only

## normal / phase0-normal

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:24:53.541Z, lastInputAt=2026-06-19T07:25:06.792Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.30000001192093 budget=24; p95FrameMs=33.30000001192093; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=231 budget=100; maxLongTaskMs=231; non-reference runner remains report-only

## dense / phase0-dense

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:25:24.589Z, lastInputAt=2026-06-19T07:25:52.715Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=4988, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=51.5 budget=24; p95FrameMs=51.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=304 budget=100; maxLongTaskMs=304; non-reference runner remains report-only

## stress / phase0-stress

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 17Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:26:17.974Z, lastInputAt=2026-06-19T07:27:03.145Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=5432, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=89.30000001192093 budget=24; p95FrameMs=89.30000001192093; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=197 budget=100; maxLongTaskMs=197; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:27:17.811Z, lastInputAt=2026-06-19T07:27:31.226Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=35.799999952316284 budget=24; p95FrameMs=35.799999952316284; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=187 budget=100; maxLongTaskMs=187; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:27:40.455Z, lastInputAt=2026-06-19T07:28:03.338Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=392, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=53.69999998807907 budget=24; p95FrameMs=53.69999998807907; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=187 budget=100; maxLongTaskMs=187; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:28:13.770Z, lastInputAt=2026-06-19T07:28:34.511Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.700000047683716 budget=24; p95FrameMs=42.700000047683716; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=154 budget=100; maxLongTaskMs=154; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:28:45.446Z, lastInputAt=2026-06-19T07:29:17.720Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=49.5 budget=24; p95FrameMs=49.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=182 budget=100; maxLongTaskMs=182; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 30Hz
- recording/debug: on / on
- timing thresholds: report-only

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=3, afterRendererInstanceId=3
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T07:29:32.107Z, lastInputAt=2026-06-19T07:30:32.629Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=392, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=36; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=71.5 budget=24; p95FrameMs=71.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=121 budget=100; maxLongTaskMs=121; non-reference runner remains report-only

