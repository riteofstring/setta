# Pixi Workspace Scale Validation

Date: 2026-06-05

## Scope

Phase 6.5 validates the Phase 6 Pixi renderer with deterministic synthetic
graphs before adding visible-object pooling or edge culling. The focused harness
runs through the built Electron main/preload/renderer path with temporary app
data and the production Pixi workspace renderer.

Command:

```text
./scripts/test_pixi_workspace_scale_validation.sh --skip-build --keep-artifacts
```

Build used before the run:

```text
pnpm -C desktop build
```

Artifact bundle:

```text
.recordings/pixi-workspace-scale-validation/20260605T012927Z
```

Each scenario folder contains `initial.png`, `after-zoom-labels.png`,
`marquee-selection.png`, `edge-targeting.png`, `final.png`, and `summary.json`.

## Coverage

The harness covers 500, 1,000, 2,500, and 5,000 nodes with sparse
`1 edge per node` and moderate `2 edges per node` densities. Each scenario
exercises initial render, wheel pan, wheel zoom, node hover/click hit testing,
Shift-marquee selection, all-visible label visibility, port targeting, edge
commit, and node drag.

Hard assertions are correctness and counter based. Timing is report-only.

- Spatial index node count matches graph node count.
- Node hit, marquee selection, port targeting, and all-visible label visibility
  match exact scans from the debug snapshot.
- Candidate counts stay no larger than graph node count and are materially
  smaller than graph size for localized queries.
- React render count stays at `1` through imperative interactions.
- Display-object counters match graph scale: one edge `Graphics`, one node
  container per node, two port graphics per node, one label object per node,
  and total Pixi display objects scaling at roughly `10 * nodeCount + 13`.

## Results

| Nodes | Edges/node | Edges | Initial render | Avg frame | Worst frame | Label candidates | Marquee candidates | Hit candidates | Port candidates | Visible labels | Display objects |
| ----: | ---------: | ----: | -------------: | --------: | ----------: | ---------------: | -----------------: | -------------: | --------------: | -------------: | --------------: |
|   500 |          1 |   500 |         0.94 s |  10.13 ms |    55.50 ms |               12 |                  4 |              1 |               1 |             12 |           5,013 |
|   500 |          2 | 1,000 |         0.95 s |  10.75 ms |    57.80 ms |               12 |                  4 |              1 |               1 |             12 |           5,013 |
| 1,000 |          1 | 1,000 |         1.04 s |  26.44 ms |    88.70 ms |                9 |                  9 |              1 |               1 |              9 |          10,013 |
| 1,000 |          2 | 2,000 |         1.08 s |  29.31 ms |    98.20 ms |                9 |                  9 |              1 |               1 |              9 |          10,013 |
| 2,500 |          1 | 2,500 |         1.42 s |  76.08 ms |   212.30 ms |                9 |                  6 |              1 |               1 |              9 |          25,013 |
| 2,500 |          2 | 5,000 |         1.49 s |  84.34 ms |   224.90 ms |                9 |                  6 |              1 |               1 |              9 |          25,013 |
| 5,000 |          1 | 5,000 |         2.41 s | 188.63 ms |   698.70 ms |                9 |                  6 |              1 |               1 |              9 |          50,013 |
| 5,000 |          2 | 10,000 |         2.72 s | 214.57 ms |   744.20 ms |                9 |                  6 |              1 |               1 |              9 |          50,013 |

Display-object and spatial-index counters at the final node-drag snapshot:

| Nodes | Edges/node | Edge graphics | Node containers | Port graphics | Label objects | Visible labels | Spatial nodes | Spatial queries | Spatial updates |
| ----: | ---------: | ------------: | --------------: | ------------: | ------------: | -------------: | ------------: | --------------: | --------------: |
|   500 |          1 |             1 |             500 |         1,000 |           500 |             12 |           500 |              47 |              10 |
|   500 |          2 |             1 |             500 |         1,000 |           500 |             12 |           500 |              47 |              10 |
| 1,000 |          1 |             1 |           1,000 |         2,000 |         1,000 |              9 |         1,000 |              47 |              10 |
| 1,000 |          2 |             1 |           1,000 |         2,000 |         1,000 |              9 |         1,000 |              47 |              10 |
| 2,500 |          1 |             1 |           2,500 |         5,000 |         2,500 |              9 |         2,500 |              47 |              10 |
| 2,500 |          2 |             1 |           2,500 |         5,000 |         2,500 |              9 |         2,500 |              47 |              10 |
| 5,000 |          1 |             1 |           5,000 |        10,000 |         5,000 |              9 |         5,000 |              47 |              10 |
| 5,000 |          2 |             1 |           5,000 |        10,000 |         5,000 |              9 |         5,000 |              47 |              10 |

## Decision

Start Phase 7 with visible node/port pooling first. Sparse 5,000-node
performance already misses the interaction budget, while doubling edge density
adds less cost than the jump in node-scaled display objects. Recheck edge
culling after node/port pooling, because the 10,000-edge case still adds
measurable cost.
