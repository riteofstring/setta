# HTML Surface Display List Composition Baseline

## Recording

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260510-211223`

This is the pre-replacement baseline for
`docs/plans/html-surface-display-list-composition-plan.md`.

## Summary

- GPU-flow frames: 901
- Viewport frames: 574
- Interaction-active frames: 577
- Zoom range: `0.1` to `4.5`
- GPU-flow frame duration: p95 `3.0ms`, p99 `7.1ms`, max `19.7ms`
- Browser long tasks: 2, max `122ms`

## Retained Page Texture State

- Retained page uploaded bytes: `1,138,150,624` (`1085.425 MiB`)
- Retained page upload count: 1,237
- Retained page upload frames: 316
- Retained page budget-exhausted frames: 305
- Max retained missing page count: 15
- Max retained committed memory: `201,321,568` bytes (`191.995 MiB`)
- At zoom `>= 4`, retained missing page count was always `0`

The high-zoom disappearance is therefore not explained by missing retained
pages. Retained content had committed drawable pages while the visual content
disappeared.

## Generic HTML Texture State

- Generic uploaded bytes: `306,445,008` (`292.249 MiB`)
- Generic upload frames: 30
- Upload reasons: `first-visible: 5`, `resolution: 32`
- High-zoom generic upload diagnostics at zoom `>= 4`: 20 diagnostics,
  `248,709,120` bytes
- High-zoom generic uploads were dominated by:
  - `settings-section__gui`: `149,225,472` bytes at zoom `>= 4`
  - `settings-section__shortcuts`: `99,483,648` bytes at zoom `>= 4`
- High-zoom section uploads included tiled layout transitions:
  - `settings-section__shortcuts` at zoom `4`, `4.3`
  - `settings-section__gui` at zoom `4`, `4.3`, `4.5`

## Composition Risk

Before the display-list replacement, retained texture pages were emitted as
ordinary flat visuals and generic tiled section textures were drawn by a later
renderer pass. That meant a section texture switching from single to tiled could
change visual stacking and cover retained content even when retained pages were
present.

The after report should confirm:

- no non-overlay commands intersect retained content after it in display-list
  order
- retained content remains visible at zoom `>= 4`
- retained switches remain clickable after zoom and scroll
- generic section textures no longer own retained body pixels above retained
  page commands
