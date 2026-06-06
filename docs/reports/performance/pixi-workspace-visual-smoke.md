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

## MSDF BitmapText Label Pipeline Update

Date: 2026-06-04

Artifact bundle:

```text
.recordings/pixi-workspace/20260604T052749Z
```

The visual smoke workflow now verifies that normal graph labels are screen-space
Pixi `BitmapText` labels using the generated `InterMSDF` bitmap font. The run
loads the committed `fonts/inter-msdf/InterMSDF.fnt` descriptor and adjacent
`InterMSDF.png` atlas through the production renderer path, then asserts that
each node-label debug snapshot reports `kind: "bitmap-text"` and
`fontFamily: "InterMSDF"`.

Additional scenario coverage:

- `visibleLabelCount` remains 4 for the current fixture and label debug
  metadata is present for all normal graph labels.
- The loaded `BitmapFont` reports `fontDistanceFieldType: "msdf"` and
  `fontDistanceFieldRange: 4`, preventing the MSDF atlas from being rendered as
  plain RGB bitmap glyphs.
- `labelSyncCount` advances from 8 at initial render to 36 after grouped drag,
  132 after empty-space pan, 140 after wheel zoom, 164 after grouped drag at
  `1.78` zoom, 172 after wheel pan, 180 after deep zoom, and 188 after pan
  while deeply zoomed.
- Label local scale and world scale remain `1.00` at deep zoom, confirming the
  label layer remains screen-space and is not viewport-scaled.
- Label sync keeps `reactRenderCount: 1` through grouped drag, pan, zoom, wheel
  pan, deep zoom, and pan after deep zoom.
- Existing selection, marquee, edge cancellation, edge commit, camera pan/zoom,
  grouped drag at non-1x zoom, deep zoom, and pan-after-deep-zoom coverage still
  passes.

| Metric                             |     Value |
| ---------------------------------- | --------: |
| Bitmap label kind                  |      pass |
| Bitmap label font family           | InterMSDF |
| Deep zoom camera zoom              |      4.00 |
| Labels visible after deep zoom     |         4 |
| Labels visible after deep-zoom pan |         4 |
| Active visible label objects       |         4 |
| Label local/world scale            |      1.00 |
| Initial label sync count           |         8 |
| Label sync count after group drag  |        36 |
| Label sync count after empty pan   |       132 |
| Label sync count after wheel zoom  |       140 |
| Label sync count after zoomed drag |       164 |
| Label sync count after wheel pan   |       172 |
| Final label sync count             |       188 |
| Final edge count                   |         4 |
| Group node drag updates            |        26 |
| Pointer pan updates                |        12 |
| Wheel pan updates                  |         2 |
| Wheel zoom updates                 |         2 |
| React host renders                 |         1 |
| Average recent frame interval      |   9.17 ms |
| Worst recent frame interval        |  89.40 ms |
| Sampled pixels                     |     6,001 |
| Non-background sampled pixels      |       476 |
| Sampled color count                |         8 |

## Label LOD and Culling Update

Date: 2026-06-04

Artifact bundle:

```text
.recordings/pixi-workspace/20260604T154627Z
```

The visual smoke workflow now verifies phase 4 label LOD, decluttering, and
viewport culling. The renderer keeps four pooled `BitmapText` label objects for
the current four-node fixture, while `visibleLabelCount` reports only labels
whose Pixi display object has `visible === true`.

Additional scenario coverage:

- Initial render at `1.00` zoom uses `visible-priority` mode with 4 pooled label
  objects and 4 visible labels.
- Deep zoom/pan at `4.00` zoom uses `all-visible` mode with 2 in-viewport labels
  visible and 2 labels hidden as `outside-viewport`.
- Low zoom at `0.31` uses `selected` mode with the selected in-viewport label
  visible as `selected` and unselected labels hidden as `zoom-hidden`.
- Panning the selected node outside the viewport keeps all 4 label objects
  pooled and hides every label as `outside-viewport`.
- Label visibility changes keep `reactRenderCount: 1` through selection, zoom,
  and offscreen pan coverage.

