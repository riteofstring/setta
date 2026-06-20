# Living Workspace Neon Phase 0 Baseline

Date: 2026-06-13

## Scope

Phase 0 baseline for the living workspace neon redesign. The run used the
production Electron main/preload/renderer path with temporary app data and the
Pixi workflow graph debug snapshot enabled.

Command:

```text
SETTA_WORKFLOW_GRAPH_SCALE_SCENES=workflow,semantic-cells node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-scale-validation --skip-build --keep-artifacts --artifact-dir .recordings/living-workspace-neon-phase0-baseline-r5
```

Build used before the run:

```text
pnpm --dir desktop run build
```

Artifact bundle:

```text
desktop/.recordings/living-workspace-neon-phase0-baseline-r5
```

## Coverage

The harness covered both status-enabled workflow synthetics and the new
semantic-cell synthetic scene at 500, 1,000, 2,500, and 5,000 nodes with sparse
and moderate edge density.

Each workflow scenario exercises initial render, idle sampling, wheel pan, wheel
zoom, node hover/click hit testing, Shift-marquee selection, all-visible label
visibility, port targeting, edge commit, and node drag. Semantic-cell scenarios
exercise initial render, idle sampling, wheel pan, wheel zoom, node hover/click
hit testing, Shift-marquee selection, all-visible label visibility, and node
drag. Semantic cells are non-connectable, so port targeting is intentionally
workflow-only.

Debug animation counters were present in every scenario. Workflow scenes exposed
visible active workflow pulse/flow candidates; semantic-cell scenes exposed
visible active cells. `transitionsActive` remained `0`, as Phase 0 only threads
lineage and does not implement mitosis/fusion transitions.

## Results

| Scene | Nodes | Edges/node | Initial render | Idle avg | Pan avg | Zoom avg | Drag avg | Drag worst | Display objects | Idle edge flow | Idle node pulse | Idle active cells | React renders |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| workflow | 500 | 1 | 1.57 s | 40.1 ms | 36.1 ms | 36.9 ms | 60.9 ms | 107 ms | 6,015 | 3 | 11 | 0 | 3 |
| workflow | 500 | 2 | 1.48 s | 38.0 ms | 35.2 ms | 36.4 ms | 59.0 ms | 111 ms | 6,015 | 7 | 11 | 0 | 3 |
| workflow | 1,000 | 1 | 1.72 s | 59.5 ms | 52.8 ms | 53.6 ms | 85.4 ms | 156 ms | 12,015 | 0 | 5 | 0 | 3 |
| workflow | 1,000 | 2 | 1.80 s | 62.9 ms | 54.4 ms | 55.1 ms | 85.8 ms | 150 ms | 12,015 | 4 | 5 | 0 | 3 |
| workflow | 2,500 | 1 | 3.30 s | 155.1 ms | 130.2 ms | 129.9 ms | 189.8 ms | 344 ms | 30,015 | 0 | 7 | 0 | 3 |
| workflow | 2,500 | 2 | 4.00 s | 173.2 ms | 137.9 ms | 135.8 ms | 193.9 ms | 385 ms | 30,015 | 5 | 7 | 0 | 3 |
| workflow | 5,000 | 1 | 6.27 s | 387.5 ms | 279.4 ms | 273.0 ms | 370.4 ms | 765 ms | 60,015 | 0 | 6 | 0 | 3 |
| workflow | 5,000 | 2 | 7.88 s | 437.3 ms | 306.5 ms | 295.0 ms | 399.5 ms | 1,040 ms | 60,015 | 5 | 6 | 0 | 3 |
| semantic-cells | 500 | 1 | 1.51 s | 43.7 ms | 40.1 ms | 40.7 ms | 51.4 ms | 98 ms | 4,515 | 0 | 0 | 3 | 3 |
| semantic-cells | 500 | 2 | 1.63 s | 57.6 ms | 50.5 ms | 50.6 ms | 63.3 ms | 147 ms | 5,015 | 0 | 0 | 3 | 2 |
| semantic-cells | 1,000 | 1 | 1.94 s | 76.0 ms | 65.7 ms | 65.7 ms | 81.0 ms | 186 ms | 9,015 | 0 | 0 | 3 | 3 |
| semantic-cells | 1,000 | 2 | 2.32 s | 110.7 ms | 89.6 ms | 88.2 ms | 105.3 ms | 279 ms | 10,015 | 0 | 0 | 3 | 3 |
| semantic-cells | 2,500 | 1 | 3.35 s | 212.4 ms | 157.3 ms | 154.5 ms | 184.1 ms | 439 ms | 22,515 | 0 | 0 | 3 | 2 |
| semantic-cells | 2,500 | 2 | 4.47 s | 318.7 ms | 232.2 ms | 224.5 ms | 258.8 ms | 705 ms | 25,015 | 0 | 0 | 3 | 2 |
| semantic-cells | 5,000 | 1 | 7.01 s | 531.0 ms | 352.7 ms | 338.0 ms | 383.6 ms | 1,117 ms | 45,015 | 0 | 0 | 3 | 3 |
| semantic-cells | 5,000 | 2 | 10.66 s | 800.6 ms | 527.3 ms | 505.9 ms | 572.3 ms | 1,767 ms | 50,015 | 0 | 0 | 3 | 3 |

## Notes

- Result: passed.
- The Phase 0 animation pass is a guardrail only; it updates counters and active
  sets, but later phases still implement actual flow, pulse, cell, and transition
  drawing.
- Large-graph frame times remain dominated by node-scaled display objects before
  the redesign animation work begins.
