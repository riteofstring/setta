# XYFlow 12 cutover evidence

This historical directory records the completed private Workspace renderer cutover from reference
commit `65f8cafa94c2c4768622ae570f6051332158ddc8` to candidate product commit
`6fe6c007927f868d36734d0cd583ffbc7b752917`. The `baseline` directory contains the
immutable full visual captures and same-machine performance reference. The `accepted` directory
contains final comparison receipts and diff images plus the candidate performance record.

Current architecture is owned by `docs/design/workspace.md`: Workspace now uses the upstream
package with no vendored XYFlow fork. This directory is evidence only. The completed implementation
plan is intentionally absent from the working tree and remains available in Git history.

## Visual result

- Playground passed all 56 scenarios with zero contract differences, zero geometry differences,
  and zero meaningful changed pixels. Four scenarios contained only 2 to 15 isolated antialias
  pixels; the maximum channel difference was 12.
- Python Canvas passed all 23 supported scenarios with zero contract differences, zero geometry
  differences, and zero meaningful changed pixels. Remaining differences were bounded to at most
  36 edge-raster pixels in four tiny components. The same four terminal managed-window states are
  declared `requires-product-seam` in both captures, so the receipt deliberately reports
  `coverageComplete: false` while `supportedParityPassed` is true.
- Direct review covered the live wide and compact Playground targets, representative light, dark,
  narrow, nested-drag, selected, minimized, docked, saved-view, and terminal screenshots, and every
  nonempty final diff. No redesign, missing content, moved geometry, changed clipping boundary, or
  changed z-order was accepted.

## Same-machine performance result

Both records use Chrome 152 on the same arm64 host, three passes, the same 1492 by 696 viewport,
and the deterministic 256-section fixture. All 256 sections remained mounted, 24 were visible,
gesture scrolling never moved the host page, and pan and drag produced no long tasks.

| Observation (ms)           | Reference | Candidate |
| -------------------------- | --------: | --------: |
| Drag activation frame gap  |      16.8 |      16.8 |
| Drag sustained frame gap   |      16.8 |      16.8 |
| Drag first target mutation |      15.9 |      12.9 |
| Drag script duration       |     132.8 |     176.5 |
| Drag task duration         |     325.3 |     344.3 |
| Pan activation frame gap   |      33.3 |      33.4 |
| Pan sustained frame gap    |      16.8 |      16.8 |
| Pan script duration        |     332.1 |     344.9 |
| Pan task duration          |     976.6 |    1071.4 |
| Render node ready          |     205.5 |     217.1 |
| Render settled             |     223.5 |     243.6 |
| Render maximum long task   |       152 |       167 |

The candidate preserves the measured gesture cadence and improves first drag mutation latency.
Its aggregate task time is 5.8 percent higher for drag and 9.7 percent higher for pan; drag script
time is 32.9 percent higher. These CPU totals are retained as an explicit upstream-renderer
tradeoff rather than hidden behind the visual and frame-cadence result.