| Metric                                  |         Value |
| --------------------------------------- | ------------: |
| Initial label visibility mode           | visible-priority |
| Deep zoom label visibility mode         |   all-visible |
| Low zoom label visibility mode          |      selected |
| Label object count                      |             4 |
| Initial visible labels                  |             4 |
| Deep zoom/pan visible labels            |             2 |
| Low zoom selected-mode visible labels   |             1 |
| Offscreen-pan visible labels            |             0 |
| Initial label sync count                |             8 |
| Label sync count after group drag       |            36 |
| Label sync count after empty pan        |           132 |
| Label sync count after wheel zoom       |           140 |
| Label sync count after zoomed drag      |           164 |
| Label sync count after wheel pan        |           172 |
| Label sync count after deep zoom        |           180 |
| Label sync count after deep-zoom pan    |           188 |
| Label sync count after low zoom         |           196 |
| Final label sync count                  |           204 |
| Final edge count                        |             4 |
| Group node drag updates                 |            26 |
| Pointer pan updates                     |            12 |
| Wheel pan updates                       |             3 |
| Wheel zoom updates                      |             3 |
| React host renders                      |             1 |
| Average recent frame interval           |       9.53 ms |
| Worst recent frame interval             |      79.90 ms |
| Sampled pixels                          |         6,366 |
| Non-background sampled pixels           |         1,150 |
| Sampled color count                     |            33 |

## Node Geometry Cleanup Update

Date: 2026-06-04

Before artifact bundle:

```text
.recordings/pixi-workspace/20260604T155744Z
```

After artifact bundle:

```text
.recordings/pixi-workspace/20260604T161213Z
```

Phase 5 centralizes node body, shadow, hover outline, selected outline, and
grid geometry construction. The renderer now exposes geometry debug counters,
and the visual smoke workflow verifies that grid draw count and cached context
counts stay stable across camera pan, wheel pan, wheel zoom, node drag, deep
zoom, label LOD, and offscreen culling. It also verifies hover and selection
advance outline visibility updates without changing body, shadow, outline, or
grid construction counters.

Additional scenario coverage:

- Node body graphics are constructed from cached `GraphicsContext` objects.
- Node shadows share contexts by size and shadow style.
- Hover and selected outlines are prebuilt as two hidden graphics per node and
  update through visibility toggles.
- The fine 1px grid pass uses Pixi `pixelLine: true`; thicker grid and outline
  strokes remain normal strokes.
- Initial and deep-zoom screenshots were visually inspected. Fine grid
  hairlines looked crisp, node body strokes and selected outlines remained
  acceptable at normal and deep zoom, and no label or port alignment regression
  was visible.

| Metric                                     | Phase 4 baseline | Phase 5 after |
| ------------------------------------------ | ---------------: | ------------: |
| Deep zoom/pan average frame interval       |          9.07 ms |       9.07 ms |
| Deep zoom/pan worst frame interval         |         85.70 ms |      77.10 ms |
| Final average recent frame interval        |          9.62 ms |       9.54 ms |
| Final worst recent frame interval          |         81.40 ms |      74.90 ms |
| Grid draw count                            |              n/a |             1 |
| Node body context count                    |              n/a |             4 |
| Node body graphics count                   |              n/a |             4 |
| Node shadow context count                  |              n/a |             3 |
| Node shadow graphics count                 |              n/a |             4 |
| Node outline context count                 |              n/a |             6 |
| Node outline graphics count                |              n/a |             8 |
| Hover outline visibility updates           |              n/a |             1 |
| Final outline visibility update count      |              n/a |            49 |
| Label object count                         |                4 |             4 |
| Final visible labels                       |                0 |             0 |
| Final label sync count                     |              204 |           204 |
| Final edge count                           |                4 |             4 |
| Group node drag updates                    |               26 |            26 |
| Pointer pan updates                        |               12 |            12 |
| Wheel pan updates                          |                3 |             3 |
| Wheel zoom updates                         |                3 |             3 |
| React host renders                         |                1 |             1 |
| Final sampled pixels                       |            6,366 |         6,366 |
| Final non-background sampled pixels        |            1,149 |         4,616 |
| Final sampled color count                  |               33 |            63 |

Geometry construction counters remained stable at `gridDrawCount: 1`,
`nodeBodyContextCount: 4`, `nodeBodyGraphicsCount: 4`,
`nodeShadowContextCount: 3`, `nodeShadowGraphicsCount: 4`,
`nodeOutlineContextCount: 6`, and `nodeOutlineGraphicsCount: 8` from initial
render through hover, selection, pan, zoom, zoomed group drag, wheel pan, deep
zoom, low zoom, and offscreen pan snapshots.

## Low-Zoom Selected Label Sizing Update

Date: 2026-06-04

Artifact bundle:

```text
.recordings/pixi-workspace/20260604T165928Z
```

Phase 5.5 adds a compact selected-label font-size bucket for low-zoom
`selected` label visibility mode. The renderer still uses screen-space MSDF
`BitmapText` labels, keeps label scale at `1`, and applies the compact bucket
only when a visible label has `visibilityReason: "selected"` while the active
label visibility mode is `selected`.

