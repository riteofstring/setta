# Phase 5 accepted-output baseline and post-acceptance gates

This bundle locks the package output that the developer explicitly accepted on 2026-08-12. The
acceptance and authorization to refresh baselines are recorded in the extraction plan at commit
`aa55a3547`. These files are regression evidence for already-approved output; they do not perform
or replace developer visual approval.

## Provenance

- Extraction source: `workspace-extraction` at
  `aa55a354732fd8503ce0b6e26e351d0471ddba2a`.
- Frozen reference: `../setta-main` remained clean on `main` at
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864` and was not modified or relaunched for this
  post-acceptance package recording.
- Built surface: fresh `@setta/workspace` and playground production builds served from
  `apps/playground/dist` at `http://127.0.0.1:4173/`.
- Browser surface: connected Google Chrome, with CSS-pixel screenshots at device pixel ratio 1.
- Capture date: 2026-08-12 in `America/Los_Angeles`.
- Chrome reported no console warning or error during the browser gate.

The supervised developer comparison remains the authority for matched frozen-main parity, RTL,
coarse-pointer behavior, reduced motion, and actual browser 200% page scale. The fifth capture uses
the 756 x 431 CSS viewport produced by applying 200% page scale to the accepted 1512 x 861 reference
viewport. It locks the same responsive layout boundary without claiming to repeat the supervised
browser-scale comparison.

## Screenshot manifest

| File                                                                                                                       | State                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`01-playground-dark-1512x861.jpg`](screenshots/01-playground-dark-1512x861.jpg)                                           | Accepted desktop workspace in dark appearance at workspace zoom 1                   |
| [`02-playground-light-1512x861.jpg`](screenshots/02-playground-light-1512x861.jpg)                                         | The same desktop document and camera in light appearance                            |
| [`03-playground-light-320x861.jpg`](screenshots/03-playground-light-320x861.jpg)                                           | Compact 320 px host, light appearance, wrapped host controls, and clamped minimap   |
| [`04-playground-dark-320x861.jpg`](screenshots/04-playground-dark-320x861.jpg)                                             | The same compact host in dark appearance                                            |
| [`05-playground-dark-756x431-effective-200-percent.jpg`](screenshots/05-playground-dark-756x431-effective-200-percent.jpg) | Dark responsive layout at the accepted desktop viewport's 200%-scale CSS dimensions |

Exact dimensions, geometry, colors, artifact hashes, and screenshot hashes are in
[`computed/package-baseline-metrics.json`](computed/package-baseline-metrics.json). Focus and
trusted pointer/keyboard results are in
[`interactions/browser-gate-traces.json`](interactions/browser-gate-traces.json).

## Locked browser facts

- The 1512 x 861 host has no page overflow. Its canvas remains 1404 x 653, the toolbar remains
  36 x 653, the item panel remains 552 x 352, the workspace stays at zoom 1, and the minimap
  remains 200 x 150.
- The 320 x 861 host has no page overflow in either appearance. Host actions wrap above a
  264 x 569 canvas, the 36 px toolbar remains separate, and the minimap retains its accepted
  200 x 150 maximum inside the canvas.
- The 756 x 431 effective 200%-scale layout has no page overflow, resets with one initial document
  notification, and preserves a 680 x 227 canvas beside the 36 px toolbar.
- Escape from the section-title editor restores focus to the named title trigger.
- The one tabbable item divider moves the accepted `257px 12px 253px` grid to
  `267px 12px 243px` with ArrowRight and returns it exactly with activation.
- ArrowRight on the focused minimap changes the viewport and document reload restores the authored
  camera without losing the minimap's accessible name.
- A trusted vertical wheel over Rotary changes `0` to `0.2`; a following horizontal wheel over the
  pane moves the canvas from x = -900 to x = -708 without changing the URL or opening a browser
  dialog. This is the accepted browser-history ownership correction.

## Post-acceptance gates

- Package production build and built-artifact boundary: pass.
- Playground production build: pass.
- Package suite: 91 files, 662 tests passed.
- Playground suite: 5 files, 28 tests passed.
- All-files static quality gate: pass.
- Supply-chain gate: pass for 601 locked versions, including frozen install, lockfile sync,
  independent seven-day release-age audit, vulnerability audit, license allowlist, and inventory.
- Exact packed unrelated-consumer install, TypeScript check, and production build: pass from public
  exports only.
- Production Chrome browser gate: pass for desktop/compact appearance, focus restoration, keyboard
  resizing, minimap navigation, Rotary ownership, following pane wheel, URL stability, page
  overflow, dialogs, and warning/error console output.

The performance profile was not duplicated: its target-input SHA-256 remains
`b02c59e91cbdb86b906eec500b93e6144efb4123b7e7bb4a1041242e87b3c981`, matching the accepted
optimized evidence in [`performance/`](performance/).
