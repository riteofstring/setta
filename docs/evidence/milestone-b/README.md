# Milestone B accepted-output baseline and post-acceptance scroll correction

This bundle locks the parameter authoring and feedback output that the developer explicitly
accepted on 2026-08-14. The acceptance and authorization to record the baseline are in the UX plan
at commit `c92db75ec`; the developer-requested quick-info corrections were accepted through
`06cb64534`. These files preserve already-approved output; they do not perform or replace developer
visual approval.

## Provenance

- Accepted source: `workspace-extraction` at
  `c92db75ec5eb4571d2ee1bcf56eeb394e9a89000`.
- Post-acceptance correction: this bundle's commit keeps the last unfiltered parameter-list scroll
  position authoritative when a short filter result makes the browser clamp the live `scrollTop`
  to zero. Clearing the filter restores the accepted position without remounting the list or
  notifying the host document.
- Frozen reference: `../setta-main` remained clean on `main` at
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; it was neither modified nor relaunched for this
  post-acceptance package recording.
- Built surface: fresh `@setta/workspace` and playground production builds served from
  `apps/playground/dist` at `http://127.0.0.1:4173/`.
- Browser surface: connected Google Chrome with CSS-viewport-sized JPEG captures at DPR 1.
- Capture date: 2026-08-14 in `America/Los_Angeles`.
- Chrome reported no warning or error, dialog, or URL drift during the focused browser gate.

The supervised developer gate remains the authority for the matched frozen-main comparison,
actual browser 200% scale, keyboard and screen-reader operation, RTL, coarse-pointer behavior, all
accepted built-in parameter types, and the custom renderer. Capture 07 uses the 756 x 431 CSS
viewport obtained by halving the accepted 1512 x 861 surface. It locks the same reflow boundary
without claiming to repeat or replace the completed live gate.

## Screenshot manifest

| File                                                                                                                                         | State                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`01-accepted-parameters-dark-1512x861.jpg`](screenshots/01-accepted-parameters-dark-1512x861.jpg)                                           | Accepted parameter panel with error, warning, and information diagnostics in dark mode       |
| [`02-accepted-parameters-light-1512x861.jpg`](screenshots/02-accepted-parameters-light-1512x861.jpg)                                         | The same accepted parameter and diagnostic state in light mode                               |
| [`03-filter-hidden-selection-dark-1512x861.jpg`](screenshots/03-filter-hidden-selection-dark-1512x861.jpg)                                   | Package filter with one result and an explicit hidden-selection explanation                  |
| [`04-frozen-parameter-help-dark-1512x861.jpg`](screenshots/04-frozen-parameter-help-dark-1512x861.jpg)                                       | Frozen, body-portaled alpha help on page two of its diagnostic/help quick-info sequence      |
| [`05-updated-diagnostics-dark-1512x861.jpg`](screenshots/05-updated-diagnostics-dark-1512x861.jpg)                                           | Ephemeral host update changing alpha to warning and beta to error                            |
| [`06-compact-parameter-panel-dark-320x861.jpg`](screenshots/06-compact-parameter-panel-dark-320x861.jpg)                                     | Compact 320 px host focused on the accepted parameter panel                                  |
| [`07-accepted-parameters-dark-756x431-effective-200-percent.jpg`](screenshots/07-accepted-parameters-dark-756x431-effective-200-percent.jpg) | Dark responsive layout at the desktop surface's effective-200%-scale CSS viewport dimensions |

Exact screenshot hashes, built-artifact hashes, geometry, filter contents, and responsive facts
are in [`computed/package-baseline-metrics.json`](computed/package-baseline-metrics.json). Trusted
authoring, filter, quick-info, diagnostic, and browser-health results are in
[`interactions/browser-gate-traces.json`](interactions/browser-gate-traces.json).

## Locked package facts

- The accepted panel renders all three diagnostic severities with distinct row treatments, icons,
  accessible descriptions, and an aggregate status. Desktop dark and light captures have no
  page-level horizontal or vertical overflow.
- Host-side insertion through the public API appends one factory-owned UUID item, selects it, and
  emits one document notification. Host-side deletion removes that item, selects `item-rename` as
  the predictable predecessor, and emits one notification.
- Filtering `momentum` renders only its `item-options` ancestor and `item-momentum`, retains the
  canonical hidden selection, and exposes both visible and screen-reader explanations. After
  filter focus is established, query and clear emit no document notifications.
- A trusted vertical wheel moves the list to `scrollTop` 190. The short result clamps the live
  value to 0; clearing restores 190, keeps the filter input focused, and reuses the list element.
- Alpha quick info opens outside section clipping as a two-page frozen dialog. Page one reports the
  error, page two contains the serializable help, copy returns the exact help text, and Escape
  closes the dialog. The page-two dialog remains 256 x 174 px and inside the desktop viewport.
- Replacing diagnostics announces the new warning/error registry without notifying the document;
  clearing removes every marker and announces `Parameter diagnostics cleared.` The host can then
  restore error, warning, and information severities without changing the document.
- The compact and effective-200% captures keep page overflow false while the canvas remains
  pannable and the complete 550 px parameter toolbar retains its accepted internal geometry.

## Post-acceptance verification

- Fresh package production build and built-artifact boundary: pass.
- Fresh playground production build: pass.
- Focused Milestone B package selectors: 6 files, 63 tests passed.
- Focused playground public-host selector: 1 file, 20 tests passed.
- Changed-module policy suites: workspace 120 files / 912 tests, playground 5 files / 33 tests,
  and the delivery contract passed.
- Changed-file deterministic quality and offline supply-chain checks: pass.
- Focused production Chrome gate: pass for public host insertion/deletion and notification count,
  hidden selection, ephemeral filtering, corrected scroll restoration, multi-page freeze/copy,
  diagnostic update/clear announcements, desktop dark/light, compact 320 px, effective-200%
  reflow, URL stability, dialogs, page overflow, and warning/error console output.
