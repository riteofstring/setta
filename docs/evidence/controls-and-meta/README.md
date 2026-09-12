# Consolidated controls and meta-controls accepted-output baseline

This bundle is the first regression lock for the ordinary item controls and direct-on-canvas meta
controls the developer explicitly accepted on 2026-08-12 (acceptance recorded in the plan at commit
`d1ffd1d2e`). Baselines follow developer acceptance; these files record already-accepted package
output and do not constitute a new visual approval.

## Provenance

- Extraction source: `workspace-extraction` at
  `74770590294d11121a7cea3010f4a0d177888f1b`.
- Built surface: a fresh `@setta/workspace` production build followed by a fresh playground
  production build, served from `apps/playground/dist` at `http://127.0.0.1:4173/`.
- Browser: Google Chrome 151.0.7922.110 through the connected Chrome browser surface.
- CSS viewport: 1512 x 861 px, matching the frozen-reference control evidence. The boot workspace
  viewport is `{x: 0, y: 0, zoom: 1}`; the meta-control matrix is framed at
  `{x: -900, y: 0, zoom: 1}` without changing workspace zoom.
- Raster context: the connected post-acceptance capture surface reported DPR 1 and emitted
  CSS-pixel-sized JPEGs. The supervised developer comparison remains the authority for the required
  DPR 2 parity check. This bundle deliberately records its separate raster context instead of
  claiming to repeat or replace that completed comparison.
- Capture date: 2026-08-12 in `America/Los_Angeles`.
- The frozen reference remained clean on `main` at
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; it was not relaunched or modified for this
  post-acceptance package recording.
- Chrome reported no console warnings or errors during the capture sequence.

## Screenshot manifest

| File                                                                                                   | State                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [`01-playground-boot-dark-1512x861.jpg`](screenshots/01-playground-boot-dark-1512x861.jpg)             | Full playground, dark appearance, loaded document and boot camera                              |
| [`02-playground-boot-light-1512x861.jpg`](screenshots/02-playground-boot-light-1512x861.jpg)           | Same full playground state in light appearance                                                 |
| [`03-item-controls-middle-dark-1512x861.jpg`](screenshots/03-item-controls-middle-dark-1512x861.jpg)   | Item list at scrollTop 239, showing slider through dropzone in dark appearance                 |
| [`04-item-controls-middle-light-1512x861.jpg`](screenshots/04-item-controls-middle-light-1512x861.jpg) | Same middle ordinary-control state in light appearance                                         |
| [`05-item-controls-bottom-dark-1512x861.jpg`](screenshots/05-item-controls-bottom-dark-1512x861.jpg)   | Item list at its 379 px maximum, showing password through editable name in dark appearance     |
| [`06-item-controls-bottom-light-1512x861.jpg`](screenshots/06-item-controls-bottom-light-1512x861.jpg) | Same bottom ordinary-control state in light appearance                                         |
| [`07-meta-controls-matrix-dark.jpg`](screenshots/07-meta-controls-matrix-dark.jpg)                     | Focused crop of all twelve canvas controls at workspace zoom 1 in dark appearance              |
| [`08-meta-controls-matrix-light.jpg`](screenshots/08-meta-controls-matrix-light.jpg)                   | Same focused canvas-control matrix in light appearance                                         |
| [`09-meta-button-hover-dark.jpg`](screenshots/09-meta-button-hover-dark.jpg)                           | Button meta control hover, exposing the compact configure action and top drag affordance paint |

Exact file hashes and captured geometry are in
[`computed/package-baseline-metrics.json`](computed/package-baseline-metrics.json).

## Locked facts

- The ordinary item panel remains 552 x 352 outer, with a 550 x 320 list area, a 544 px client
  width after the frozen host's 6 px scrollbar gutter, a 257 px label column, 526 px rows, and a
  699 px scroll height over its 320 px viewport.
- The two ordinary-control scroll positions together expose every accepted control path. Captured
  geometry includes the 12 px slider thumb and stable 39.67 px numeric field, 40 px rotary, full
  253 px password input with its 32 x 16 trailing action, native date/time fields, 253 x 48
  dropzone target, switch, dropdown, configured/native color, and editable name.
- Dark native Time uses `color-scheme: dark`; the ordinary Date text path remains on the normal
  color scheme. This locks the accepted native-affordance correction without altering formatted
  text controls.
- Meta controls preserve their captured outer sizes: 202 x 46 for the default fixed-height
  controls, 202 x 34 for auto-height Dropdown/Slider/Password, 202 x 100 for TextArea, 242 x 122
  for Dropzone, and 202 x 262 for the live auto-height Date calendar.
- The Button hover state exposes a 24 x 24 configure paint with a 16 x 16 icon over its retained
  40 x 48 pseudo-element hit geometry. Its top drag surface remains 48 x 12 with a restrained
  32 x 4 painted pill.
- The shipped playground fixture is recorded exactly: its auto-height Date calendar and later
  Color node share one matrix column and overlap by 202 x 46. Recording that composition does not
  turn it into a general package layout contract.

The baseline does not supersede the frozen-main evidence or the developer's live interaction
review. It exists only to detect later regressions in the accepted package output.
