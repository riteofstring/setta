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

| Metric                        |    Value |
| ----------------------------- | -------: |
| Final zoom                    |    1.714 |
| Camera updates                |       63 |
| Node drag updates             |       14 |
| Edge redraws                  |       15 |
| React host renders            |        1 |
| Average recent frame interval |  8.34 ms |
| Worst recent frame interval   | 31.70 ms |
| Sampled pixels                |    6,003 |
| Non-background sampled pixels |    1,197 |
| Sampled color count           |       32 |

The smoke run verified a nonblank canvas, camera pan/zoom movement, node
movement, finite frame timing counters, and saved screenshots for visual
inspection.

## Edge Drawing Foundation Update

Date: 2026-06-03

Artifact bundle:

```text
.recordings/pixi-workspace/20260604T000336Z
```

The visual smoke workflow now also drives port-to-port edge drawing through the
built Electron app. The run starts a temporary edge from a visible source port,
captures the temporary edge, releases away from target ports to verify
cancellation, then drags from a source port to a target port and verifies a
committed edge.

Additional scenario coverage:

- Temporary edge drawing reports `interaction.drawingEdge: true` before release.
- Invalid release leaves the edge count unchanged.
- Valid target-port release adds one edge.
- Intermediate screenshots are saved as `edge-drawing-cancel.png` and
  `edge-drawing-commit.png`.

| Metric                           |    Value |
| -------------------------------- | -------: |
| Initial edge count               |        3 |
| Edge count after invalid release |        3 |
| Edge count after valid release   |        4 |
| Edge commits                     |        1 |
| Temporary edge updates           |       34 |
| Edge redraws                     |       16 |
| React host renders               |        1 |
| Average recent frame interval    |  8.33 ms |
| Worst recent frame interval      | 23.30 ms |
| Sampled pixels                   |    6,003 |
| Non-background sampled pixels    |    1,198 |
| Sampled color count              |       35 |

Trackpad hardware note: this automated run could not produce physical Mac
trackpad two-finger pan or pinch gestures. The implementation remains configured
with `pixi-viewport` drag, pinch, and wheel handling, including
`trackpadPinch: true`, and the automated workflow verifies the mouse-drag pan
and Chromium wheel zoom path. Physical Mac trackpad pan/pinch verification is
still required to claim hardware coverage.
