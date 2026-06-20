# Living Workspace Neon Phase 6 Ambient Life

Date: 2026-06-13

## Scope

Phase 6 validation for semantic ambient life in the Pixi workspace graph:
active-cell breathing, drifting nucleus/organelles, active shimmer, and active
semantic tendril sway/signal. The run used the production Electron
main/preload/renderer path with temporary app data and the semantic-cell
synthetic scene.

Command:

```text
SETTA_WORKFLOW_GRAPH_SCALE_SCENES=semantic-cells node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-scale-validation --skip-build --keep-artifacts --artifact-dir .recordings/living-workspace-neon-phase6-ambient-r2
```

Build used before the run:

```text
./check_quality.sh --files desktop/src/renderer/src/features/workspace-graph/pixi-renderer.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-animation-coordinator.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-animation.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-animation.test.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-cell-animation.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-cell-animation.test.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.test.js desktop/src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.js desktop/src/renderer/src/features/workspace-graph/workspace-neon-theme.ts desktop/src/renderer/src/global.d.ts
```

Artifact bundle:

```text
desktop/.recordings/living-workspace-neon-phase6-ambient-r2
```

## Coverage

The harness covered the semantic-cell synthetic scene at 500, 1,000, 2,500,
and 5,000 nodes with sparse and moderate edge density. Each scenario exercised
initial render, idle sampling, wheel pan, wheel zoom, node hover/click hit
testing, Shift-marquee selection, all-visible label visibility, and node drag.

Phase 6 animation was enabled and reduced motion was off. Idle samples exposed
1-3 visible active cells. `nodePulseRedrawCount` stayed `0` after tuning active
semantic cells out of the generic glow redraw path; semantic tendril/cell motion
remained visible through `edgeFlowRedrawCount` and `cellAnimCount`.

## Results

| Nodes | Edges/node | Initial render | Idle avg | Pan avg | Zoom avg | Drag avg | Drag worst | Display objects | Idle active cells | Idle tendril redraws | Idle glow redraws | React renders |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 1 | 1.97 s | 79.2 ms | 66.6 ms | 66.4 ms | 73.0 ms | 125.9 ms | 4,520 | 1 | 22 | 0 | 3 |
| 500 | 2 | 2.26 s | 103.2 ms | 85.1 ms | 83.3 ms | 91.5 ms | 191.5 ms | 5,020 | 1 | 21 | 0 | 3 |
| 1,000 | 1 | 2.63 s | 136.8 ms | 109.5 ms | 107.8 ms | 112.1 ms | 227.3 ms | 9,020 | 3 | 18 | 0 | 3 |
| 1,000 | 2 | 3.17 s | 185.9 ms | 143.7 ms | 139.7 ms | 147.5 ms | 343.0 ms | 10,020 | 3 | 17 | 0 | 3 |
| 2,500 | 1 | 5.43 s | 387.7 ms | 276.2 ms | 266.8 ms | 268.0 ms | 553.2 ms | 22,520 | 3 | 14 | 0 | 3 |
| 2,500 | 2 | 7.25 s | 607.9 ms | 396.4 ms | 377.9 ms | 374.8 ms | 1,192.1 ms | 25,020 | 3 | 12 | 0 | 3 |
| 5,000 | 1 | 11.88 s | 982.0 ms | 622.4 ms | 592.7 ms | 554.5 ms | 1,225.2 ms | 45,020 | 3 | 12 | 0 | 3 |
| 5,000 | 2 | 25.09 s | 1,922.5 ms | 1,238.1 ms | 1,178.0 ms | 1,197.4 ms | 5,390.4 ms | 50,020 | 3 | 12 | 0 | 3 |

## Comparison To Phase 0

The old Phase 0 semantic-cell baseline had no ambient redraws and substantially
lower frame times at large graph sizes. For example, the 5,000-node / 2-edge
baseline idle average was 800.6 ms with 50,015 display objects; Phase 6 reports
1,922.5 ms with 50,020 display objects and bounded active motion. The added
phase 6 work is capped and visible-active only, but the full neon semantic-cell
scene remains expensive at large display-object counts.

## Notes

- Result: passed.
- Active semantic cells are no longer routed through per-frame node glow redraws;
  their motion is drawn by the single cell animation overlay.
- Semantic tendril motion is endpoint-visible and active-cell-gated. In the
  heaviest idle sample it redrew 12 times and workflow edge-flow count remained
  `0`.
- React render count stayed at `3` in every scenario; animation did not create
  React churn.
- Remaining large-graph cost appears dominated by total Pixi display objects and
  static neon cell/tendril rendering. Further improvement should start with
  visible-object pooling or edge/cell virtualization rather than adding more
  phase 6 per-frame work.
