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

- wheel handler, camera update, event delivery, and input-to-presented-frame
  timing from renderer samples and user timing marks;
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

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 input-present ms | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
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
