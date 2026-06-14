# Workspace Graph Semantic Liveness Phase 0 Baseline

Date: 2026-06-16

## Scope

Phase 0 baseline for `docs/plans/workspace_graph_performance_semantic_liveness_plan.md`.
The run used production Electron main/preload/renderer paths, temporary app data,
CDP tracing, debug snapshots, input samples, PerformanceObserver records, and
fit-to-view contact sheets.

Build used before recording:

```text
pnpm --dir desktop run build
```

Recording commands:

```text
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario baseline --skip-build --keep-artifacts --artifact-dir .recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-baseline
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario active --skip-build --keep-artifacts --artifact-dir .recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-active
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario large --skip-build --keep-artifacts --artifact-dir .recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-large
node desktop/tests/electron/semantic-cartographer-auto-workflow.test.mjs --semantic-live-recording-only --skip-build --keep-artifacts --artifact-dir .recordings/workspace-graph-phase0-baseline-20260616-r2/semantic-live-run
```

The large-scene recording harness now fails if camera updates, pointer pan,
wheel pan, or wheel zoom counters do not advance. The large synthetic graph is
dense enough that fitted-view drags can start on nodes or edges, so the harness
records an initial wheel pan to expose background, derives a drag start point
from the debug snapshot, and then dispatches the pointer pan.

## Artifacts

| Workflow | Artifact directory |
| --- | --- |
| `workflow-graph-pan-zoom-baseline` | `.recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-baseline` |
| `workflow-graph-pan-zoom-active` | `.recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-active` |
| `workflow-graph-pan-zoom-large` 500 nodes | `.recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-large/500-nodes` |
| `workflow-graph-pan-zoom-large` 1,000 nodes | `.recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-large/1000-nodes` |
| `workflow-graph-pan-zoom-large` 2,500 nodes | `.recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-large/2500-nodes` |
| `workflow-graph-pan-zoom-large` 5,000 nodes | `.recordings/workspace-graph-phase0-baseline-20260616-r2/workflow-graph-pan-zoom-large/5000-nodes` |
| `semantic-live-run` | `.recordings/workspace-graph-phase0-baseline-20260616-r2/semantic-live-run/automatic-agent` |

Each pan/zoom artifact contains `pan-zoom-cdp-trace.json`,
`pan-zoom-debug-snapshots.json`, `pan-zoom-input-samples.json`,
`pan-zoom-performance-observer.json`, initial/final screenshots, and a
fit-to-view contact sheet.

## Frame And Trace Results

| Scenario | Nodes | Edges | Semantic nodes | Avg frame | P95 frame | Worst frame | Frames | Long tasks | Event timings | Trace events | Input samples | Snapshots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 5 | 4 | 25.6 ms | 28.3 ms | 29.3 ms | 488 | 2 | 20 | 126,464 | 24 | 22 |
| active | 10 | 10 | 6 | 27.6 ms | 31.3 ms | 34.0 ms | 490 | 1 | 20 | 122,478 | 24 | 22 |
| large | 500 | 500 | 0 | 47.1 ms | 58.1 ms | 77.0 ms | 453 | 86 | 35 | 220,832 | 25 | 36 |
| large | 1,000 | 1,000 | 0 | 75.0 ms | 100.9 ms | 142.4 ms | 409 | 404 | 35 | 299,451 | 25 | 49 |
| large | 2,500 | 2,500 | 0 | 168.1 ms | 240.7 ms | 313.2 ms | 371 | 370 | 35 | 590,950 | 25 | 78 |
| large | 5,000 | 5,000 | 0 | 317.0 ms | 459.9 ms | 518.3 ms | 407 | 405 | 35 | 1,281,263 | 25 | 98 |

## Interaction Counter Deltas

Deltas are summed from sampled debug snapshots during the scripted interaction.

| Scenario | Nodes | Camera updates | Pointer pan | Wheel pan | Wheel zoom | Label sync | Spatial queries | Frame delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 21 | 18 | 1 | 2 | 231 | 24 | 232 |
| active | 10 | 21 | 18 | 1 | 2 | 336 | 24 | 226 |
| large | 500 | 22 | 18 | 2 | 2 | 11,000 | 25 | 247 |
| large | 1,000 | 22 | 18 | 2 | 2 | 22,000 | 25 | 242 |
| large | 2,500 | 22 | 18 | 2 | 2 | 55,000 | 25 | 250 |
| large | 5,000 | 22 | 18 | 2 | 2 | 110,000 | 25 | 296 |

Graph update counters at the last sample stayed at one graph update per
scenario. Large scenarios reported node and edge update counts equal to scene
size: 500/500, 1,000/1,000, 2,500/2,500, and 5,000/5,000. The baseline real
fixture reported 3 node adds, 4 node updates, 2 edge adds, and 3 edge updates.
The active synthetic fixture reported 10 node updates and 10 edge updates.

## Timing Buckets

Cells are `average ms / worst ms` from the final debug snapshot.

