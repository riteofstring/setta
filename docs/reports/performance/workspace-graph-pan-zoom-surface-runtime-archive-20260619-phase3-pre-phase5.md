# Workspace Graph Pan/Zoom Surface Runtime - Phase 3 Pre-Phase5 Archive

Archived from `workspace-graph-pan-zoom-surface-runtime.md` to keep the active report under the repository file-length limit.

## Run 2026-06-19T16:49:45.733Z (Phase 3)

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase3/20260619T164034Z`

Phase 3 gate status: passed

Phase 4 decision: deferred; do not build the shared frame admission coordinator yet

- remaining issue classification: event delivery and browser main-thread task timing
- input-to-presented-frame: not available; no compositor presentation trace source is wired, first-Pixi-render remains proxy evidence
- evidence basis: duplicate renderer, presentation write, React commit, full replacement, and scene-visit scaling hard gates passed in every run

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task                       | Hard failures | Report-only findings |
| -------- | --------- | --------------- | ----: | -----------: | --------------: | -----------------------------: | ------------------------: | --------------: | -----------------: | -------------------: | ------------------------------------ | ------------: | -------------------: |
| simple   | on        | phase0-simple   |     3 |        17.50 |           56.50 |                          57.50 |             3.00 / 544.00 |              58 |                  0 |                    0 | CpuProfiler::StartProfiling 72.76ms  |             0 |                    1 |
| normal   | on        | phase0-normal   |   125 |        18.60 |           67.80 |                          68.60 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 115.04ms |             0 |                    2 |
| dense    | on        | phase0-dense    |   650 |        25.50 |          173.50 |                         187.00 |            0.00 / 1772.00 |            1597 |                  0 |                    0 | CpuProfiler::StartProfiling 234.07ms |             0 |                    3 |
| stress   | on        | phase0-stress   |  1300 |        33.50 |          252.90 |                         270.70 |            0.00 / 3012.00 |            3147 |                  0 |                    0 | CpuProfiler::StartProfiling 413.40ms |             0 |                    4 |
| scaling  | on        | phase0-scaling  |   125 |        25.70 |           97.40 |                          98.40 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 96.91ms  |             0 |                    3 |
| scaling  | on        | phase0-scaling  |   525 |        33.40 |          159.40 |                         160.80 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 104.41ms |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  1025 |        33.80 |          146.30 |                         147.30 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 102.97ms |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  2525 |        41.70 |          222.10 |                         224.00 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 109.29ms |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  5025 |        42.10 |          316.50 |                         318.10 |             0.00 / 772.00 |             347 |                  0 |                    0 | RunTask 199.53ms                     |             0 |                    3 |
| simple   | off       | phase0-simple   |     3 |        17.80 |           56.60 |                          57.50 |             3.00 / 544.00 |              58 |                  0 |                    0 | CpuProfiler::StartProfiling 81.12ms  |             0 |                    1 |
| normal   | off       | phase0-normal   |   125 |        18.30 |           78.00 |                          81.30 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 143.44ms |             0 |                    2 |
| dense    | off       | phase0-dense    |   650 |        25.90 |          183.80 |                         197.30 |            0.00 / 1772.00 |            1597 |                  0 |                    0 | CpuProfiler::StartProfiling 252.40ms |             0 |                    3 |
| stress   | off       | phase0-stress   |  1300 |        33.40 |          247.60 |                         265.10 |            0.00 / 3012.00 |            3147 |                  0 |                    0 | CpuProfiler::StartProfiling 408.19ms |             0 |                    4 |
| scaling  | off       | phase0-scaling  |   125 |        25.20 |           93.90 |                          94.80 |             0.00 / 856.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 96.53ms  |             0 |                    3 |
| scaling  | off       | phase0-scaling  |   525 |        33.40 |          154.60 |                         157.30 |             0.00 / 872.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 90.52ms  |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  1025 |        33.40 |          173.50 |                         174.90 |             0.00 / 892.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 112.41ms |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  2525 |        41.70 |          281.90 |                         283.40 |             0.00 / 916.00 |             347 |                  0 |                    0 | RunTask 113.93ms                     |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  5025 |        41.80 |          372.10 |                         373.30 |             0.00 / 948.00 |             347 |                  0 |                    0 | RunTask 194.43ms                     |             0 |                    3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present-off: pass; actual=0 budget=0; recording=off; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget-off: pass; actual=0 budget=0; recording=off; 125:p95=0.00 budget=856.00 visibleRenderableCount=86.00; 525:p95=0.00 budget=872.00 visibleRenderableCount=90.00; 1025:p95=0.00 budget=892.00 visibleRenderableCount=95.00; 2525:p95=0.00 budget=916.00 visibleRenderableCount=101.00; 5025:p95=0.00 budget=948.00 visibleRenderableCount=109.00
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
- trace top tasks: CpuProfiler::StartProfiling 72.76ms; RunTask 24.27ms; RunTask 24.27ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:40:41.830Z, lastInputAt=2026-06-19T16:40:48.692Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.5 budget=24; p95FrameMs=17.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=86 budget=100; maxLongTaskMs=86; non-reference runner remains report-only

## normal / phase0-normal / recording-on

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 115.04ms; RunTask 31.75ms; RunTask 31.75ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:41:00.435Z, lastInputAt=2026-06-19T16:41:09.239Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=18.599999999998545 budget=24; p95FrameMs=18.599999999998545; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=128 budget=100; maxLongTaskMs=128; non-reference runner remains report-only

## dense / phase0-dense / recording-on

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 234.07ms; RunTask 93.50ms; RunTask 93.50ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:41:26.306Z, lastInputAt=2026-06-19T16:41:43.224Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.5 budget=24; p95FrameMs=25.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=271 budget=100; maxLongTaskMs=271; non-reference runner remains report-only

## stress / phase0-stress / recording-on

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 24Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 413.40ms; RunTask 159.04ms; RunTask 159.04ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:42:03.649Z, lastInputAt=2026-06-19T16:42:27.209Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.5 budget=24; p95FrameMs=33.5; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=462 budget=100; maxLongTaskMs=462; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 61Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 96.91ms; RunTask 42.40ms; RunTask 42.40ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:42:35.758Z, lastInputAt=2026-06-19T16:42:45.184Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.69999999999891 budget=24; p95FrameMs=25.69999999999891; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=112 budget=100; maxLongTaskMs=112; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 104.41ms; RunTask 75.67ms; RunTask 75.67ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:42:52.436Z, lastInputAt=2026-06-19T16:43:06.952Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=128 budget=100; maxLongTaskMs=128; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 102.97ms; RunTask 71.87ms; RunTask 71.87ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:43:15.256Z, lastInputAt=2026-06-19T16:43:32.434Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.79999999999927 budget=24; p95FrameMs=33.79999999999927; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=122 budget=100; maxLongTaskMs=122; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 109.29ms; RunTask 102.43ms; RunTask 102.43ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:43:41.908Z, lastInputAt=2026-06-19T16:44:09.451Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.700000000004366 budget=24; p95FrameMs=41.700000000004366; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=133 budget=100; maxLongTaskMs=133; non-reference runner remains report-only

## scaling / phase0-scaling / recording-on

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: RunTask 199.53ms; RunTask 199.53ms; ThreadControllerImpl::RunTask 199.50ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:44:20.734Z, lastInputAt=2026-06-19T16:45:03.912Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=488, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=42.099999999998545 budget=24; p95FrameMs=42.099999999998545; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=171 budget=100; maxLongTaskMs=171; non-reference runner remains report-only

## simple / phase0-simple / recording-off

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 119Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 81.12ms; RunTask 24.56ms; RunTask 24.56ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:45:18.153Z, lastInputAt=2026-06-19T16:45:25.033Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=21, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=8 budget=35; staticGlowRedrawCount=8, cameraDependentSyncFrameDelta=21, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=3
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.799999999999272 budget=24; p95FrameMs=17.799999999999272; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=95 budget=100; maxLongTaskMs=95; non-reference runner remains report-only

## normal / phase0-normal / recording-off

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 143.44ms; RunTask 34.66ms; RunTask 34.66ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:45:36.565Z, lastInputAt=2026-06-19T16:45:45.350Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=18.299999999999272 budget=24; p95FrameMs=18.299999999999272; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=160 budget=100; maxLongTaskMs=160; non-reference runner remains report-only

## dense / phase0-dense / recording-off

- build: existing-production-electron-build
- seed: phase0-dense-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 252.40ms; RunTask 102.58ms; RunTask 102.58ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:46:02.294Z, lastInputAt=2026-06-19T16:46:19.403Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=7184, panWheelEventCount=22, graphNodeCount=650, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=1597 budget=3000; totalDisplayObjectCount=1597, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.900000000001455 budget=24; p95FrameMs=25.900000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=293 budget=100; maxLongTaskMs=293; non-reference runner remains report-only

## stress / phase0-stress / recording-off

- build: existing-production-electron-build
- seed: phase0-stress-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 24Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 408.19ms; RunTask 153.72ms; RunTask 153.72ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:46:39.810Z, lastInputAt=2026-06-19T16:47:03.130Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=8792, panWheelEventCount=22, graphNodeCount=1300, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: report; actual=3147 budget=3000; totalDisplayObjectCount=3147, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=456 budget=100; maxLongTaskMs=456; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 96.53ms; RunTask 35.73ms; RunTask 35.73ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:47:11.557Z, lastInputAt=2026-06-19T16:47:20.774Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=25.200000000000728 budget=24; p95FrameMs=25.200000000000728; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=109 budget=100; maxLongTaskMs=109; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 90.52ms; RunTask 69.54ms; RunTask 69.54ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:47:27.983Z, lastInputAt=2026-06-19T16:47:42.311Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=109 budget=100; maxLongTaskMs=109; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 112.41ms; RunTask 76.70ms; RunTask 76.70ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:47:50.289Z, lastInputAt=2026-06-19T16:48:07.319Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=1025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=33.400000000001455 budget=24; p95FrameMs=33.400000000001455; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=130 budget=100; maxLongTaskMs=130; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: RunTask 113.93ms; RunTask 113.93ms; ThreadControllerImpl::RunTask 113.91ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:48:16.181Z, lastInputAt=2026-06-19T16:48:43.875Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=2525, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.700000000004366 budget=24; p95FrameMs=41.700000000004366; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=132 budget=100; maxLongTaskMs=132; non-reference runner remains report-only

## scaling / phase0-scaling / recording-off

- build: existing-production-electron-build
- seed: phase0-scaling-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 40Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: RunTask 194.43ms; RunTask 194.43ms; ThreadControllerImpl::RunTask 194.40ms

- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-19T16:48:54.817Z, lastInputAt=2026-06-19T16:49:38.659Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=476, panWheelEventCount=22, graphNodeCount=5025, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=41.80000000000291 budget=24; p95FrameMs=41.80000000000291; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=182 budget=100; maxLongTaskMs=182; non-reference runner remains report-only
