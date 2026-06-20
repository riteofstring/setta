# Workspace Graph Pan/Zoom Surface Runtime

This append-only report tracks the pan/zoom surface-runtime phases for
`docs/plans/workspace_graph_pan_zoom_surface_runtime_refactor_plan.md`.

Regenerate the Phase 3 on/off recording matrix from a production Electron build
with:

```bash
pnpm --dir desktop build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario phase3 --skip-build --keep-artifacts --write-report
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
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-phase1-ready.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-phase3-pre-phase5.md`

## Run 2026-06-19T17:48:51.252Z (Phase 3)

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase3/20260619T173938Z`

Phase 3 gate status: passed

Phase 4 decision: deferred; do not build the shared frame admission coordinator yet

- remaining issue classification: event delivery and browser main-thread task timing
- input-to-presented-frame: not available; no compositor presentation trace source is wired, first-Pixi-render remains proxy evidence
- evidence basis: duplicate renderer, presentation write, React commit, full replacement, and scene-visit scaling hard gates passed in every run

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task                       | Hard failures | Report-only findings |
| -------- | --------- | --------------- | ----: | -----------: | --------------: | -----------------------------: | ------------------------: | --------------: | -----------------: | -------------------: | ------------------------------------ | ------------: | -------------------: |
| simple   | on        | phase0-simple   |     3 |        17.90 |           46.60 |                          47.10 |             3.00 / 544.00 |              58 |                  0 |                    0 | CpuProfiler::StartProfiling 80.88ms  |             0 |                    1 |
| normal   | on        | phase0-normal   |   125 |        25.00 |           75.10 |                          78.50 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 118.87ms |             0 |                    3 |
| dense    | on        | phase0-dense    |   650 |        25.40 |          177.70 |                         191.00 |            0.00 / 1772.00 |            1597 |                  0 |                    0 | CpuProfiler::StartProfiling 378.70ms |             0 |                    3 |
| stress   | on        | phase0-stress   |  1300 |        33.40 |          207.10 |                         224.80 |            0.00 / 3012.00 |            3147 |                  0 |                    0 | CpuProfiler::StartProfiling 408.12ms |             0 |                    4 |
| scaling  | on        | phase0-scaling  |   125 |        25.80 |           87.30 |                          88.10 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 104.01ms |             0 |                    3 |
| scaling  | on        | phase0-scaling  |   525 |        33.30 |          167.30 |                         168.70 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 98.26ms  |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  1025 |        34.20 |          174.80 |                         175.70 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 109.86ms |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  2525 |        41.70 |          292.30 |                         293.50 |             0.00 / 772.00 |             347 |                  0 |                    0 | RunTask 103.04ms                     |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  5025 |        42.80 |          325.60 |                         327.00 |             0.00 / 772.00 |             347 |                  0 |                    0 | RunTask 207.54ms                     |             0 |                    3 |
| simple   | off       | phase0-simple   |     3 |        17.60 |           59.40 |                          60.50 |             3.00 / 544.00 |              58 |                  0 |                    0 | CpuProfiler::StartProfiling 85.93ms  |             0 |                    1 |
| normal   | off       | phase0-normal   |   125 |        25.20 |           75.40 |                          78.60 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 103.67ms |             0 |                    3 |
| dense    | off       | phase0-dense    |   650 |        26.40 |          174.40 |                         188.30 |            0.00 / 1772.00 |            1597 |                  0 |                    0 | CpuProfiler::StartProfiling 301.40ms |             0 |                    3 |
| stress   | off       | phase0-stress   |  1300 |        33.50 |          203.20 |                         221.40 |            0.00 / 3012.00 |            3147 |                  0 |                    0 | CpuProfiler::StartProfiling 391.20ms |             0 |                    4 |
| scaling  | off       | phase0-scaling  |   125 |        25.30 |           93.80 |                          94.80 |             0.00 / 856.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 102.23ms |             0 |                    3 |
| scaling  | off       | phase0-scaling  |   525 |        33.40 |          160.20 |                         161.10 |             0.00 / 872.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 103.53ms |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  1025 |        33.40 |          176.50 |                         177.70 |             0.00 / 892.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 98.82ms  |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  2525 |        41.80 |          291.70 |                         293.20 |             0.00 / 772.00 |             347 |                  0 |                    0 | RunTask 102.30ms                     |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  5025 |        41.90 |          376.40 |                         377.80 |             0.00 / 948.00 |             347 |                  0 |                    0 | RunTask 202.16ms                     |             0 |                    3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present-off: pass; actual=0 budget=0; recording=off; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget-off: pass; actual=0 budget=0; recording=off; 125:p95=0.00 budget=856.00 visibleRenderableCount=86.00; 525:p95=0.00 budget=872.00 visibleRenderableCount=90.00; 1025:p95=0.00 budget=892.00 visibleRenderableCount=95.00; 2525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=0.00 budget=948.00 visibleRenderableCount=109.00
- hard scaling-scene-visits-grow-under-five-percent-off: pass; actual=0 budget=0.05; recording=off; smallest=125:0, largest=5025:0, growth=0.00
- hard scaling-required-scene-visit-counters-present-on: pass; actual=0 budget=0; recording=on; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget-on: pass; actual=0 budget=0; recording=on; 125:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=0.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent-on: pass; actual=0 budget=0.05; recording=on; smallest=125:0, largest=5025:0, growth=0.00

## simple / phase0-simple / recording-on

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 119Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 80.88ms; RunTask 24.20ms; RunTask 24.20ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:39:45.754Z, lastInputAt=2026-06-19T17:39:52.684Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.899999999999636 budget=24; p95FrameMs=17.899999999999636; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=95 budget=100; maxLongTaskMs=95; non-reference runner remains report-only

## normal / phase0-normal / recording-on

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 118.87ms; RunTask 33.03ms; RunTask 33.03ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:40:04.499Z, lastInputAt=2026-06-19T17:40:13.298Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25 budget=24; p95FrameMs=25; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=133 budget=100; maxLongTaskMs=133; non-reference runner remains report-only

## dense / phase0-dense / recording-on

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 378.70ms; RunTask 125.28ms; RunTask 125.28ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:40:30.601Z, lastInputAt=2026-06-19T17:40:47.645Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.400000000001455 budget=24; p95FrameMs=25.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=418 budget=100; maxLongTaskMs=418; non-reference runner remains report-only

## stress / phase0-stress / recording-on

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 24Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 408.12ms; RunTask 158.65ms; RunTask 158.65ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:41:08.205Z, lastInputAt=2026-06-19T17:41:31.687Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=456 budget=100; maxLongTaskMs=456; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 104.01ms; RunTask 41.22ms; RunTask 41.22ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:41:40.230Z, lastInputAt=2026-06-19T17:41:49.638Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.80000000000109 budget=24; p95FrameMs=25.80000000000109; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=116 budget=100; maxLongTaskMs=116; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 98.26ms; RunTask 73.33ms; RunTask 73.33ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:41:57.134Z, lastInputAt=2026-06-19T17:42:11.772Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.29999999999927 budget=24; p95FrameMs=33.29999999999927; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=117 budget=100; maxLongTaskMs=117; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 109.86ms; RunTask 73.63ms; RunTask 73.63ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:42:20.030Z, lastInputAt=2026-06-19T17:42:37.089Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=34.20000000000073 budget=24; p95FrameMs=34.20000000000073; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=130 budget=100; maxLongTaskMs=130; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: RunTask 103.04ms; RunTask 103.04ms; ThreadControllerImpl::RunTask 103.02ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:42:46.464Z, lastInputAt=2026-06-19T17:43:14.099Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.700000000004366 budget=24; p95FrameMs=41.700000000004366; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=126 budget=100; maxLongTaskMs=126; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: RunTask 207.54ms; RunTask 207.54ms; ThreadControllerImpl::RunTask 207.52ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:43:25.731Z, lastInputAt=2026-06-19T17:44:08.656Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.799999999995634 budget=24; p95FrameMs=42.799999999995634; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=158 budget=100; maxLongTaskMs=158; non-reference runner remains report-only

## simple / phase0-simple / recording-off

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 119Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 85.93ms; RunTask 24.62ms; RunTask 24.62ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:44:22.911Z, lastInputAt=2026-06-19T17:44:29.809Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.600000000000364 budget=24; p95FrameMs=17.600000000000364; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=100 budget=100; maxLongTaskMs=100; non-reference runner remains report-only

## normal / phase0-normal / recording-off

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 103.67ms; RunTask 32.17ms; RunTask 32.17ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:44:41.600Z, lastInputAt=2026-06-19T17:44:50.383Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.200000000000728 budget=24; p95FrameMs=25.200000000000728; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=118 budget=100; maxLongTaskMs=118; non-reference runner remains report-only

## dense / phase0-dense / recording-off

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 301.40ms; RunTask 101.55ms; RunTask 101.55ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:45:07.284Z, lastInputAt=2026-06-19T17:45:24.272Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=26.399999999997817 budget=24; p95FrameMs=26.399999999997817; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=340 budget=100; maxLongTaskMs=340; non-reference runner remains report-only

## stress / phase0-stress / recording-off

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 24Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 391.20ms; RunTask 153.20ms; RunTask 153.20ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:45:44.656Z, lastInputAt=2026-06-19T17:46:08.133Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.5 budget=24; p95FrameMs=33.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=438 budget=100; maxLongTaskMs=438; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 102.23ms; RunTask 35.24ms; RunTask 35.24ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:46:16.603Z, lastInputAt=2026-06-19T17:46:25.796Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.30000000000109 budget=24; p95FrameMs=25.30000000000109; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=115 budget=100; maxLongTaskMs=115; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 103.53ms; RunTask 71.88ms; RunTask 71.88ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:46:33.010Z, lastInputAt=2026-06-19T17:46:47.582Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=123 budget=100; maxLongTaskMs=123; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 98.82ms; RunTask 72.60ms; RunTask 72.60ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:46:55.591Z, lastInputAt=2026-06-19T17:47:12.625Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.39999999999782 budget=24; p95FrameMs=33.39999999999782; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=122 budget=100; maxLongTaskMs=122; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: RunTask 102.30ms; RunTask 102.30ms; ThreadControllerImpl::RunTask 102.28ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:47:21.652Z, lastInputAt=2026-06-19T17:47:49.241Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.80000000000291 budget=24; p95FrameMs=41.80000000000291; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=124 budget=100; maxLongTaskMs=124; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: RunTask 202.16ms; RunTask 202.16ms; ThreadControllerImpl::RunTask 202.13ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T17:48:00.211Z, lastInputAt=2026-06-19T17:48:44.152Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.900000000001455 budget=24; p95FrameMs=41.900000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=178 budget=100; maxLongTaskMs=178; non-reference runner remains report-only