| Scenario | Nodes | Commit camera | Label all | Label position | Label visibility | Active set | Static glow | Animated glow | Filter | Grid | Edge | Edge label | Pixi render | Scene diff |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 0.2 / 0.4 | 0.1 / 1.4 | 0.0 / 0.2 | 0.1 / 1.4 | 0.0 / 0.1 | 0.0 / 0.1 | 0.0 / 0.0 | 0.0 / 0.1 | 1.3 / 3.7 | 0.3 / 0.3 | 0.0 / 0.0 | 0.3 / 36.8 | 0.6 / 0.8 |
| active | 10 | 0.3 / 1.6 | 0.1 / 1.2 | 0.0 / 1.0 | 0.0 / 0.1 | 0.0 / 0.1 | 0.0 / 0.1 | 0.0 / 0.1 | 0.0 / 0.0 | 0.1 / 0.1 | 0.5 / 0.6 | 0.0 / 0.0 | 0.3 / 17.6 | 0.5 / 0.8 |
| large | 500 | 2.0 / 3.5 | 1.9 / 2.9 | 0.0 / 0.2 | 0.2 / 0.6 | 0.1 / 0.1 | 0.0 / 0.6 | 0.5 / 6.3 | 0.0 / 0.1 | 0.1 / 0.2 | 3.0 / 3.4 | 0.2 / 0.3 | 4.2 / 72.9 | 7.6 / 13.1 |
| large | 1,000 | 6.0 / 8.7 | 5.8 / 8.6 | 0.0 / 0.2 | 0.2 / 0.9 | 0.1 / 0.3 | 0.1 / 0.8 | 0.4 / 2.6 | 0.0 / 0.1 | 0.1 / 0.1 | 5.4 / 6.5 | 0.4 / 0.6 | 4.9 / 178.9 | 16.1 / 30.2 |
| large | 2,500 | 24.1 / 36.6 | 25.8 / 44.6 | 0.0 / 4.5 | 0.4 / 1.3 | 0.3 / 0.4 | 0.1 / 0.8 | 0.6 / 10.1 | 0.0 / 0.1 | 0.1 / 0.1 | 15.5 / 19.1 | 0.7 / 0.7 | 9.6 / 350.0 | 49.3 / 94.7 |
| large | 5,000 | 73.9 / 149.5 | 80.5 / 146.7 | 0.0 / 5.0 | 1.0 / 13.7 | 0.5 / 0.8 | 0.1 / 0.8 | 0.5 / 7.6 | 0.0 / 0.1 | 0.1 / 0.2 | 28.6 / 31.5 | 0.7 / 0.8 | 17.1 / 906.8 | 74.8 / 143.0 |

At 5,000 nodes, `commit-camera-change` totaled 1,699.2 ms across 23 samples.
`label-all-sync` totaled 2,254.6 ms, and `label-position-sync` recorded
140,000 samples totaling 2,143.0 ms. This matches the interaction-counter
shape: 22 camera updates caused whole-graph label work over 5,000 nodes.

## Display Object Counts By Layer

Values are final-sample `totalCount` by Pixi layer.

| Scenario | Nodes | Background | Edge | Edge labels | Effects | Interaction | Labels | Node glow | Nodes | Stage | Viewport |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 2 | 5 | 1 | 2 | 3 | 8 | 3 | 62 | 89 | 78 |
| active | 10 | 2 | 5 | 1 | 2 | 3 | 11 | 3 | 87 | 117 | 103 |
| large | 500 | 2 | 5 | 1 | 2 | 3 | 501 | 3 | 5,501 | 6,021 | 5,517 |
| large | 1,000 | 2 | 5 | 1 | 2 | 3 | 1,001 | 3 | 11,001 | 12,021 | 11,017 |
| large | 2,500 | 2 | 5 | 1 | 2 | 3 | 2,501 | 3 | 27,501 | 30,021 | 27,517 |
| large | 5,000 | 2 | 5 | 1 | 2 | 3 | 5,001 | 3 | 55,001 | 60,021 | 55,017 |

## Semantic Live Run

`semantic-live-run` passed through production Electron/main/preload/renderer,
HTTP, store, workflow, chat, and semantic graph paths. The workflow execution
`workflow_execution_583da9a38e5bebf0086badcdceb90106` completed with
`end_reached`; `start`, `agent`, and `end` node executions succeeded.

Recorded semantic/cartographer evidence:

- 212 backend HTTP rows and 200 IPC rows in the automatic-agent recording.
- Final semantic graph read: 4 nodes, 3 edges, 6 source links.
- Node detail for `semantic_node_cartographer_scripted_f6592a4842aa`: 3 evidence
  records and 1 outgoing semantic edge.
- Applied patches included `record_finding` and `create_edge` operations with
  semantic event IDs.
- Cartographer windows included processed workflow-execution windows tied to the
  completed workflow execution.
- Cartographer runs included applied workflow-window runs and terminal
  superseded/failed workflow-done runs, which gives the liveness report real
  status variety to preserve.

The only renderer console row was Electron's development CSP warning from
`node:electron/js2c/sandbox_bundle`; no workflow assertion failed.

## Readout For Phase 1

The evidence supports Phase 1 as the next implementation step, with Phase 2
label work close behind:

- Camera events still trigger whole-graph label sync. At 5,000 nodes, 22 camera
  updates produced 110,000 label sync deltas.
- `commit-camera-change` scales with scene size: 0.2 ms average at 7 nodes,
  6.0 ms at 1,000 nodes, 24.1 ms at 2,500 nodes, and 73.9 ms at 5,000 nodes.
- `label-all-sync` is the main measured sub-bucket inside camera-dependent work:
  80.5 ms average and 146.7 ms worst at 5,000 nodes.
- Display objects are fully materialized and scale linearly, reaching 60,021
  stage objects and 5,001 label objects at 5,000 nodes.
- Pixi render has large spikes, including 906.8 ms worst at 5,000 nodes, so
  Phase 3 pooling/LOD remains justified. The first measured interaction fix
  should still be Phase 1 camera coalescing because it directly bounds how often
  the O(nodes) camera-dependent work runs.

Phase 1 should start from this baseline, then append a before/after report under
`docs/reports/performance/`.