Additional scenario coverage:

- Initial `visible-priority` mode reports all labels as `fontSizeMode: "normal"`
  with `fontSize: 16` and `compactSelectedLabelCount: 0`.
- A selected label in deep-zoom `all-visible` mode remains normal-sized at
  `fontSize: 16`.
- Low zoom at `0.31` enters `selected` mode with one selected in-viewport label
  visible as `selected`, `fontSizeMode: "compact-selected"`, and `fontSize: 12`.
- Unselected low-zoom labels remain hidden and normal-sized.
- The selected low-zoom label reports `scaleX`, `scaleY`, `worldScaleX`, and
  `worldScaleY` as `1`.
- Manual inspection of `low-zoom-selected-label.png` confirmed the selected
  label stays centered and legible without visually overpowering the shrunken
  selected node.

| Metric                                      | Phase 5.5 after |
| ------------------------------------------- | --------------: |
| Initial label visibility mode               | visible-priority |
| Initial compact selected labels             |               0 |
| Deep zoom label visibility mode             |     all-visible |
| Deep zoom compact selected labels           |               0 |
| Low zoom                                    |            0.31 |
| Low zoom label visibility mode              |        selected |
| Low zoom visible labels                     |               1 |
| Low zoom compact selected labels            |               1 |
| Low zoom selected label font size           |              12 |
| Low zoom selected label local/world scale   |            1.00 |
| Final visible labels                        |               0 |
| Final compact selected labels               |               0 |
| Final label sync count                      |             204 |
| React host renders                          |               1 |
| Final average recent frame interval         |        9.72 ms |
| Final worst recent frame interval           |       83.60 ms |
| Final sampled pixels                        |           6,366 |
| Final non-background sampled pixels         |           4,615 |
| Final sampled color count                   |              61 |

## Spatial Index Broad-Phase Update

Date: 2026-06-04

Before artifact bundle:

```text
.recordings/pixi-workspace/20260605T002609Z
```

After artifact bundle:

```text
.recordings/pixi-workspace/20260605T004052Z
```

Phase 6 adds a renderer-owned node-bounds spatial index for broad-phase node
hit testing, marquee selection, label visibility viewport candidates, and port
hit-test candidate narrowing. The renderer still keeps all fixture Pixi display
objects alive, preserves exact geometry checks after every index query, and
updates dragged node bounds in the index from the imperative drag path.

Additional scenario coverage:

- Spatial index debug counters are present and `spatialIndexNodeCount` matches
  `graph.nodeCount`.
- Candidate counts remain non-negative and no larger than the fixture node
  count.
- Node hover/click hit tests, marquee selection, port targeting, label
  visibility after pan, and group drag advance spatial query/update counters.
- A node is reselected at its moved screen center after group drag, verifying
  subsequent hit testing uses the updated bounds.
- Deterministic unit coverage compares fixture and large synthetic index queries
  against naive scans and verifies update/removal and topmost picking behavior.
- The synthetic 1,000-node unit query returns 1 indexed candidate matching the
  naive scan, which exercises localized query reduction without relying on
  timing.

| Metric                                      | Phase 5.5 baseline | Phase 6 after |
| ------------------------------------------- | -----------------: | ------------: |
| Deep zoom/pan average frame interval        |            9.35 ms |       9.35 ms |
| Deep zoom/pan worst frame interval          |          102.40 ms |      99.90 ms |
| Final average recent frame interval         |            9.54 ms |      10.00 ms |
| Final worst recent frame interval           |           78.80 ms |     108.90 ms |
| Spatial index node count                    |                n/a |             4 |
| Spatial index rebuild count                 |                n/a |             1 |
| Final spatial index query count             |                n/a |           151 |
| Final spatial index update count            |                n/a |            52 |
| Pan label visibility candidates             |                n/a |             4 |
| Marquee candidates                          |                n/a |             2 |
| Moved-node hit candidates                   |                n/a |             1 |
| Edge target port candidates                 |                n/a |             1 |
| Final label visibility candidates           |                n/a |             0 |
| Final visible labels                        |                  0 |             0 |
| Final label sync count                      |                204 |           204 |
| Final edge count                            |                  4 |             4 |
| React host renders                          |                  1 |             1 |
| Final sampled pixels                        |              6,366 |         6,366 |
| Final non-background sampled pixels         |              4,615 |         4,616 |
| Final sampled color count                   |                 62 |            61 |
