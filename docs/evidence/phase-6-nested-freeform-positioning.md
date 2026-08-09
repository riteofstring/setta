# Phase 6 Nested-Freeform Positioning Evidence

## Result and scope

The production recursive section frame now exposes a named ordered/freeform positioning control,
and the final implementation-time performance/browser matrix for nested freeform behavior is
recorded. The control uses the existing strict `setSectionChildPositioning` command and the selected
package-owned recursive DOM representation; it adds no public type, compatibility path, nested
XYFlow instance, or alternate geometry owner.

This completes the repository-actionable absolute/freeform nested-positioning batch. Complete
descendant-subtree minimization remains the next repository-actionable Phase 6 capability, followed
by the phase audit.

## Conversion and reconciliation ownership

Ordered-to-freeform activation measures the keyed direct-child placement rectangles, normalizes the
block to non-negative local coordinates, and supplies one complete position map to the existing
controller command. It commits directly because every child retains its displayed offset. Missing
or stale geometry rejects specifically instead of synthesizing coordinates.

Freeform-to-ordered activation opens one native dialog with vertical and horizontal choices. A pure
materiality comparison projects the selected order from current child sizes, gap, surface width,
orientation, and LTR/RTL direction. It compares every canonical child position with a small pixel
tolerance. A matching arrangement commits without another prompt; a materially different
arrangement advances to an explicit confirmation step. Cancel is the initially focused safe action.

Every accepted conversion remains one `section-positioning` document proposal and history entry.
The React owner waits for the controlled document to match the exact requested discriminator,
orientation, IDs, and positions before reporting acceptance. A retained host document, a command
rejection, an unchanged layout, or unavailable geometry publishes no false success. The conversion
preserves child identity, canonical order, overflow, nested renderer ownership, and selection.

## Interaction and accessibility

The positioning control is a native icon button whose accessible name states the target operation.
It is available only for a live container with layout editing and required geometry, and it is
disabled while the section is locked or minimized. Ordered orientation controls remain absent in a
freeform layout. Positioning chrome is exposed for the directly selected or focused header, not an
ancestor merely containing descendant focus, so nested interaction does not expand unrelated
header geometry.

The native dialog has a programmatic title and description. Its choice step exposes two ordinary
buttons; its material-change step states the child count and destination order. Close, Cancel, and
Escape retain the document and restore trigger focus. The dialog is marked as a local-shortcut
surface, preventing Escape from also clearing canvas selection. Accepted, rejected, unchanged, and
controlled-host-retained outcomes use one pre-mounted polite live region. Styles preserve the
package focus outline, coarse-pointer sizing, bounded narrow width, logical layout, and reduced
motion.

## Playground and packed consumer

The backend-free nested-freeform route demonstrates conversion at representative mixed depth. A
`reject-positioning` fixture retains a controlled host document so the browser workflow can verify
that canonical freeform placement, focus, and announcement reconcile correctly.

The unrelated temporary consumer selects a packed freeform container through declared React
output, requests vertical ordered layout through the production dialog, then converts back to
freeform through the named control. It checks the exact public DOM state after both changes and uses
no source alias or internal import. `corepack pnpm consumer:check` passed lockfile policy, strict
TypeScript/Vite build, and Chromium runtime verification.

## Performance and browser matrix

The append-only record is
`perf/phase-6-nested-freeform-performance.md`. On the recorded Node 24.18.1 Darwin arm64 runner, 80
alternating public-controller conversions of one 512-child container completed in 867.521 ms with
checksum `2,498,560`; the complete milestone suite checksum was `149,675,570`. Each iteration
asserts an accepted command and the complete canonical child/position shape. This is structural
regression evidence, not an elapsed-time support threshold.

Focused Chromium coverage establishes the following implementation matrix:

| Contract                                    | Focused proof                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Material confirmation and direct conversion | The positioning workflow verifies freeform-to-vertical confirmation, safe Escape, exact focus/selection retention, one accepted change, measured ordered-to-freeform coordinates without a dialog, a materially matching no-confirmation return, live feedback, and Axe.                                               |
| Controlled reconciliation                   | The rejection fixture retains the exact freeform region, publishes no accepted change, restores trigger focus, and announces host retention.                                                                                                                                                                           |
| Integrated nested behavior                  | Eleven adjacent workflows remain green for static schema-v2 projection, same-parent pointer/keyboard movement, cross-layout reparenting, nested paste/drop, grouping/ungrouping, nested scrolling and outer zoom, touch input, recursive grouping, minimization, ordered orientation/overflow, and top-level grouping. |
| Interaction ownership                       | A focused recursive workflow verifies that descendant structural movement excludes root/viewport owners and that indirect ancestor positioning chrome stays hidden.                                                                                                                                                    |
| Reflow and input variants                   | The 320-CSS-pixel/200%-scale scenario verified no horizontal page overflow, keyboard dialog activation, reduced motion, and dialog Axe before exposing Escape propagation. The local-shortcut fix is covered post-change by the exact Escape/focus/selection assertions in the positioning workflow.                   |

The loop's duplicate-failure limit was observed. The complete reflow scenario and three older
empty-container collision scenarios were not run a prohibited third time after their final focused
corrections. The replacement Escape and ancestor-chrome ownership probes are green, the adjacent
11-workflow matrix is green, and the unchanged exact scenarios remain committed for the Phase 6
audit rather than being deleted or weakened.

## Visual proof

The new 1,280 by 1,000 positioning-confirmation baseline and every refreshed 1,152 by 701 nested,
grouping, movement, placement, overflow, and selection baseline were inspected at original
resolution. They show a readable modal title and material-change explanation, separated safe and
commit actions, current selection/focus cues, unclipped directly owned positioning chrome, local
movement/drop previews, and no unexpected ancestor-control expansion. The standing unavailable
in-app-browser release gate was not retried.

## Verification boundary

- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 were used.
- Focused Vitest coverage passes 57 tests across the positioning command, positioning React
  geometry, static React contract, and canvas integration files. It covers strict position maps,
  history, RTL materiality, missing geometry, accessible control state, announcement ownership, and
  internal artifact allowlisting.
- The focused browser commands described above pass the new positioning, controlled retention,
  nested integration, and interaction-ownership selectors, with Axe and inspected Chromium
  baselines.
- `corepack pnpm perf:milestone` and `corepack pnpm consumer:check` pass with the results recorded
  above.
- Changed-file quality passes repository/import boundaries, deterministic dependency policy,
  formatting, lint and complexity, file lengths, strict types, dead-code analysis, unit and boundary
  tests, plan-loop automation, package/playground builds, exact tarball contents, documentation
  links, and the declaration report.
- No manifest, lockfile, dependency, lifecycle-script allowlist, trust policy, or exception changed,
  so the network-backed supply-chain gate was not duplicated. The recorded unavailable in-app
  browser release gate was not retried.

## Remaining repository-actionable work

Phase 6 next implements complete descendant-subtree minimization without changing the existing
default in which minimizing a section unmounts only its host-rendered body and retains its child
region.
