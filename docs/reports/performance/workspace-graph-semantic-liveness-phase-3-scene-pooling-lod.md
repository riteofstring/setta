# Workspace Graph Semantic Liveness Phase 3 Scene Pooling And LOD

Date: 2026-06-16

## Scope

Phase 3 implementation and measurement for the now-removed workspace graph
semantic liveness plan.

This phase keeps authoritative graph state in renderer-owned JS arrays/maps, but
materializes Pixi node, port, label, and activity-marker display objects only
for the padded visible scene window. Static edge rendering now applies viewport
culling and zoom level-of-detail:

- low zoom: only important active, diagnostic, or semantic relationship edges
- medium zoom: visible endpoint or segment-intersecting edges, no labels
- high zoom: visible edges with labels and diagnostics

The before state is the Phase 2 report at
`docs/reports/performance/workspace-graph-semantic-liveness-phase-2-visibility-latency.md`.

## Commands

Build used before recording:

```text
pnpm -C desktop build
```

Focused checks:

```text
pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/pixi-renderer-visible-scene-window.test.js src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.test.js src/renderer/src/features/workspace-graph/pixi-renderer-labels.test.js src/renderer/src/features/workspace-graph/pixi-renderer-visibility-window.test.js src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.test.js
pnpm -C desktop exec eslint tests/electron/workflow-graph-pan-zoom-recording.test.mjs src/renderer/src/features/workspace-graph/pixi-renderer-visible-scene-window.test.js src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.test.js src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.js src/renderer/src/features/workspace-graph/pixi-renderer-visible-scene-window.js src/renderer/src/features/workspace-graph/pixi-renderer.js src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.js src/renderer/src/features/workspace-graph/pixi-renderer-labels.js src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.js
pnpm -C desktop exec tsc --noEmit -p tsconfig.json
```

Recording commands:

```text
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario small-trackpad --skip-build --artifact-dir .recordings/workspace-graph-phase3-after-20260616-r4/small-trackpad
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario large --skip-build --artifact-dir .recordings/workspace-graph-phase3-after-20260616-r3/large
```

The large recording now runs both synthetic scenes at 500, 1,000, 2,500, and
5,000 nodes: `workflow` and `semantic-cells`.

## Artifacts

