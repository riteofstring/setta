# Phase 1 live side-by-side evidence

This bundle is the supervised developer evidence for the Phase 1 exit gate. It compares the
frozen Setta app and the backend-free package playground after the six implementation batches and
the Phase 1 coherence audit. The evidence is presented for developer acceptance; it does not waive
the gate.

## Provenance

- Frozen product authority: `../setta-main`, branch `main`, commit
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864`.
- Extraction implementation under review: branch `workspace-extraction`, commit
  `6a295560f01337fbd73dce638e908087b19badc2` plus this evidence commit.
- Capture date: 2026-08-11 in `America/Los_Angeles`.
- Live URLs: main at `http://127.0.0.1:3063/being_cliff`; playground at
  `http://127.0.0.1:5174/`.
- Both comparison tabs used a 1492 x 696 CSS-pixel viewport at device-pixel ratio 2 in Google
  Chrome. Main and playground ran concurrently.
- The frozen main worktree remained clean and unchanged.

## Screenshot manifest

| File                                                                                                 | State characterized                                                        |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`01-main-live-dark-1492x696.png`](screenshots/01-main-live-dark-1492x696.png)                       | Frozen main running live in dark appearance                                |
| [`02-playground-idle-dark-1492x696.png`](screenshots/02-playground-idle-dark-1492x696.png)           | Package slice: idle, locked, styled, root-group, and nested-leaf chrome    |
| [`03-playground-selected-dark-1492x696.png`](screenshots/03-playground-selected-dark-1492x696.png)   | Selected leaf in dark appearance                                           |
| [`04-playground-selected-light-1492x696.png`](screenshots/04-playground-selected-light-1492x696.png) | Same selected slice in light appearance                                    |
| [`05-playground-moved-dark-1492x696.png`](screenshots/05-playground-moved-dark-1492x696.png)         | Full-surface move after the reference snap-to-grid commit                  |
| [`06-playground-resized-dark-1492x696.png`](screenshots/06-playground-resized-dark-1492x696.png)     | Bottom-right resize; origin remains fixed                                  |
| [`07-playground-minimized-dark-1492x696.png`](screenshots/07-playground-minimized-dark-1492x696.png) | Reference minimized height and body removal                                |
| [`08-playground-fit-dark-1492x696.png`](screenshots/08-playground-fit-dark-1492x696.png)             | Fit-view result with every slice section visible                           |
| [`09-playground-idle-crop-dark.png`](screenshots/09-playground-idle-crop-dark.png)                   | Original-pixel package leaf crop for comparison with Phase 0 screenshot 03 |

The corresponding frozen original-pixel leaf is
[`03-root-leaf-idle-dark.png`](../../phase0/reference/screenshots/03-root-leaf-idle-dark.png).
Exact geometry, colors, toolbar measurements, and before/after interaction observations are in
[`computed/live-observations.json`](computed/live-observations.json).

## Live comparison result

The initial supervised pass rejected the playground output and fixed three visible discrepancies:

1. The host body used the `section-full` grid area and overlapped the package header. Commit
   `c63e6f890` moved it to the reference body rows.
2. The playground fixture used arbitrary 224 x 96 inner leaf sizes. Commit `1b4c516df` changed the
   fixture to the reference's 200 x 122 inner / 202 x 124 outer geometry.
3. Tailwind's later `p-1` utility overrode the reset-zoom fork rule, producing 24 x 24 instead of
   main's 26 x 26 control. Commit `ae1e8c3b6` restored the live 5-pixel padding with consumer-safe
   selector specificity.

The developer then rejected the first gate presentation for three additional discrepancies. Commit
`66d225825` closes them for recheck:

1. The canvas used the playground host's near-black surface and omitted the fork's SVG grid. The
   package now owns main's exact light/dark canvas colors, zoom-aware grid pattern, and grid option
   seam.
2. Invalid-drop feedback rendered inside the target section's stacking context, so the opaque blue
   drag preview covered the red label. Feedback now uses a body portal one layer above the preview.
3. Cross-parent insertion used the motion-sensitive trailing edge of the dragged section. A one-pixel
   downward movement could therefore place the placeholder after the first child on entry. The first
   correction used the leading edge, which fixed entry but made top-to-bottom switching depend on the
   dragged section's full height. Commit `6a295560f` instead compares the pointer with the frozen target
   midpoint using the existing 10-pixel dead band; same-parent sorting retains its direction-aware
   edges.

The latter two changes are explicit developer-directed interaction corrections, not literal
preservation of the frozen behavior; the developer's gate feedback supersedes that behavior.

After those fixes, the live package output matches the accepted Phase 0 measurements:

- the canvas surface is `rgb(28, 35, 49)` with `#2b364a` dots in dark appearance and
  `rgb(148, 163, 184)` with `#afbacf` dots in light appearance, using the reference 15-pixel grid;
- idle and selected leaves are both 202 x 124; selection changes only the 4-pixel outline and
  z-index (10 to 150);
- dark/light outer, inner, border, outline, and style-colored chrome match the recorded values;
- the group keeps 8/24/24-pixel padding, a 24-pixel outline radius, and the reference header and
  nested-child structure;
- the toolbar container is 32 pixels wide with 6/2/8-pixel padding and a 4-pixel gap; standard
  controls are 23 x 23 around 15 x 15 icons, and reset zoom is 26 x 26 around a 12 x 12 icon;
- the minimized leaf is 202 x 34; the resize handle is 20 x 20 with the reference offset, cursor,
  pointer behavior, and stacking; and
- full-surface movement snaps through the 15-pixel layout grid, control-originated drags do not
  move the section, resize leaves the section origin unchanged, zoom in/out/reset produces
  1 -> 1.2 -> 1 -> 1, and fit view keeps all slice sections visible.

The Chrome extension API cannot keep a keyboard key depressed across a later pointer command, so
it cannot produce a sustained Alt or Mod+Alt package drag screenshot. Those held-mode, collision,
sorting, reparenting, and deferred-release paths are covered by the ported package
characterization/integration suites (243 tests), including focused regression tests for the two
reported drop-feedback defects. The live main and playground tabs are left open for the required
manual held-key recheck at the developer gate.

No warnings or errors were emitted by the playground during the comparison. Main emitted only the
previously recorded React Router future warning and React 19 `element.ref` diagnostics.

## Decision

**Rejected once; corrected; developer recheck pending.** Phase 2 must not begin until the developer
accepts the corrected visual and interaction result.
