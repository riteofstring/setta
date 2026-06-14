# Workspace Graph Semantic Liveness Phase 2 Visibility And Latency

Date: 2026-06-16

## Scope

Phase 2 implementation and measurement for
`docs/plans/workspace_graph_performance_semantic_liveness_plan.md`.

This phase keeps the Phase 1 camera coalescing, then removes whole-graph label
and glow work from camera settle frames. It also addresses the small-graph
trackpad blocker reported during development: camera input latency is now
measured from wheel event to camera update/render, wheel zoom uses a shorter
settle delay, and small graphs keep labels visible while syncing only the
visible label set.

Build used before recording:

```text
pnpm --dir desktop run build
```

Focused checks:

```text
pnpm -C desktop test -- src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.test.js src/renderer/src/features/workspace-graph/pixi-renderer-wheel-responsiveness.test.js src/renderer/src/features/workspace-graph/pixi-renderer-labels.test.js src/renderer/src/features/workspace-graph/pixi-renderer-animation.test.js src/renderer/src/features/workspace-graph/pixi-renderer-animation-coordinator.test.js src/renderer/src/features/workspace-graph/pixi-renderer-visibility-window.test.js src/renderer/src/features/workspace-graph/pixi-renderer-debug-surface.test.js
node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-smoke
```

Recording commands:

```text
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario small-trackpad --artifact-dir .recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-small-trackpad --skip-build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario baseline --artifact-dir .recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-baseline --skip-build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario active --artifact-dir .recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-active --skip-build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario large --artifact-dir .recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-large --skip-build
```

The before state is the Phase 1 report at
`docs/reports/performance/workspace-graph-semantic-liveness-phase-1-camera-coalescing.md`.

## Artifacts

| Workflow | Artifact directory |
| --- | --- |
| `workflow-graph-pan-zoom-small-trackpad` | `.recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-small-trackpad` |
| `workflow-graph-pan-zoom-baseline` | `.recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-baseline` |
| `workflow-graph-pan-zoom-active` | `.recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-active` |
| `workflow-graph-pan-zoom-large` 500 nodes | `.recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-large/500-nodes` |
| `workflow-graph-pan-zoom-large` 1,000 nodes | `.recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-large/1000-nodes` |
| `workflow-graph-pan-zoom-large` 2,500 nodes | `.recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-large/2500-nodes` |
| `workflow-graph-pan-zoom-large` 5,000 nodes | `.recordings/workspace-graph-phase2-after-20260616-r5/workflow-graph-pan-zoom-large/5000-nodes` |

## Small Trackpad Latency

`small-trackpad` uses the real three-node workflow projection fixture through
the production Electron/main/preload/renderer path. It does not use synthetic
graph mode. The harness enables the existing debug surface only to measure the
production renderer path.

The trackpad approximation sends small pixel wheel deltas for pan and
ctrl-modified small wheel deltas for pinch zoom. Chromium/CDP does not expose a
real inertial-wheel flag, so the renderer records raw wheel samples and reports
tail candidates using the explicit delta-decay threshold in the debug snapshot.

| Gesture | Events | First wheel to camera | First wheel to rendered frame | Last wheel to settle | Tail candidate events | Tail candidate duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pan | 5 | 0.4 ms | 11.1 ms | 65.8 ms | 2 | 17.9 ms |
| pinch zoom | 6 | 0.3 ms | 12.2 ms | 49.9 ms | 2 | 17.1 ms |

Small-graph label handling during the interaction:

| Nodes | Moving label hidden frames | Moving visible-label sync frames | Pan settle delay | Zoom settle delay |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 0 | 11 | 64 ms | 48 ms |

Readout: the deterministic small-graph start/stop latency blocker is fixed in
the measured production renderer path. Camera updates are synchronous with the
wheel handler, the first rendered frame lands on the next frame, zoom settle
restores within about 50 ms after the last pinch wheel event, and the small
graph no longer hides labels during camera movement. A manual macOS hardware
trackpad retest is still useful because CDP approximates pinch wheel delivery.

## Camera And Label Timing

Cells are average ms / worst ms from final debug snapshots.

