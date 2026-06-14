# Workspace Graph Phase 8 Performance Gate

Generated at 2026-06-18T00:51:07.141Z.

| Scenario | Synthetic scene | Nodes | p95 frame ms | Display objects | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| small-trackpad | workflow | 3 | 20.80 | 57 | 0 | 0 |

## small-trackpad / workflow

- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard idle-wheel-pinch-to-camera-transform-p95-ms: pass; actual=0.30000001192092896 budget=16; wheelLatencySamples=11, maxEventToCameraUpdateMs=0.30000001192092896
- hard idle-wheel-pinch-to-rendered-frame-p95-ms: pass; actual=12.699999988079071 budget=32; wheelLatencySamples=11, maxEventToRenderedFrameMs=12.699999988079071
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-18T00:51:02.299Z, lastInputAt=2026-06-18T00:51:05.500Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=17, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=10 budget=25; staticGlowRedrawCount=10, cameraDependentSyncFrameDelta=11, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=2
- hard display-object-count-budget: pass; actual=57 budget=3000; totalDisplayObjectCount=57, materializedNodeCount=3
- report-only normal-scene-p95-pan-zoom-frame-ms: pass; actual=20.80000001192093 budget=24; p95FrameMs=20.80000001192093; noisy threshold remains report-only
- hard no-long-task-over-100ms: pass; actual=59 budget=100; maxLongTaskMs=59

