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

Archived early runs capture the diagnostic baseline. Current runs track Phase 1
readiness for the controller-owned surface runtime and explicit frame owner.


Earlier runs from this date were split into archive files to keep each report under
the repository file-length limit:

- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-early.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-mid.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-late.md`

## Run 2026-06-19T15:00:03.830Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T145512Z`

Phase 1 readiness: ready

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 17.60 | 71.50 | 72.80 | 3.00 / 544.00 | 58 | 0 | 0 | 0 | 1 |
| normal | phase0-normal | 125 | 25.00 | 72.20 | 73.20 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 25.70 | 216.70 | 228.60 | 0.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 33.90 | 231.80 | 252.00 | 0.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 25.80 | 85.40 | 88.20 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 33.40 | 131.20 | 133.90 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 33.60 | 146.90 | 148.00 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 41.70 | 229.00 | 230.50 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 42.30 | 334.80 | 336.50 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: pass; actual=0 budget=0; 125:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=0.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent: pass; actual=0 budget=0.05; smallest=125:0, largest=5025:0, growth=0.00

## simple / phase0-simple

- build: existing-production-electron-build
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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:55:19.390Z, lastInputAt=2026-06-19T14:55:27.071Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.600000000000364 budget=24; p95FrameMs=17.600000000000364; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=100 budget=100; maxLongTaskMs=100; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:55:39.730Z, lastInputAt=2026-06-19T14:55:48.927Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25 budget=24; p95FrameMs=25; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=134 budget=100; maxLongTaskMs=134; non-reference runner remains report-only

## dense / phase0-dense

- build: existing-production-electron-build
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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:56:06.851Z, lastInputAt=2026-06-19T14:56:25.122Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.69999999999709 budget=24; p95FrameMs=25.69999999999709; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=316 budget=100; maxLongTaskMs=316; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:56:47.085Z, lastInputAt=2026-06-19T14:57:12.441Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.900000000001455 budget=24; p95FrameMs=33.900000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=464 budget=100; maxLongTaskMs=464; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:57:21.998Z, lastInputAt=2026-06-19T14:57:31.960Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.80000000000109 budget=24; p95FrameMs=25.80000000000109; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=115 budget=100; maxLongTaskMs=115; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:57:39.965Z, lastInputAt=2026-06-19T14:57:55.047Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=119 budget=100; maxLongTaskMs=119; non-reference runner remains report-only

## scaling / phase0-scaling

- build: existing-production-electron-build
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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:58:03.886Z, lastInputAt=2026-06-19T14:58:21.513Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.60000000000218 budget=24; p95FrameMs=33.60000000000218; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=122 budget=100; maxLongTaskMs=122; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:58:31.223Z, lastInputAt=2026-06-19T14:58:59.346Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.700000000004366 budget=24; p95FrameMs=41.700000000004366; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=147 budget=100; maxLongTaskMs=147; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T14:59:11.369Z, lastInputAt=2026-06-19T14:59:55.922Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.299999999995634 budget=24; p95FrameMs=42.299999999995634; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=154 budget=100; maxLongTaskMs=154; non-reference runner remains report-only

## Run 2026-06-19T15:18:01.625Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T151315Z`

Phase 1 readiness: ready

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 17.40 | 48.30 | 49.30 | 3.00 / 544.00 | 58 | 0 | 0 | 0 | 1 |
| normal | phase0-normal | 125 | 24.60 | 74.10 | 75.10 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 25.90 | 148.60 | 162.00 | 0.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 33.50 | 222.10 | 240.00 | 0.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 25.50 | 108.20 | 109.50 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 33.40 | 147.30 | 148.60 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 33.70 | 149.70 | 151.10 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 42.10 | 226.10 | 228.80 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 42.60 | 334.50 | 336.20 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: pass; actual=0 budget=0; 125:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=0.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent: pass; actual=0 budget=0.05; smallest=125:0, largest=5025:0, growth=0.00

## simple / phase0-simple

- build: existing-production-electron-build
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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:13:22.636Z, lastInputAt=2026-06-19T15:13:29.881Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.399999999999636 budget=24; p95FrameMs=17.399999999999636; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=94 budget=100; maxLongTaskMs=94; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:13:42.074Z, lastInputAt=2026-06-19T15:13:51.058Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=24.600000000002183 budget=24; p95FrameMs=24.600000000002183; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=133 budget=100; maxLongTaskMs=133; non-reference runner remains report-only

## dense / phase0-dense