| Scenario | Nodes | Phase 1 settle restore | Phase 2 settle restore | Phase 2 commit camera | Phase 2 visible-label sync |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 7 | 0.21 / 0.40 | 0.16 / 0.30 | 0.20 / 0.50 | 0.13 / 0.30 |
| active | 10 | 0.18 / 0.30 | 0.19 / 0.30 | 0.18 / 0.40 | 0.11 / 0.30 |
| large | 500 | 2.25 / 3.10 | 0.43 / 1.40 | 0.75 / 9.30 | 0.34 / 2.10 |
| large | 1,000 | 5.70 / 8.40 | 0.45 / 1.50 | 0.57 / 4.60 | 0.33 / 2.00 |
| large | 2,500 | 28.61 / 45.50 | 0.60 / 1.90 | 3.62 / 8.10 | 0.42 / 2.90 |
| large | 5,000 | 68.83 / 120.20 | 1.53 / 13.00 | 1.63 / 11.80 | 1.03 / 12.40 |

At 5,000 nodes, the settled restore path no longer performs whole-graph label
work. The measured restore average dropped from 68.83 ms to 1.53 ms.

## Interaction Deltas

Deltas compare the first and final sampled debug snapshots in each interaction.

| Scenario | Nodes | Camera updates | Label sync delta | Moving labels hidden | Moving labels synced | Settle restores | Filter skips / syncs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small-trackpad | 3 | 11 | 39 | 0 | 11 | 2 | 5 / 6 |
| baseline | 7 | 21 | 291 | 0 | 21 | 21 | 17 / 4 |
| active | 10 | 21 | 414 | 0 | 21 | 21 | 17 / 4 |
| large | 500 | 22 | 395 | 22 | 0 | 22 | 17 / 5 |
| large | 1,000 | 22 | 600 | 22 | 0 | 22 | 17 / 5 |
| large | 2,500 | 22 | 720 | 22 | 0 | 22 | 17 / 5 |
| large | 5,000 | 22 | 1,234 | 22 | 0 | 22 | 17 / 5 |

The Phase 1 5,000-node interaction reported 110,000 label sync deltas. The
Phase 2 5,000-node interaction reported 1,234. Small graphs take the opposite
path: labels stay visible and only the visible label set is synced while moving.

## Visibility Windows

| Scenario | Nodes | Visible labels | Label window | Glow window | Static glow avg / worst |
| --- | ---: | ---: | ---: | ---: | ---: |
| small-trackpad | 3 | 2 | 3 | 3 | 0.00 / 0.00 |
| baseline | 7 | 6 | 7 | 7 | 0.10 / 0.20 |
| active | 10 | 6 | 10 | 10 | 0.00 / 0.00 |
| large | 500 | 0 | 0 | 0 | 0.30 / 0.70 |
| large | 1,000 | 0 | 0 | 0 | 1.70 / 4.20 |
| large | 2,500 | 0 | 0 | 0 | 1.67 / 3.60 |
| large | 5,000 | 0 | 51 | 51 | 0.83 / 2.40 |

Static glow redraws are now tied to graph content or padded visible-membership
changes, not every camera pixel. Filter-area syncs are coalesced and skipped
when a pan remains inside the previous padded filter area; zoom and resize still
force correctness-preserving updates.

Visible labels are actual viewport-visible labels. The label window is the
padded hysteresis sync set; labels inside the padded window but outside the
viewport are updated cheaply and hidden as `outside-viewport`, which avoids
offscreen label display work without reintroducing whole-graph sync.

## Frame Readout

| Scenario | Nodes | P95 frame | Worst frame |
| --- | ---: | ---: | ---: |
| small-trackpad | 3 | 19.2 ms | 22.6 ms |
| baseline | 7 | 29.1 ms | 37.0 ms |
| active | 10 | 29.6 ms | 37.8 ms |
| large | 500 | 57.2 ms | 63.6 ms |
| large | 1,000 | 97.3 ms | 131.3 ms |
| large | 2,500 | 240.8 ms | 324.3 ms |
| large | 5,000 | 487.7 ms | 505.7 ms |

Large-frame cost is still dominated by retained display objects, Pixi rendering,
and debug/screenshot recording overhead. Phase 2 removes the measured settled
label/glow bottleneck, but it does not replace Phase 3 scene graph pooling and
level of detail.

## Readout

- Labels now use a padded sync window and an actual viewport-visible display
  set. Semantic labels share that path, and the second all-semantic camera
  positioning pass is gone.
- Renderer node lookup now uses the renderer-owned node map for hot label,
  edge, port, and animation paths.
- Static glow uses its own padded visible-node window and dirty flag.
- Filter-area updates are measured and skipped for pan-only movement while the
  viewport remains inside the padded filter area.
- Wheel diagnostics now record event timestamp delta, modifier keys, delta mode,
  raw/normalized deltas, zoom-vs-pan treatment, first camera update, first
  rendered frame after camera change, settle restore delay, and tail candidates.
- Small graphs no longer hide labels during camera movement; they sync visible
  labels while moving because the bounded work is cheaper than the visual
  start/stop latency.
