# Workspace Graph Phase 8 Performance Gate

Generated at 2026-06-17T03:44:09.553Z.

| Scenario | Synthetic scene | Nodes | p95 frame ms | Display objects | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| small-trackpad | workflow | 3 | 28.00 | 57 | 0 | 2 |

## small-trackpad / workflow

- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- report-only no-full-graph-label-sync-per-pan-wheel-event: report; actual=86 budget=12.75; labelSyncDelta=86, panWheelEventCount=17, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=10 budget=24; staticGlowRedrawCount=10, cameraDependentSyncFrameDelta=10, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=2
- hard display-object-count-budget: pass; actual=57 budget=3000; totalDisplayObjectCount=57, materializedNodeCount=3
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=28 budget=24; p95FrameMs=28; noisy threshold remains report-only
- report-only no-long-task-over-100ms: pass; actual=75 budget=100; maxLongTaskMs=75; browser long-task observer remains report-only