- build: existing-production-electron-build
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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:14:08.221Z, lastInputAt=2026-06-19T15:14:25.617Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.89999999999418 budget=24; p95FrameMs=25.89999999999418; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=261 budget=100; maxLongTaskMs=261; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:14:46.859Z, lastInputAt=2026-06-19T15:15:10.920Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.5 budget=24; p95FrameMs=33.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=464 budget=100; maxLongTaskMs=464; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:15:20.034Z, lastInputAt=2026-06-19T15:15:29.661Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.5 budget=24; p95FrameMs=25.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=114 budget=100; maxLongTaskMs=114; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:15:37.697Z, lastInputAt=2026-06-19T15:15:52.626Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=135 budget=100; maxLongTaskMs=135; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:16:01.137Z, lastInputAt=2026-06-19T15:16:19.106Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.69999999999709 budget=24; p95FrameMs=33.69999999999709; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=118 budget=100; maxLongTaskMs=118; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:16:28.963Z, lastInputAt=2026-06-19T15:16:57.624Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.10000000000582 budget=24; p95FrameMs=42.10000000000582; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=135 budget=100; maxLongTaskMs=135; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T15:17:09.502Z, lastInputAt=2026-06-19T15:17:53.829Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.599999999998545 budget=24; p95FrameMs=42.599999999998545; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=159 budget=100; maxLongTaskMs=159; non-reference runner remains report-only

## Run 2026-06-19T16:19:57.885Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase0/20260619T161510Z`

Phase 1 readiness: ready

| Scenario | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | phase0-simple | 3 | 17.50 | 57.50 | 58.50 | 3.00 / 544.00 | 58 | 0 | 0 | 0 | 2 |
| normal | phase0-normal | 125 | 25.40 | 78.60 | 82.20 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| dense | phase0-dense | 650 | 25.80 | 201.80 | 215.40 | 0.00 / 1772.00 | 1597 | 0 | 0 | 0 | 3 |
| stress | phase0-stress | 1300 | 33.70 | 271.00 | 289.40 | 0.00 / 3012.00 | 3147 | 0 | 0 | 0 | 4 |
| scaling | phase0-scaling | 125 | 25.40 | 105.30 | 107.00 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 525 | 33.40 | 161.30 | 162.40 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 1025 | 33.50 | 169.90 | 171.20 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 2525 | 41.80 | 239.80 | 241.40 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |
| scaling | phase0-scaling | 5025 | 42.00 | 392.40 | 393.70 | 0.00 / 772.00 | 347 | 0 | 0 | 0 | 3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present: pass; actual=0 budget=0; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget: pass; actual=0 budget=0; 125:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=0.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent: pass; actual=0 budget=0.05; smallest=125:0, largest=5025:0, growth=0.00

## simple / phase0-simple

- build: existing-production-electron-build
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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:15:17.374Z, lastInputAt=2026-06-19T16:15:24.406Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.5 budget=24; p95FrameMs=17.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=106 budget=100; maxLongTaskMs=106; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:15:36.695Z, lastInputAt=2026-06-19T16:15:45.846Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.399999999997817 budget=24; p95FrameMs=25.399999999997817; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=141 budget=100; maxLongTaskMs=141; non-reference runner remains report-only

## dense / phase0-dense

- build: existing-production-electron-build
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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:16:03.578Z, lastInputAt=2026-06-19T16:16:21.017Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.799999999995634 budget=24; p95FrameMs=25.799999999995634; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=318 budget=100; maxLongTaskMs=318; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:16:42.348Z, lastInputAt=2026-06-19T16:17:06.917Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.700000000004366 budget=24; p95FrameMs=33.700000000004366; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=471 budget=100; maxLongTaskMs=471; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:17:15.915Z, lastInputAt=2026-06-19T16:17:25.333Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.399999999999636 budget=24; p95FrameMs=25.399999999999636; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=107 budget=100; maxLongTaskMs=107; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:17:33.018Z, lastInputAt=2026-06-19T16:17:47.878Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.39999999999782 budget=24; p95FrameMs=33.39999999999782; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=117 budget=100; maxLongTaskMs=117; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:17:56.303Z, lastInputAt=2026-06-19T16:18:14.127Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.5 budget=24; p95FrameMs=33.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=124 budget=100; maxLongTaskMs=124; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:18:23.908Z, lastInputAt=2026-06-19T16:18:53.450Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.799999999995634 budget=24; p95FrameMs=41.799999999995634; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=154 budget=100; maxLongTaskMs=154; non-reference runner remains report-only

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
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:19:05.314Z, lastInputAt=2026-06-19T16:19:50.367Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42 budget=24; p95FrameMs=42; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=179 budget=100; maxLongTaskMs=179; non-reference runner remains report-only

