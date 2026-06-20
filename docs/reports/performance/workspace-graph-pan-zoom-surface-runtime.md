# Workspace Graph Pan/Zoom Surface Runtime

This append-only report tracks the pan/zoom surface-runtime phases for
`docs/plans/workspace_graph_pan_zoom_surface_runtime_refactor_plan.md`.

Regenerate the Phase 3 on/off recording matrix from a production Electron build
with:

```bash
pnpm --dir desktop build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario phase3 --skip-build --keep-artifacts --write-report
```

Parse an existing pan/zoom artifact root into the same report vocabulary without
rerunning Electron with:

```bash
node desktop/tests/electron/workflow-graph-pan-zoom-performance-report.mjs --artifact-root <artifact-root> --phase phase7 --write-report
```

The `stress` workload is report-only for timing until `normal` passes
reliably. Non-reference machines enforce structural gates and emit timing
reports; timing thresholds are not used as cross-hardware proof.

Phase 0 instrumentation captures:

- wheel handler, camera update, event delivery, and first-Pixi-render proxy
  timing from renderer samples and user timing marks; compositor presented-frame
  budgets stay blocked until a presentation trace source is wired;
- frame p50/p95/p99/max timing, camera-frame scene visits, display object
  counts, deferred work by lane, and Pixi render buckets from workflow graph
  debug snapshots;
- active renderer lifecycle evidence through renderer instance, canvas
  creation, and destroy counters;
- pane chrome DOM mutations by owner and causal source through a
  MutationObserver installed only by the Electron recorder;
- React Profiler commits by surface and causal source while the recorder is
  active;
- CDP trace summaries naming the largest complete events and top-level tasks.

Archived early runs capture the diagnostic baseline. Current runs track Phase 7
parser output for the controller-owned surface runtime, explicit frame owner,
and typed presentation gates.

Earlier runs from this date were split into archive files to keep each report under
the repository file-length limit:

- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-early.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-mid.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-late.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-phase1-ready.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260619-phase3-pre-phase5.md`
- `workspace-graph-pan-zoom-surface-runtime-archive-20260620-phase3-pre-phase7.md`

## Run 2026-06-20T01:12:40.680Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-phase3/20260619T173938Z`

Phase 7 report status: passed

Source: artifact-parser

## Pan/Zoom Diagnosis

