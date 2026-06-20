# Workspace Graph Phase 8 Performance Gate

Generated at 2026-06-18T01:16:12.952Z.

| Scenario | Synthetic scene | Nodes | p95 frame ms | Display objects | Hard failures | Report-only findings |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| small-trackpad | workflow | 3 | 29.30 | 57 | 0 | 1 |

## small-trackpad / workflow

- hard node-drag-recorded: pass; actual=8; nodeDragUpdateCount advanced by 8
- hard idle-wheel-pinch-to-camera-transform-p95-ms: pass; actual=0.5 budget=16; wheelLatencySamples=10, maxEventToCameraUpdateMs=0.5
- hard idle-wheel-pinch-to-rendered-frame-p95-ms: pass; actual=23.799999952316284 budget=32; wheelLatencySamples=10, maxEventToRenderedFrameMs=23.799999952316284
- hard no-semantic-working-set-reads-during-camera-interaction: pass; actual=0 budget=0; workingSetIpcStarts=0, workingSetHttpRequests=0, firstInputAt=2026-06-18T01:16:07.081Z, lastInputAt=2026-06-18T01:16:11.188Z
- hard no-full-graph-label-sync-per-pan-wheel-event: pass; actual=0 budget=0; cameraMovingLabelSyncDelta=0, labelSyncDelta=56, panWheelEventCount=17, graphNodeCount=3, materializedLabelCount=3
- hard static-glow-not-redrawn-per-pan-wheel-event: pass; actual=10 budget=24; staticGlowRedrawCount=10, cameraDependentSyncFrameDelta=10, nodeDragMoveEvents=8
- hard materialized-node-count-scales-with-visible-nodes: pass; actual=3 budget=96; materializedNodeCount=3, visibleMaterializedNodeCount=2
- hard display-object-count-budget: pass; actual=57 budget=3000; totalDisplayObjectCount=57, materializedNodeCount=3
- report-only normal-scene-p95-pan-zoom-frame-ms: report; actual=29.30000001192093 budget=24; p95FrameMs=29.30000001192093; noisy threshold remains report-only
- hard no-long-task-over-100ms: pass; actual=76 budget=100; maxLongTaskMs=76

