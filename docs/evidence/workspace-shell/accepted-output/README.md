# Workspace-shell accepted-output baseline and post-acceptance gates

This bundle locks the workspace-shell package output that the developer explicitly accepted on
2026-08-13. The acceptance and authorization to refresh baselines are recorded in the extraction
plan at commit `00178a78d`. These files are regression evidence for already-approved output; they
do not perform or replace developer visual approval.

## Provenance

- Extraction source: `workspace-extraction` at
  `00178a78d794423f210f59cc2303eae05bb95931`.
- Frozen reference: `../setta-main` remained clean on `main` at
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; it was not modified or relaunched for this
  post-acceptance package recording.
- Built surface: fresh `@setta/workspace` and playground production builds served from
  `apps/playground/dist` at `http://127.0.0.1:4173/`.
- Browser surface: connected Google Chrome at device pixel ratio 1. The capture API emitted
  CSS-pixel-sized JPEGs.
- Capture date: 2026-08-13 in `America/Los_Angeles`.
- Chrome reported no console warning or error, no dialog, and no URL drift during the browser
  gate.

The supervised developer comparison remains the authority for matched frozen-main parity and the
actual browser 200% page-scale result. Capture 07 uses the 746 x 348 CSS viewport produced by
halving the accepted 1492 x 696 reference viewport. It locks the same responsive boundary without
claiming to repeat the developer's browser-scale comparison.

## Screenshot manifest

| File                                                                                                                       | State                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`01-playground-outline-dark-1492x696.jpg`](screenshots/01-playground-outline-dark-1492x696.jpg)                           | Accepted desktop shell with the built-in Outline open in dark appearance                       |
| [`02-playground-outline-light-1492x696.jpg`](screenshots/02-playground-outline-light-1492x696.jpg)                         | The same desktop Outline state in light appearance                                             |
| [`03-selected-slider-inspector-dark-1492x696.jpg`](screenshots/03-selected-slider-inspector-dark-1492x696.jpg)             | Selected typed slider item with both panes and the non-duplicated Inspector in dark appearance |
| [`04-selected-slider-inspector-light-1492x696.jpg`](screenshots/04-selected-slider-inspector-light-1492x696.jpg)           | The same selected-item Inspector state in light appearance                                     |
| [`05-pane-menu-dark-1492x696.jpg`](screenshots/05-pane-menu-dark-1492x696.jpg)                                             | Searchable pane creation menu near the trailing viewport edge in dark appearance               |
| [`06-pane-menu-light-1492x696.jpg`](screenshots/06-pane-menu-light-1492x696.jpg)                                           | The same menu placement and contents in light appearance                                       |
| [`07-playground-dark-746x348-effective-200-percent.jpg`](screenshots/07-playground-dark-746x348-effective-200-percent.jpg) | Effective CSS viewport for the accepted desktop surface at 200% page scale                     |
| [`08-playground-outline-dark-320x696.jpg`](screenshots/08-playground-outline-dark-320x696.jpg)                             | Compact dark shell with the leading pane negotiated to full width                              |
| [`09-playground-outline-light-320x696.jpg`](screenshots/09-playground-outline-light-320x696.jpg)                           | The same compact Outline state in light appearance                                             |
| [`10-playground-canvas-light-320x696.jpg`](screenshots/10-playground-canvas-light-320x696.jpg)                             | Compact light shell after closing the leading pane, restoring a 224 px canvas center           |
| [`11-playground-inspector-light-320x696.jpg`](screenshots/11-playground-inspector-light-320x696.jpg)                       | Compact light shell with the trailing Inspector negotiated to full width                       |

Exact artifact and screenshot hashes, geometry, colors, and page-overflow facts are in
[`computed/package-baseline-metrics.json`](computed/package-baseline-metrics.json). Trusted pointer,
wheel, keyboard, menu, selection, drag, and focus results are in
[`interactions/browser-gate-traces.json`](interactions/browser-gate-traces.json).

## Locked package facts

- At 1492 x 696, the 1428 x 456 shell has a 335 px open leading region, a 1053 px canvas center,
  and a 40 px closed trailing rail. Opening the Inspector negotiates a 500 px trailing region and
  a 593 px center without page overflow.
- Pointer resizing moves the leading region from 335 px to 370 px; keyboard ArrowRight moves it
  from 335 px to 345 px. Full width consumes the center and closes the opposite pane, then restores
  the remembered 370 px width.
- The Outline contains 23 canonical rows, retains one roving tab stop, and moves/activates with the
  documented Arrow, Home, End, and Space behavior.
- The selected-item Inspector renders one label row, one UI-type row, and one configuration row;
  the developer-rejected duplicate value row is absent.
- The pane menu remains 160 px wide with a 6 px radius and the accepted light/dark surfaces. Its
  trailing-edge placement stays inside the viewport.
- The accepted switch paint remains opaque in all four state/appearance combinations. Converting
  the slider item to an unchecked Switch produces `rgb(65, 80, 108)` in dark appearance.
- The item divider moves `257px 12px 253px` to `267px 12px 243px` with ArrowRight, then a trusted
  browser `dblclick` restores the exact default split.
- Horizontal wheel input over the vertical item scroller pans the canvas while leaving
  `scrollTop` at zero; vertical input advances `scrollTop` to 140 while leaving the viewport fixed.
- Rotary wheel input changes only the control. The following pane-horizontal gesture moves the
  viewport while the URL stays `http://127.0.0.1:4173/` and no browser dialog appears.
- A trusted full-surface drag moves the idle section while leaving the camera fixed and reports one
  canonical document change.
- The 320 px host has no page-level horizontal overflow. Open Outline/Inspector panes take the
  compact center as designed; closing them restores a 224 px canvas and a clamped 194 x 145.5 px
  minimap.

## Gate status at this commit

- Package production build and built-artifact boundary: pass.
- Playground production build: pass.
- Package suite: 109 files, 791 tests passed.
- Playground suite: 5 files, 29 tests passed.
- Production Chrome browser gate: pass for desktop/compact appearance, effective 200% reflow,
  pane open/close/resize/full-width, pane-tab and Outline navigation, Inspector type changes,
  trusted divider reset, creation and selection menus, section drag, wheel ownership, focus
  restoration, URL stability, page overflow, dialogs, and warning/error console output.
- Supply-chain gate: **pending**. The 2026-08-14 02:00 UTC run passed dependency policy, frozen
  install, lockfile synchronization, and the independent seven-day audit for all 611 locked
  versions, then `pnpm audit` newly reported high-severity
  `GHSA-2v37-7h3g-55p8` on `postcss -> nanoid@3.3.17`. The only 3.x fix,
  `nanoid@3.3.18`, was published at 2026-08-07 16:41:05 UTC and had not yet cleared the mandatory
  seven-day release-age policy. No exception, override, or policy weakening was added. The
  earliest compliant retry is after 2026-08-14 16:41:05 UTC.
- The final all-files static gate and exact packed-consumer proof remain scheduled after that
  focused supply-chain remediation succeeds. They were not started after the authorized security
  gate failed.