| Workflow | Artifact directory |
| --- | --- |
| `workflow-graph-pan-zoom-small-trackpad` | `.recordings/workspace-graph-phase3-after-20260616-r4/small-trackpad` |
| `workflow-graph-pan-zoom-large` workflow 500 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/workflow/500-nodes` |
| `workflow-graph-pan-zoom-large` workflow 1,000 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/workflow/1000-nodes` |
| `workflow-graph-pan-zoom-large` workflow 2,500 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/workflow/2500-nodes` |
| `workflow-graph-pan-zoom-large` workflow 5,000 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/workflow/5000-nodes` |
| `workflow-graph-pan-zoom-large` semantic-cells 500 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/semantic-cells/500-nodes` |
| `workflow-graph-pan-zoom-large` semantic-cells 1,000 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/semantic-cells/1000-nodes` |
| `workflow-graph-pan-zoom-large` semantic-cells 2,500 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/semantic-cells/2500-nodes` |
| `workflow-graph-pan-zoom-large` semantic-cells 5,000 nodes | `.recordings/workspace-graph-phase3-after-20260616-r3/large/semantic-cells/5000-nodes` |

## Small Trackpad

The deterministic small-trackpad workflow still uses the real three-node draft
workflow projection through production Electron/main/preload/renderer paths.

| Nodes | Materialized nodes | Total display objects | P95 frame | Worst frame | Commit camera avg / worst | Pixi render worst |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 3 | 57 | 28.7 ms | 29.2 ms | 0.36 / 0.60 ms | 16.2 ms |

| Gesture | First wheel to camera | First wheel to rendered frame | Last wheel to settle |
| --- | ---: | ---: | ---: |
| pan | 0.4 ms | 19.4 ms | 76.0 ms |
| pinch zoom | 0.2 ms | 19.6 ms | 52.0 ms |

The small graph kept labels visible during movement: 0 hidden-label moving
frames and 10 moving visible-label sync frames. The measured renderer work did
not regress materially; the run's frame cadence was slower than the Phase 2
recording, but `commit-camera-change` stayed below 1 ms worst and Pixi render
stayed below one 60 Hz frame worst.

## Visible Materialization

Initial snapshots are used for materialization counts because the scripted
large interaction may intentionally pan to empty space. Hit testing is verified
from the initial materialized viewport for every row by clicking a node center
through CDP and observing renderer selection.

| Scene | Nodes | Total display objects | Materialized nodes | Visible materialized nodes | Labels | Ports | Drawn edges | Edge LOD | Hit test |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| workflow | 500 | 945 | 77 | 18 | 77 | 154 | 109 | medium | pass |
| workflow | 1,000 | 813 | 66 | 10 | 66 | 132 | 132 | medium | pass |
| workflow | 2,500 | 813 | 66 | 12 | 66 | 132 | 121 | medium | pass |
| workflow | 5,000 | 813 | 66 | 12 | 66 | 132 | 122 | medium | pass |
| semantic-cells | 500 | 597 | 72 | 12 | 72 | 0 | 141 | medium | pass |
| semantic-cells | 1,000 | 693 | 84 | 18 | 84 | 0 | 127 | medium | pass |
| semantic-cells | 2,500 | 693 | 84 | 21 | 84 | 0 | 128 | medium | pass |
| semantic-cells | 5,000 | 693 | 84 | 21 | 84 | 0 | 127 | medium | pass |

The Phase 2 5,000-node workflow scene retained 60,021 display objects. Phase 3
initial 5,000-node workflow materializes 66 node views, 66 labels, 132 ports,
and 813 total stage display objects for the same graph size. Semantic-cell
large scenes now have the same bounded shape, with no port display objects
because semantic cells are not connectable.

## Frame Readout

Final snapshots are used for frame timing because they include the full scripted
pan/zoom interaction.

| Scene | Nodes | Phase 2 workflow p95 | Phase 3 p95 | Phase 3 worst | Commit camera avg / worst | Pixi render avg / worst |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| workflow | 500 | 57.2 ms | 45.8 ms | 67.6 ms | 3.15 / 39.30 ms | 2.59 / 70.60 ms |
| workflow | 1,000 | 97.3 ms | 66.4 ms | 106.6 ms | 5.53 / 77.60 ms | 3.17 / 101.70 ms |
| workflow | 2,500 | 240.8 ms | 142.8 ms | 222.3 ms | 11.19 / 183.50 ms | 4.31 / 152.20 ms |
| workflow | 5,000 | 487.7 ms | 248.6 ms | 255.4 ms | 13.06 / 206.10 ms | 4.93 / 184.70 ms |
| semantic-cells | 500 | n/a | 42.5 ms | 49.7 ms | 3.03 / 54.00 ms | 1.99 / 100.20 ms |
| semantic-cells | 1,000 | n/a | 58.6 ms | 84.7 ms | 5.11 / 98.20 ms | 2.99 / 167.90 ms |
| semantic-cells | 2,500 | n/a | 113.1 ms | 123.3 ms | 7.33 / 143.90 ms | 3.81 / 331.20 ms |
| semantic-cells | 5,000 | n/a | 200.6 ms | 210.1 ms | 12.80 / 180.80 ms | 3.35 / 396.70 ms |

The 5,000-node workflow p95 dropped from 487.7 ms to 248.6 ms. This is a clear
improvement, but not yet an interaction-quality frame budget. The remaining
large-frame cost is mostly recording/debug extraction and Pixi render variance
during screenshot/trace-heavy runs, plus visible-scene sync spikes when the
camera crosses a padded materialization boundary.

## Readout

- `VisibleSceneWindow` now owns display-object materialization and pooling.
- Node containers, labels, activity/diagnostic markers, outlines, and port
  visuals are detached into per-node pools when they leave the padded scene
  window, then restored without moving graph state into React.
- Labels are active display objects only for materialized nodes; debug snapshots
  still include every authoritative graph node with an explicit
  `materialized: false` label shape.
- Static edge rendering is culled by visible endpoints or conservative segment
  bounds, with edge labels and diagnostics deferred until high zoom.
- Node and port hit testing remains backed by the spatial index and
  authoritative graph data. The large recording verifies node selection at each
  required size for both workflow and semantic-cell scenes.
