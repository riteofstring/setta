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
.recordings/pixi-workspace/20260604T021054Z
```

The visual smoke workflow now also drives trackpad-style wheel pan and
port-to-port edge drawing through the built Electron app. The run starts a
temporary edge from a visible source port, captures the temporary edge, releases
away from target ports to verify cancellation, then drags from a source port to
a target port and verifies a committed edge.

Additional scenario coverage:

- Temporary edge drawing reports `interaction.drawingEdge: true` before release.
- Small pixel wheel deltas pan the camera without changing zoom.
- Large notched wheel deltas still zoom the camera.
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
| Pointer pan updates              |       12 |
| Wheel pan updates                |        1 |
| Wheel zoom updates               |        1 |
| React host renders               |        1 |
| Average recent frame interval    |  8.70 ms |
| Worst recent frame interval      | 34.40 ms |
| Sampled pixels                   |    6,001 |
| Non-background sampled pixels    |      711 |
| Sampled color count              |       34 |

## Manual Recording Feedback Update

Date: 2026-06-03

Manual recording:

```text
.recordings/20260604T020112Z
```

Observed issues:

- Trackpad pinch zoom felt too slow.
- Node drag was unreliable.
- Empty-space click-drag pan and two-finger trackpad pan were not discoverable
  or did not respond.

Follow-up implementation:

- Replaced wheel-only viewport behavior with explicit canvas input handling.
- Small pixel wheel deltas now pan the camera for Mac trackpad two-finger
  swipes.
- Chromium pinch wheel events (`ctrlKey`/`metaKey`) use a higher zoom
  sensitivity around the pointer.
- Large notched wheel deltas still zoom, preserving mouse-wheel smoke coverage.
- Empty-space pointer drag now pans through a native canvas handler.
- Node drag starts from the full node body except source-port hit zones and uses
  pointer capture for steadier movement.

Trackpad hardware note: this automated run could not produce physical Mac
trackpad two-finger pan or pinch gestures. The implementation remains configured
for touch pinch through `pixi-viewport` and handles Chromium trackpad pinch
wheel events directly. The automated workflow verifies mouse-drag pan,
trackpad-style wheel pan, and wheel zoom paths. Physical Mac trackpad pan/pinch
verification is still required to claim hardware coverage.

## Multi-Select Interaction Update

Date: 2026-06-04

Artifact bundle:

```text
.recordings/pixi-workspace/20260604T031346Z
```

The visual smoke workflow now also drives node selection, Cmd-click
multi-select, Shift-drag marquee selection, Escape clearing, and grouped node
dragging through the built Electron app.

Additional scenario coverage:

- Plain node click selects exactly one visible node.
- Cmd-click adds a second visible node, then removes it when clicked again.
- Plain empty-space click clears selection.
- Shift-drag from empty workspace reports `interaction.drawingMarquee: true`
  during the drag, commits multiple selected nodes on release, and does not move
  the camera.
- Dragging one selected node moves the selected group while leaving unselected
  nodes stationary.
- Escape clears selected nodes.
- Empty-space drag still pans after marquee and grouped-drag interactions.
- Source-port edge cancellation and commit still pass after multi-select
  interactions.

| Metric                        |    Value |
| ----------------------------- | -------: |
| Final edge count              |        4 |
| Selection changes             |        7 |
| Marquee updates               |       18 |
| Group node drag updates       |       14 |
| Edge redraws                  |       16 |
| Edge commits                  |        1 |
| Temporary edge updates        |       34 |
| Pointer pan updates           |       12 |
| Wheel pan updates             |        1 |
| Wheel zoom updates            |        1 |
| React host renders            |        1 |
| Average recent frame interval |  8.70 ms |
| Worst recent frame interval   | 37.10 ms |
| Sampled pixels                |    6,001 |
| Non-background sampled pixels |      711 |
| Sampled color count           |       33 |

## Screen-Space Label Layer Update

Date: 2026-06-04

Artifact bundle:

```text
.recordings/pixi-workspace/20260604T040057Z
```

The visual smoke workflow now verifies node labels as screen-space Pixi text
objects. The run asserts label attachment to node centers and non-interactive,
screen-sized label transforms after initial render, grouped node drag,
empty-space pan, wheel zoom, wheel pan, deep zoom, and pan while deeply zoomed.

Additional scenario coverage:

- Node labels report `worldScaleX: 1` and `worldScaleY: 1` while the viewport is
  zoomed to `4.00`.
- Deep zoom captures `deep-zoom-labels.png`.
- Panning after deep zoom keeps labels attached to rounded node screen centers.
- Label sync does not change the React host render count.
- Existing selection, marquee, grouped drag, camera pan/zoom, edge cancellation,
  and edge commit coverage still passes.

| Metric                                  |    Value |
| --------------------------------------- | -------: |
| Deep zoom camera zoom                   |     4.00 |
| Labels visible after deep zoom          |        1 |
| Labels visible after deep-zoom pan      |        2 |
| Label local/world scale after deep zoom |     1.00 |
| Final edge count                        |        4 |
| Group node drag updates                 |       14 |
| Pointer pan updates                     |       12 |
| Wheel pan updates                       |        2 |
| Wheel zoom updates                      |        2 |
| React host renders                      |        1 |
| Average recent frame interval           |  9.07 ms |
| Worst recent frame interval             | 75.00 ms |
| Sampled pixels                          |    6,001 |
| Non-background sampled pixels           |      476 |
| Sampled color count                     |        8 |

## Label Pooling and Debug Counters Update

Date: 2026-06-04

Artifact bundle:

```text
.recordings/pixi-workspace/20260604T042340Z
```

The visual smoke workflow now verifies the screen-space label lifecycle and
debug counters. The renderer exposes active label objects through
`visibleLabelCount` and increments `labelSyncCount` when label position sync
work runs. The run asserts that label sync advances after grouped node drag,
empty-space pan, wheel zoom, grouped node drag at non-1x zoom, wheel pan, deep
zoom, and pan while deeply zoomed, while React host renders stay unchanged.

Additional scenario coverage:

- `visibleLabelCount` matches the 4 visible screen-space label objects in the
  current fixture.
- `labelSyncCount` advances from 8 at initial render to 36 after grouped drag,
  132 after empty-space pan, 140 after wheel zoom, 164 after grouped drag at
  `1.78` zoom, 172 after wheel pan, 180 after deep zoom, and 188 after pan
  while deeply zoomed.
- Label sync keeps `reactRenderCount: 1` through grouped drag, pan, zoom, wheel
  pan, deep zoom, and pan after deep zoom.
- Existing deep zoom, pan after deep zoom, grouped drag at non-1x zoom,
  selection, marquee, edge cancellation, and edge commit coverage still passes.

| Metric                             |    Value |
| ---------------------------------- | -------: |
| Deep zoom camera zoom              |     4.00 |
| Labels visible after deep zoom     |        1 |
| Labels visible after deep-zoom pan |        1 |
| Active visible label objects       |        4 |
| Zoomed group-drag camera zoom      |     1.78 |
| Initial label sync count           |        8 |
| Label sync count after group drag  |       36 |
| Label sync count after empty pan   |      132 |
| Label sync count after wheel zoom  |      140 |
| Label sync count after zoomed drag |      164 |
| Label sync count after wheel pan   |      172 |
| Final label sync count             |      188 |
| Final edge count                   |        4 |
| Group node drag updates            |       26 |
| Pointer pan updates                |       12 |
| Wheel pan updates                  |        2 |
| Wheel zoom updates                 |        2 |
| React host renders                 |        1 |
| Average recent frame interval      |  9.26 ms |
| Worst recent frame interval        | 86.30 ms |
| Sampled pixels                     |    6,001 |
| Non-background sampled pixels      |      476 |
| Sampled color count                |        8 |
