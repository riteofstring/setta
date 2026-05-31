# Pixi Workspace Visual Smoke Baseline

Date: 2026-06-03

## Scope

Baseline from the first Pixi workspace visual smoke workflow. The run launched
the built Electron app with temporary app data and:

```text
SETTA_PIXI_WORKSPACE_PROTOTYPE=1
SETTA_PIXI_WORKSPACE_DEBUG=1
```

Artifact bundle:

```text
.recordings/pixi-workspace/20260603T233618Z
```

## Scenario

- Window: 1280 x 820 CSS pixels
- Canvas: 2560 x 1640 backing pixels
- Graph: 4 hard-coded nodes, 3 hard-coded edges
- Automated gestures: empty-space pointer pan, mouse-wheel zoom, visible-node drag
- Visual checks: Pixi debug pixel sampling plus initial/final screenshots

## Results

| Metric | Value |
| --- | ---: |
| Final zoom | 1.714 |
| Camera updates | 63 |
| Node drag updates | 14 |
| Edge redraws | 15 |
| React host renders | 1 |
| Average recent frame interval | 8.34 ms |
| Worst recent frame interval | 31.70 ms |
| Sampled pixels | 6,003 |
| Non-background sampled pixels | 1,197 |
| Sampled color count | 32 |

The smoke run verified a nonblank canvas, camera pan/zoom movement, node
movement, finite frame timing counters, and saved screenshots for visual
inspection.