| Scenario | Recording |                                                                                       Interactions | Diagnosis      | p95 delivery ms | p95 handler ms | p95 camera commit ms | p95 first Pixi render proxy ms | input-to-presented-frame | frame p50/p95/p99/max ms   | Renderer duplicates | Camera DOM writes | Camera React commits | Scene replacements | Deferred work           | Top blocker                          |
| -------- | --------- | -------------------------------------------------------------------------------------------------: | -------------- | --------------: | -------------: | -------------------: | -----------------------------: | ------------------------ | -------------------------- | ------------------: | ----------------: | -------------------: | -----------------: | ----------------------- | ------------------------------------ |
| simple   | off       | 21/37 (pointer-pan#sample-16, pointer-pan#sample-17, pointer-pan#sample-18, pointer-pan#sample-19) | event delivery |           59.40 |           0.60 |                 0.20 |                          60.50 | unavailable              | 16.30/18.60/25.10/25.10    |                   0 |                 0 |                    0 |                  0 | label-position-sync:63  | CpuProfiler::StartProfiling 85.93ms  |
| normal   | off       |                                                                                     1/1 (wheel#38) | event delivery |           75.40 |           0.60 |                 0.20 |                          78.60 | unavailable              | 16.90/26.50/33.50/33.50    |                   0 |                 0 |                    0 |                  0 | label-position-sync:125 | CpuProfiler::StartProfiling 103.67ms |
| dense    | off       |                                                                                     1/1 (wheel#38) | event delivery |          174.40 |           0.60 |                 0.20 |                         188.30 | unavailable              | 26.20/48.30/58.60/58.60    |                   0 |                 0 |                    0 |                  0 | label-position-sync:650 | CpuProfiler::StartProfiling 301.40ms |
| stress   | off       |                                                                                     1/1 (wheel#38) | event delivery |          203.20 |           0.70 |                 0.40 |                         221.40 | unavailable              | 33.20/81.80/135.00/135.00  |                   0 |                 0 |                    0 |                  0 | label-position-sync:916 | CpuProfiler::StartProfiling 391.20ms |
| scaling  | off       |                                                                           2/2 (wheel#37, wheel#38) | event delivery |           93.80 |           0.60 |                 0.20 |                          94.80 | unavailable              | 18.00/34.40/40.00/40.00    |                   0 |                 0 |                    0 |                  0 | label-position-sync:47  | CpuProfiler::StartProfiling 102.23ms |
| scaling  | off       |                                                                 3/3 (wheel#36, wheel#37, wheel#38) | event delivery |          160.20 |           0.60 |                 0.30 |                         161.10 | unavailable              | 33.20/65.60/91.50/91.50    |                   0 |                 0 |                    0 |                  0 | label-position-sync:47  | CpuProfiler::StartProfiling 103.53ms |
| scaling  | off       |                                                                 3/3 (wheel#36, wheel#37, wheel#38) | event delivery |          176.50 |           0.60 |                 0.30 |                         177.70 | unavailable              | 32.20/83.50/134.70/134.70  |                   0 |                 0 |                    0 |                  0 | label-position-sync:47  | CpuProfiler::StartProfiling 98.82ms  |
| scaling  | off       |                                                                 3/3 (wheel#36, wheel#37, wheel#38) | event delivery |          291.70 |           0.70 |                 0.30 |                         293.20 | unavailable              | 35.20/166.60/214.70/214.70 |                   0 |                 0 |                    0 |                  0 | label-position-sync:48  | RunTask 102.30ms                     |
| scaling  | off       |       22/38 (wheel#sample-14, pointer-pan#sample-17, pointer-pan#sample-18, pointer-pan#sample-19) | event delivery |          376.40 |           0.60 |                 0.40 |                         377.80 | unavailable              | 41.00/241.70/258.20/258.20 |                   0 |                 0 |                    0 |                  0 | label-position-sync:47  | RunTask 202.16ms                     |
| simple   | on        |                                                                                     1/1 (wheel#37) | event delivery |           46.60 |           0.40 |                 0.10 |                          47.10 | unavailable              | 16.10/18.50/25.90/25.90    |                   0 |                 0 |                    0 |                  0 | label-position-sync:63  | CpuProfiler::StartProfiling 80.88ms  |
| normal   | on        |                                                                                     1/1 (wheel#38) | event delivery |           75.10 |           0.70 |                 0.40 |                          78.50 | unavailable              | 16.90/25.70/32.90/32.90    |                   0 |                 0 |                    0 |                  0 | label-position-sync:125 | CpuProfiler::StartProfiling 118.87ms |
| dense    | on        |       22/38 (wheel#sample-14, pointer-pan#sample-17, pointer-pan#sample-18, pointer-pan#sample-19) | event delivery |          177.70 |           0.60 |                 0.20 |                         191.00 | unavailable              | 25.50/50.20/59.80/59.80    |                   0 |                 0 |                    0 |                  0 | label-position-sync:650 | CpuProfiler::StartProfiling 378.70ms |
| stress   | on        |                                                                                     1/1 (wheel#38) | event delivery |          207.10 |           0.60 |                 0.30 |                         224.80 | unavailable              | 33.20/83.00/125.10/125.10  |                   0 |                 0 |                    0 |                  0 | label-position-sync:916 | CpuProfiler::StartProfiling 408.12ms |
| scaling  | on        |                                                                           2/2 (wheel#37, wheel#38) | event delivery |           87.30 |           0.60 |                 0.20 |                          88.10 | unavailable              | 18.50/34.60/41.60/41.60    |                   0 |                 0 |                    0 |                  0 | label-position-sync:48  | CpuProfiler::StartProfiling 104.01ms |
| scaling  | on        |                                                                 3/3 (wheel#36, wheel#37, wheel#38) | event delivery |          167.30 |           0.60 |                 0.40 |                         168.70 | unavailable              | 27.00/66.60/83.70/83.70    |                   0 |                 0 |                    0 |                  0 | label-position-sync:48  | CpuProfiler::StartProfiling 98.26ms  |
| scaling  | on        |                                                                 3/3 (wheel#36, wheel#37, wheel#38) | event delivery |          174.80 |           0.70 |                 0.30 |                         175.70 | unavailable              | 31.60/83.10/131.80/131.80  |                   0 |                 0 |                    0 |                  0 | label-position-sync:48  | CpuProfiler::StartProfiling 109.86ms |
| scaling  | on        |                                                                 3/3 (wheel#36, wheel#37, wheel#38) | event delivery |          292.30 |           0.70 |                 0.30 |                         293.50 | unavailable              | 35.30/167.80/256.70/256.70 |                   0 |                 0 |                    0 |                  0 | label-position-sync:48  | RunTask 103.04ms                     |
| scaling  | on        |                                                                                     1/1 (wheel#38) | event delivery |          325.60 |           0.60 |                 0.30 |                         327.00 | unavailable              | 42.10/249.90/259.90/259.90 |                   0 |                 0 |                    0 |                  0 | label-position-sync:48  | RunTask 207.54ms                     |

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task                       | Hard failures | Report-only findings |
| -------- | --------- | --------------- | ----: | -----------: | --------------: | -----------------------------: | ------------------------: | --------------: | -----------------: | -------------------: | ------------------------------------ | ------------: | -------------------: |
| simple   | off       | phase0-simple   |     3 |        17.60 |           59.40 |                          60.50 |             3.00 / 544.00 |              58 |                  0 |                    0 | CpuProfiler::StartProfiling 85.93ms  |             0 |                    1 |
| normal   | off       | phase0-normal   |   125 |        25.20 |           75.40 |                          78.60 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 103.67ms |             0 |                    3 |
| dense    | off       | phase0-dense    |   650 |        26.40 |          174.40 |                         188.30 |            0.00 / 1772.00 |            1597 |                  0 |                    0 | CpuProfiler::StartProfiling 301.40ms |             0 |                    3 |
| stress   | off       | phase0-stress   |  1300 |        33.50 |          203.20 |                         221.40 |            0.00 / 3012.00 |            3147 |                  0 |                    0 | CpuProfiler::StartProfiling 391.20ms |             0 |                    4 |
| scaling  | off       | phase0-scaling  |   125 |        25.30 |           93.80 |                          94.80 |             0.00 / 856.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 102.23ms |             0 |                    3 |
| scaling  | off       | phase0-scaling  |   525 |        33.40 |          160.20 |                         161.10 |             0.00 / 872.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 103.53ms |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  1025 |        33.40 |          176.50 |                         177.70 |             0.00 / 892.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 98.82ms  |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  2525 |        41.80 |          291.70 |                         293.20 |             0.00 / 772.00 |             347 |                  0 |                    0 | RunTask 102.30ms                     |             0 |                    3 |
| scaling  | off       | phase0-scaling  |  5025 |        41.90 |          376.40 |                         377.80 |             0.00 / 948.00 |             347 |                  0 |                    0 | RunTask 202.16ms                     |             0 |                    3 |
| simple   | on        | phase0-simple   |     3 |        17.90 |           46.60 |                          47.10 |             3.00 / 544.00 |              58 |                  0 |                    0 | CpuProfiler::StartProfiling 80.88ms  |             0 |                    1 |
| normal   | on        | phase0-normal   |   125 |        25.00 |           75.10 |                          78.50 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 118.87ms |             0 |                    3 |
| dense    | on        | phase0-dense    |   650 |        25.40 |          177.70 |                         191.00 |            0.00 / 1772.00 |            1597 |                  0 |                    0 | CpuProfiler::StartProfiling 378.70ms |             0 |                    3 |
| stress   | on        | phase0-stress   |  1300 |        33.40 |          207.10 |                         224.80 |            0.00 / 3012.00 |            3147 |                  0 |                    0 | CpuProfiler::StartProfiling 408.12ms |             0 |                    4 |
| scaling  | on        | phase0-scaling  |   125 |        25.80 |           87.30 |                          88.10 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 104.01ms |             0 |                    3 |
| scaling  | on        | phase0-scaling  |   525 |        33.30 |          167.30 |                         168.70 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 98.26ms  |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  1025 |        34.20 |          174.80 |                         175.70 |             0.00 / 772.00 |             347 |                  0 |                    0 | CpuProfiler::StartProfiling 109.86ms |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  2525 |        41.70 |          292.30 |                         293.50 |             0.00 / 772.00 |             347 |                  0 |                    0 | RunTask 103.04ms                     |             0 |                    3 |
| scaling  | on        | phase0-scaling  |  5025 |        42.80 |          325.60 |                         327.00 |             0.00 / 772.00 |             347 |                  0 |                    0 | RunTask 207.54ms                     |             0 |                    3 |

## Matrix Checks

- hard scaling-required-scene-visit-counters-present-off: pass; actual=0 budget=0; recording=off; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget-off: pass; actual=0 budget=0; recording=off; 125:p95=0.00 budget=856.00 visibleRenderableCount=86.00; 525:p95=0.00 budget=872.00 visibleRenderableCount=90.00; 1025:p95=0.00 budget=892.00 visibleRenderableCount=95.00; 2525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=0.00 budget=948.00 visibleRenderableCount=109.00
- hard scaling-scene-visits-grow-under-five-percent-off: pass; actual=0 budget=0.05; recording=off; smallest=125:0, largest=5025:0, growth=0.00
- hard scaling-required-scene-visit-counters-present-on: pass; actual=0 budget=0; recording=on; scalingRuns=5, missing=none
- hard scaling-scene-visits-within-visible-renderable-budget-on: pass; actual=0 budget=0; recording=on; 125:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 1025:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 2525:p95=0.00 budget=772.00 visibleRenderableCount=65.00; 5025:p95=0.00 budget=772.00 visibleRenderableCount=65.00
- hard scaling-scene-visits-grow-under-five-percent-on: pass; actual=0 budget=0.05; recording=on; smallest=125:0, largest=5025:0, growth=0.00

## simple / phase0-simple / recording-off

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 119Hz
- recording/debug: off / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 85.93ms; RunTask 24.62ms; RunTask 24.62ms
- interaction ids: pointer-hover#sample-1, node-drag-hover#sample-2, node-drag-down#sample-3, node-drag#sample-4, node-drag#sample-5, node-drag#sample-6, node-drag#sample-7, node-drag#sample-8, node-drag#sample-9, node-drag#sample-10, node-drag#sample-11, node-drag-up#sample-12, pointer-select#sample-13, pointer-move#sample-14, pointer-down#sample-15, pointer-pan#sample-16
- timing: delivery p50/p95/max=43.00/59.40/59.40ms; handler p95=0.60ms; camera commit p95=0.20ms; first Pixi render proxy p95=60.50ms; input-to-presented=unavailable; frame p50/p95/p99/max=16.30/18.60/25.10/25.10ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=3.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=58; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:63
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#38
- timing: delivery p50/p95/max=64.00/75.40/75.40ms; handler p95=0.60ms; camera commit p95=0.20ms; first Pixi render proxy p95=78.60ms; input-to-presented=unavailable; frame p50/p95/p99/max=16.90/26.50/33.50/33.50ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-hover|attributes|style=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:125
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#38
- timing: delivery p50/p95/max=83.80/174.40/174.40ms; handler p95=0.60ms; camera commit p95=0.20ms; first Pixi render proxy p95=188.30ms; input-to-presented=unavailable; frame p50/p95/p99/max=26.20/48.30/58.60/58.60ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=1597; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-hover|attributes|style=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:650
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#38
- timing: delivery p50/p95/max=78.50/203.20/203.20ms; handler p95=0.70ms; camera commit p95=0.40ms; first Pixi render proxy p95=221.40ms; input-to-presented=unavailable; frame p50/p95/p99/max=33.20/81.80/135.00/135.00ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=3147; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-hover|attributes|style=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:916
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#37, wheel#38
- timing: delivery p50/p95/max=60.20/93.80/93.80ms; handler p95=0.60ms; camera commit p95=0.20ms; first Pixi render proxy p95=94.80ms; input-to-presented=unavailable; frame p50/p95/p99/max=18.00/34.40/40.00/40.00ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:node-drag|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-select|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-move|attributes|style=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:47
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#36, wheel#37, wheel#38
- timing: delivery p50/p95/max=108.90/160.20/160.20ms; handler p95=0.60ms; camera commit p95=0.30ms; first Pixi render proxy p95=161.10ms; input-to-presented=unavailable; frame p50/p95/p99/max=33.20/65.60/91.50/91.50ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:node-drag|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-select|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-move|attributes|style=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:47
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#36, wheel#37, wheel#38
- timing: delivery p50/p95/max=106.50/176.50/176.50ms; handler p95=0.60ms; camera commit p95=0.30ms; first Pixi render proxy p95=177.70ms; input-to-presented=unavailable; frame p50/p95/p99/max=32.20/83.50/134.70/134.70ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:node-drag|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-select|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-move|attributes|style=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:47
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#36, wheel#37, wheel#38
- timing: delivery p50/p95/max=120.20/291.70/291.70ms; handler p95=0.70ms; camera commit p95=0.30ms; first Pixi render proxy p95=293.20ms; input-to-presented=unavailable; frame p50/p95/p99/max=35.20/166.60/214.70/214.70ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:48
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: pointer-hover#sample-1, node-drag-hover#sample-2, node-drag-down#sample-3, node-drag#sample-4, node-drag#sample-5, node-drag#sample-6, node-drag#sample-7, node-drag#sample-8, node-drag#sample-9, node-drag#sample-10, node-drag#sample-11, node-drag-up#sample-12, pointer-select#sample-13, wheel#sample-14, pointer-move#sample-15, pointer-down#sample-16
- timing: delivery p50/p95/max=146.90/376.40/376.40ms; handler p95=0.60ms; camera commit p95=0.40ms; first Pixi render proxy p95=377.80ms; input-to-presented=unavailable; frame p50/p95/p99/max=41.00/241.70/258.20/258.20ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:node-drag|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-select|attributes|style=1; workspace-pane-host|pane-host|workspace_pane_2|workspace_surface_2|interaction:pointer-move|attributes|style=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:47
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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

## simple / phase0-simple / recording-on

- build: existing-production-electron-build
- seed: phase0-simple-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 119Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 80.88ms; RunTask 24.20ms; RunTask 24.20ms
- interaction ids: wheel#37
- timing: delivery p50/p95/max=43.30/46.60/46.60ms; handler p95=0.40ms; camera commit p95=0.10ms; first Pixi render proxy p95=47.10ms; input-to-presented=unavailable; frame p50/p95/p99/max=16.10/18.50/25.90/25.90ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=3.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=58; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:63
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#38
- timing: delivery p50/p95/max=65.90/75.10/75.10ms; handler p95=0.70ms; camera commit p95=0.40ms; first Pixi render proxy p95=78.50ms; input-to-presented=unavailable; frame p50/p95/p99/max=16.90/25.70/32.90/32.90ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:125
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: pointer-hover#sample-1, node-drag-hover#sample-2, node-drag-down#sample-3, node-drag#sample-4, node-drag#sample-5, node-drag#sample-6, node-drag#sample-7, node-drag#sample-8, node-drag#sample-9, node-drag#sample-10, node-drag#sample-11, node-drag-up#sample-12, pointer-select#sample-13, wheel#sample-14, pointer-move#sample-15, pointer-down#sample-16
- timing: delivery p50/p95/max=91.70/177.70/177.70ms; handler p95=0.60ms; camera commit p95=0.20ms; first Pixi render proxy p95=191.00ms; input-to-presented=unavailable; frame p50/p95/p99/max=25.50/50.20/59.80/59.80ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=1597; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:650
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#38
- timing: delivery p50/p95/max=77.90/207.10/207.10ms; handler p95=0.60ms; camera commit p95=0.30ms; first Pixi render proxy p95=224.80ms; input-to-presented=unavailable; frame p50/p95/p99/max=33.20/83.00/125.10/125.10ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=3147; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:916
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#37, wheel#38
- timing: delivery p50/p95/max=65.10/87.30/87.30ms; handler p95=0.60ms; camera commit p95=0.20ms; first Pixi render proxy p95=88.10ms; input-to-presented=unavailable; frame p50/p95/p99/max=18.50/34.60/41.60/41.60ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:48
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#36, wheel#37, wheel#38
- timing: delivery p50/p95/max=106.10/167.30/167.30ms; handler p95=0.60ms; camera commit p95=0.40ms; first Pixi render proxy p95=168.70ms; input-to-presented=unavailable; frame p50/p95/p99/max=27.00/66.60/83.70/83.70ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:48
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#36, wheel#37, wheel#38
- timing: delivery p50/p95/max=134.40/174.80/174.80ms; handler p95=0.70ms; camera commit p95=0.30ms; first Pixi render proxy p95=175.70ms; input-to-presented=unavailable; frame p50/p95/p99/max=31.60/83.10/131.80/131.80ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:48
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#36, wheel#37, wheel#38
- timing: delivery p50/p95/max=128.70/292.30/292.30ms; handler p95=0.70ms; camera commit p95=0.30ms; first Pixi render proxy p95=293.50ms; input-to-presented=unavailable; frame p50/p95/p99/max=35.30/167.80/256.70/256.70ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:48
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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
- interaction ids: wheel#38
- timing: delivery p50/p95/max=146.70/325.60/325.60ms; handler p95=0.60ms; camera commit p95=0.30ms; first Pixi render proxy p95=327.00ms; input-to-presented=unavailable; frame p50/p95/p99/max=42.10/249.90/259.90/259.90ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:48
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot

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

## Run 2026-06-20T02:13:46.642Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-small-trackpad/20260620T021335Z`

Phase 1 readiness: ready


Source: artifact-parser

## Pan/Zoom Diagnosis

| Scenario | Recording | Interactions | Diagnosis | p95 delivery ms | p95 handler ms | p95 camera commit ms | p95 first Pixi render proxy ms | input-to-presented-frame | frame p50/p95/p99/max ms | Renderer duplicates | Camera DOM writes | Camera React commits | Scene replacements | Deferred work | Top blocker |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| small-trackpad | on | 2/2 (wheel-burst#14, wheel-burst#15) | event delivery | 53.90 | 0.80 | 0.30 | 66.70 | unavailable | 17.50/1141.60/5183.40/5183.40 | 0 | 0 | 0 | 0 | label-position-sync:39 | CpuProfiler::StartProfiling 71.00ms |

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task | Hard failures | Report-only findings |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| small-trackpad | on | workflow | 3 | 1141.60 | 53.90 | 66.70 | 3.00 / 544.00 | 58 | 0 | 0 | CpuProfiler::StartProfiling 71.00ms | 0 | 2 |

## Matrix Checks



## small-trackpad / workflow / recording-on

- build: existing-production-electron-build
- seed: not-recorded
- warm-up/repetitions: not-recorded / not-recorded
- viewport/DPR/refresh: 1280x820 / 2 / 120Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 71.00ms; RunTask 25.53ms; RunTask 25.53ms
- interaction ids: wheel-burst#14, wheel-burst#15
- timing: delivery p50/p95/max=40.40/53.90/53.90ms; handler p95=0.80ms; camera commit p95=0.30ms; first Pixi render proxy p95=66.70ms; input-to-presented=unavailable; frame p50/p95/p99/max=17.50/1141.60/5183.40/5183.40ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=3.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=58; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|aria-disabled=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|aria-label=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|disabled=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|title=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|interaction:node-drag-down|attributes|aria-disabled=1; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|interaction:node-drag-down|attributes|aria-label=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:39
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot


- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- report-only idle-wheel-pinch-to-camera-transform-p95-ms: pass; actual=0.7000000476837158 budget=16; wheelLatencySamples=13, maxEventToCameraUpdateMs=0.7000000476837158
- report-only idle-wheel-pinch-to-first-pixi-render-proxy-p95-ms: pass; actual=16.200000047683716 budget=32; wheelLatencySamples=13, maxEventToFirstPixiRenderAfterCameraMs=16.200000047683716; this is a Pixi postrender proxy, not compositor presentation
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-20T02:13:42.651Z, lastInputAt=2026-06-20T02:13:45.061Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=68, panWheelEventCount=17, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=14 budget=27; staticGlowRedrawCount=14, cameraDependentSyncFrameDelta=13, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=2
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=1141.6000000000001 budget=24; p95FrameMs=1141.6000000000001; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=84 budget=100; maxLongTaskMs=84; non-reference runner remains report-only


## Run 2026-06-20T02:17:50.952Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-normal/20260620T021729Z`

Phase 1 readiness: ready


Source: artifact-parser

## Pan/Zoom Diagnosis

| Scenario | Recording | Interactions | Diagnosis | p95 delivery ms | p95 handler ms | p95 camera commit ms | p95 first Pixi render proxy ms | input-to-presented-frame | frame p50/p95/p99/max ms | Renderer duplicates | Camera DOM writes | Camera React commits | Scene replacements | Deferred work | Top blocker |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| normal | on | 1/1 (wheel#38) | event delivery | 78.20 | 0.70 | 0.40 | 82.50 | unavailable | 16.80/25.50/34.10/34.10 | 0 | 0 | 0 | 0 | label-position-sync:125 | CpuProfiler::StartProfiling 127.12ms |

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task | Hard failures | Report-only findings |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| normal | on | phase0-normal | 125 | 17.70 | 78.20 | 82.50 | 0.00 / 772.00 | 347 | 0 | 0 | CpuProfiler::StartProfiling 127.12ms | 0 | 2 |

## Matrix Checks



## normal / phase0-normal / recording-on

- build: existing-production-electron-build
- seed: phase0-normal-v1
- warm-up/repetitions: 1 / 1
- viewport/DPR/refresh: 1440x900 / 2 / 60Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 127.12ms; RunTask 31.99ms; RunTask 31.99ms
- interaction ids: wheel#38
- timing: delivery p50/p95/max=63.90/78.20/78.20ms; handler p95=0.70ms; camera commit p95=0.40ms; first Pixi render proxy p95=82.50ms; input-to-presented=unavailable; frame p50/p95/p99/max=16.80/25.50/34.10/34.10ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=0.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=347; drawCalls=not-instrumented
- DOM mutations by owner/source: none
- React commits by owner/source: none
- deferred work by lane: label-position-sync:125
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot


- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=1
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=1, afterRendererInstanceId=1
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-20T02:17:38.907Z, lastInputAt=2026-06-20T02:17:47.881Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=1508, panWheelEventCount=22, graphNodeCount=125, materializedLabelCount=1
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=9 budget=36; staticGlowRedrawCount=9, cameraDependentSyncFrameDelta=22, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=0 budget=96; materializedNodeCount=0, visibleMaterializedNodeCount=0
- report-only supplemental-display-object-count-budget: pass; actual=347 budget=3000; totalDisplayObjectCount=347, materializedNodeCount=0; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=17.700000000000728 budget=24; p95FrameMs=17.700000000000728; noisy threshold remains report-only
- report-only no-long-task-over-100ms: report; actual=141 budget=100; maxLongTaskMs=141; non-reference runner remains report-only

## Run 2026-06-21T00:06:34.716Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-small-trackpad/20260621T000620Z`

Phase 1 readiness: ready


Source: artifact-parser

## Pan/Zoom Diagnosis

| Scenario | Recording | Interactions | Diagnosis | p95 delivery ms | p95 handler ms | p95 camera commit ms | p95 first Pixi render proxy ms | input-to-presented-frame | frame p50/p95/p99/max ms | Renderer duplicates | Camera DOM writes | Camera React commits | Scene replacements | Deferred work | Top blocker |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| small-trackpad | on | 2/2 (wheel-burst#14, wheel-burst#15) | event delivery | 72.20 | 0.50 | 0.20 | 82.50 | unavailable | 17.50/1100.00/5186.70/5186.70 | 0 | 0 | 0 | 0 | label-position-sync:39 | CpuProfiler::StartProfiling 74.40ms |

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task | Hard failures | Report-only findings |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| small-trackpad | on | workflow | 3 | 1100.00 | 72.20 | 82.50 | 3.00 / 544.00 | 58 | 0 | 0 | CpuProfiler::StartProfiling 74.40ms | 0 | 2 |

## Matrix Checks



## small-trackpad / workflow / recording-on

- build: existing-production-electron-build
- seed: not-recorded
- warm-up/repetitions: not-recorded / not-recorded
- viewport/DPR/refresh: 1280x820 / 2 / 120Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 74.40ms; RunTask 28.56ms; RunTask 28.56ms
- interaction ids: wheel-burst#14, wheel-burst#15
- timing: delivery p50/p95/max=37.50/72.20/72.20ms; handler p95=0.50ms; camera commit p95=0.20ms; first Pixi render proxy p95=82.50ms; input-to-presented=unavailable; frame p50/p95/p99/max=17.50/1100.00/5186.70/5186.70ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=3.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=58; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|aria-disabled=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|aria-label=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|disabled=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|title=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|interaction:node-drag-down|attributes|aria-disabled=1; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|interaction:node-drag-down|attributes|aria-label=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:39
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot


- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- report-only idle-wheel-pinch-to-camera-transform-p95-ms: pass; actual=0.7000000476837158 budget=16; wheelLatencySamples=13, maxEventToCameraUpdateMs=0.7000000476837158
- report-only idle-wheel-pinch-to-first-pixi-render-proxy-p95-ms: pass; actual=21.100000023841858 budget=32; wheelLatencySamples=13, maxEventToFirstPixiRenderAfterCameraMs=21.100000023841858; this is a Pixi postrender proxy, not compositor presentation
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-21T00:06:27.639Z, lastInputAt=2026-06-21T00:06:30.016Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=68, panWheelEventCount=17, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=14 budget=27; staticGlowRedrawCount=14, cameraDependentSyncFrameDelta=13, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=2
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=1100 budget=24; p95FrameMs=1100; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=89 budget=100; maxLongTaskMs=89; non-reference runner remains report-only


## Run 2026-06-21T00:24:13.427Z

Artifact root: `/Users/kevin/Documents/AppDevelopment/setta/.recordings/workflow-graph-pan-zoom-small-trackpad/20260621T002403Z`

Phase 1 readiness: ready


Source: artifact-parser

## Pan/Zoom Diagnosis

| Scenario | Recording | Interactions | Diagnosis | p95 delivery ms | p95 handler ms | p95 camera commit ms | p95 first Pixi render proxy ms | input-to-presented-frame | frame p50/p95/p99/max ms | Renderer duplicates | Camera DOM writes | Camera React commits | Scene replacements | Deferred work | Top blocker |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| small-trackpad | on | 1/1 (wheel-burst#15) | event delivery | 55.60 | 0.60 | 0.30 | 73.30 | unavailable | 17.10/1091.70/5057.50/5057.50 | 0 | 0 | 0 | 0 | label-position-sync:45 | CpuProfiler::StartProfiling 64.07ms |

| Scenario | Recording | Synthetic scene | Nodes | p95 frame ms | p95 delivery ms | p95 first Pixi render proxy ms | Scene visits p95 / budget | Display objects | Camera pane writes | Camera React commits | Top trace task | Hard failures | Report-only findings |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| small-trackpad | on | workflow | 3 | 1091.70 | 55.60 | 73.30 | 3.00 / 544.00 | 58 | 0 | 0 | CpuProfiler::StartProfiling 64.07ms | 0 | 2 |

## Matrix Checks



## small-trackpad / workflow / recording-on

- build: existing-production-electron-build
- seed: not-recorded
- warm-up/repetitions: not-recorded / not-recorded
- viewport/DPR/refresh: 1280x820 / 2 / 120Hz
- recording/debug: on / on
- timing thresholds: report-only
- trace top tasks: CpuProfiler::StartProfiling 64.07ms; RunTask 31.77ms; RunTask 31.77ms
- interaction ids: wheel-burst#15
- timing: delivery p50/p95/max=39.20/55.60/55.60ms; handler p95=0.60ms; camera commit p95=0.30ms; first Pixi render proxy p95=73.30ms; input-to-presented=unavailable; frame p50/p95/p99/max=17.10/1091.70/5057.50/5057.50ms
- scene visits: settaOwnedLayerVisits p95=0.00, graphObjectsConsidered p95=0.00, cullCandidatesChecked p95=0.00, displayObjectsTraversed p95=0.00, labelsConsidered p95=3.00, boundsCalculations p95=0.00
- supplemental render: renderedObjects=58; drawCalls=not-instrumented
- DOM mutations by owner/source: workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|aria-disabled=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|aria-label=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|disabled=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|unattributed|attributes|title=2; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|interaction:node-drag-down|attributes|aria-disabled=1; workspace-pane-host|pane-host|workspace_pane_4|workspace_surface_4|interaction:node-drag-down|attributes|aria-label=1
- React commits by owner/source: none
- deferred work by lane: label-position-sync:45
- graph scene replacements: 0
- draw calls: not instrumented in the current Pixi debug snapshot


- hard one-active-renderer-for-focused-graph-surface: pass; actual=0 budget=0; duplicateRendererSamples=0, maxCanvasCountForSurface=1, maxActiveRendererCount=2
- hard no-renderer-instance-replacement-during-interaction: pass; actual=0 budget=0; beforeRendererInstanceId=2, afterRendererInstanceId=2
- hard no-graph-app-creation-during-camera-interaction: pass; actual=0 budget=0; canvasCreationDelta=0, rendererDestroyDelta=0
- hard no-camera-caused-workspace-presentation-writes: pass; actual=0 budget=0; cameraCausedPaneMutations=0
- hard no-camera-caused-graph-react-commits: pass; actual=0 budget=0; cameraCausedReactCommits=0, totalReactCommits=0
- hard no-camera-caused-full-graph-replacement: pass; actual=0 budget=0; graphSceneReplacementCount=0
- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- report-only idle-wheel-pinch-to-camera-transform-p95-ms: pass; actual=0.6000000238418579 budget=16; wheelLatencySamples=15, maxEventToCameraUpdateMs=0.6000000238418579
- report-only idle-wheel-pinch-to-first-pixi-render-proxy-p95-ms: pass; actual=18.299999952316284 budget=32; wheelLatencySamples=15, maxEventToFirstPixiRenderAfterCameraMs=18.299999952316284; this is a Pixi postrender proxy, not compositor presentation
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-21T00:24:09.415Z, lastInputAt=2026-06-21T00:24:11.691Z
- report-only input-to-presented-frame-budget-blocked: report; actual=null; no compositor presentation trace source is wired yet; first-Pixi-render metrics remain proxy evidence only
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=68, panWheelEventCount=17, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=14 budget=29; staticGlowRedrawCount=14, cameraDependentSyncFrameDelta=15, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=2
- report-only supplemental-display-object-count-budget: pass; actual=58 budget=3000; totalDisplayObjectCount=58, materializedNodeCount=3; supplemental only, not a CPU scene-visit substitute
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=1091.7 budget=24; p95FrameMs=1091.7; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=77 budget=100; maxLongTaskMs=77; non-reference runner remains report-only
