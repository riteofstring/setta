# Milestone A accepted-output baseline and post-acceptance correction

This bundle locks the structural section and group authoring output that the developer explicitly
accepted on 2026-08-14. The acceptance and authorization to record the baseline are in the UX plan
at commit `ca10df2a7`. These files preserve already-approved output; they do not perform or replace
developer visual approval.

## Provenance

- Accepted source: `workspace-extraction` at
  `ca10df2a7f8a6904cd1db5dc9b8428a85042b086`.
- Post-acceptance correction: this bundle's commit also makes promoted child measurements part of
  the atomic ungroup document and ignores an equivalent follow-up node measurement. The focused
  production-browser trace therefore observes one document-change notification for ungroup while
  preserving the accepted placement, focus, and paint.
- Frozen reference: `../setta-main` remained clean on `main` at
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; it was neither modified nor relaunched for this
  post-acceptance package recording.
- Built surface: fresh `@setta/workspace` and playground production builds served from
  `apps/playground/dist` at `http://127.0.0.1:4173/`.
- Browser surface: connected Google Chrome with CSS-viewport-sized JPEG captures.
- Capture date: 2026-08-14 in `America/Los_Angeles`.
- Chrome reported no warning or error, dialog, or URL drift during the focused browser gate.

The supervised developer gate remains the authority for the matched frozen-main comparison,
actual browser 200% scale, keyboard and screen-reader operation, RTL, and coarse-pointer behavior.
Capture 07 uses the 756 x 431 CSS viewport obtained by halving the accepted 1512 x 861 surface. It
locks the same reflow boundary without claiming to repeat or replace the completed live gate.

## Screenshot manifest

| File                                                                                                                                       | State                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [`01-accepted-structure-dark-1512x861.jpg`](screenshots/01-accepted-structure-dark-1512x861.jpg)                                           | Accepted nested structure and supplementary color tags in dark appearance                    |
| [`02-accepted-structure-light-1512x861.jpg`](screenshots/02-accepted-structure-light-1512x861.jpg)                                         | The same accepted structure in light appearance                                              |
| [`03-group-header-menu-dark-1512x861.jpg`](screenshots/03-group-header-menu-dark-1512x861.jpg)                                             | Root group header menu with package actions followed by compatible host actions              |
| [`04-group-inspector-bounded-dark-1512x861.jpg`](screenshots/04-group-inspector-bounded-dark-1512x861.jpg)                                 | Selected root group Inspector with bounded overflow, ungroup, and size controls              |
| [`05-section-tag-color-editor-light-1512x861.jpg`](screenshots/05-section-tag-color-editor-light-1512x861.jpg)                             | Selected leaf and host-extended color-tag editor in light appearance                         |
| [`06-compact-group-menu-dark-320x861.jpg`](screenshots/06-compact-group-menu-dark-320x861.jpg)                                             | Compact 320 px host with the complete group menu kept inside the viewport                    |
| [`07-accepted-structure-dark-756x431-effective-200-percent.jpg`](screenshots/07-accepted-structure-dark-756x431-effective-200-percent.jpg) | Dark responsive layout at the desktop surface's effective 200%-scale CSS viewport dimensions |

Exact screenshot hashes, built-artifact hashes, geometry, menu contents, palette contents, and
overflow facts are in [`computed/package-baseline-metrics.json`](computed/package-baseline-metrics.json).
Trusted operation, focus, scroll, reload, and notification results are in
[`interactions/browser-gate-traces.json`](interactions/browser-gate-traces.json).

## Locked package facts

- The desktop group menu remains 160 x 119 px and orders package-owned `Overflow Mode` and
  `Ungroup` before the host's `Report selection` and `Ungroup selection`. Escape closes the menu
  and restores focus to the collapsed `Open group actions` trigger.
- At 320 px, the complete four-action menu narrows to 128 px and remains within the viewport at
  x 122.5 through right edge 250.5. Desktop dark/light, compact, and effective-200% captures have
  no page-level horizontal or vertical overflow.
- The authored bounded root group remains 520 x 360 with a 274 px client-height scroll surface
  over 424 px of content. A trusted vertical wheel advances its `scrollTop` from 0 to 150 while
  leaving the canvas transform and URL unchanged and opening no dialog.
- Reload emits no host document change, retains the mounted group's `scrollTop` at 150, and
  restores the authored bounded state. Auto mode removes the direct scroller and expands the
  group to 766 x 496; bounded mode restores the serialized 520 x 360 dimensions.
- The root-group Inspector exposes pressed bounded overflow, enabled ungroup, and the exact
  520 x 360 size. Header menu and Inspector actions still route to the same public operations.
- The default palette contains the captured Red, Orange, Yellow, Green, Cyan, Blue, Purple, and
  Slate categories; the host adds `Host teal` (`#0f766e`). Reset produces `None · no tag color`,
  disables itself, and emits one document change. Choosing Host teal restores the text, color,
  Outline annotation, and one document change, so color is never the only cue.
- Header-menu ungroup removes the root group, promotes Nested leaf and Nested group in order after
  the surviving top-level sections, preserves the deeper horizontal-group order, prunes the
  removed selection, focuses the first promoted `Nested leaf section`, and emits exactly one
  document change. The promoted outer geometry is recorded as 202 x 124 and 718 x 284.

## Post-acceptance verification

- Fresh package production build and built-artifact boundary: pass.
- Fresh playground production build: pass.
- Package suite: 114 files, 837 tests passed.
- Focused production Chrome gate: pass for menu composition and focus restoration, ungroup order,
  focus and single notification, bounded scrolling and reload, tag reset and host palette,
  desktop dark/light, compact 320 px, effective-200% reflow, URL stability, dialogs, page
  overflow, and warning/error console output.
