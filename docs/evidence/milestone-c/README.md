# Milestone C accepted-output baseline and design records

This bundle locks the workspace-command and toolbar-extension output that the developer explicitly
accepted on 2026-08-15. The acceptance and the authorization to record the baseline are in the UX
plan at commit `a0e50eccf`. These files preserve already-approved output; they do not perform or
replace developer visual approval.

## Provenance

- Accepted source: `workspace-extraction` at
  `a371f749bcfe708131db14b90d3e8795238c2217`, the last source commit before the developer completed
  the C4 live gate.
- Pre-acceptance phase audit over C1–C3: `06bc14516ed8b99363a26a832455e84765f41b3d`, which made
  binding-conflict detection answer for the platform the workspace runs on and made the playground
  subscribe its host command state where it mounts the workspace.
- Frozen reference: `../setta-main` remained clean on `main` at
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; it was neither modified nor relaunched for this
  package recording.
- Built surface: fresh `@setta/workspace` and playground production builds served from
  `apps/playground/dist` at `http://127.0.0.1:4173/`.
- Browser surface: headless Google Chrome 152.0.7977.42 (`--headless=new`) driven over the DevTools
  protocol, with CSS-viewport-sized JPEG captures at DPR 1. The milestone-a and milestone-b bundles
  were captured from a connected Chrome, so compare those bundles by state rather than by pixel.
- Capture date: 2026-08-15 in `America/Los_Angeles`.
- Chrome reported no warning or error, no dialog, and no URL drift across the four browser sessions
  this recording used.
- Capture 01 was re-recorded during the post-acceptance milestone audit, from the same accepted
  build artifacts and the same browser and viewport. The first recording caught the minimap
  mid-transition — the panel animates its 150 ms pane-inset translation on load, and the capture
  landed at roughly half of it, showing the minimap still behind the Outline pane while captures
  02–06 of the same surface show it settled. Wait for that transform to reach its inset before
  capturing this workspace.

The supervised developer gate remains the authority for the matched frozen-main comparison, actual
browser 200% scale, screen-reader operation, RTL, coarse-pointer interaction, browser-native
shortcuts, and macOS swallowed-key recovery. Two facts here are bounded by synthetic input:
Chrome's native macOS editing commands do not run for dispatched keys, so the caret's own
select-all is not asserted, and the compact coarse-pointer hit geometry was measured with touch
emulation rather than a real touch device. Capture 08 uses the 756 x 431 CSS viewport obtained by
halving the accepted 1512 x 861 surface; it locks the same reflow boundary without claiming to
repeat the completed live gate.

## Screenshot manifest

| File                                                                                                                                     | State                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`01-accepted-commands-dark-1512x861.jpg`](screenshots/01-accepted-commands-dark-1512x861.jpg)                                           | Accepted desktop workspace in dark mode with the contributed toolbar controls around the package groups |
| [`02-accepted-commands-light-1512x861.jpg`](screenshots/02-accepted-commands-light-1512x861.jpg)                                         | The same workspace and toolbar column in light mode                                                     |
| [`03-section-header-menu-dark-1512x861.jpg`](screenshots/03-section-header-menu-dark-1512x861.jpg)                                       | The root group's header menu: package overflow and ungroup entries above the two host section commands  |
| [`04-pane-creation-menu-dark-1512x861.jpg`](screenshots/04-pane-creation-menu-dark-1512x861.jpg)                                         | The pane menu over empty canvas: the host creation catalog, the host pane action, and the host toggle   |
| [`05-inspector-command-actions-dark-1512x861.jpg`](screenshots/05-inspector-command-actions-dark-1512x861.jpg)                           | Inspector action rows for the selected group, including the disabled Group row and its explanation      |
| [`06-host-toolbar-state-and-shortcuts-dark-1512x861.jpg`](screenshots/06-host-toolbar-state-and-shortcuts-dark-1512x861.jpg)             | The pressed contributed toggle with the host's platform chord labels open beside it                     |
| [`07-compact-commands-dark-320x861.jpg`](screenshots/07-compact-commands-dark-320x861.jpg)                                               | Compact 320 px host with the complete toolbar column                                                    |
| [`08-accepted-commands-dark-756x431-effective-200-percent.jpg`](screenshots/08-accepted-commands-dark-756x431-effective-200-percent.jpg) | Dark responsive layout at the desktop surface's effective-200%-scale CSS viewport dimensions            |

Exact screenshot hashes, built-artifact hashes, toolbar and menu geometry, page-overflow facts, and
the platform chord labels are in
[`computed/package-baseline-metrics.json`](computed/package-baseline-metrics.json). Trusted command,
binding, creation, contribution, conflict, and browser-health results are in
[`interactions/browser-gate-traces.json`](interactions/browser-gate-traces.json).

## Locked package facts

- Ungroup runs identically from all five of its action surfaces. The section header menu, the
  section context menu, the Outline row menu, the Inspector action row, and `Shift + ⌘ + G` each
  produce one identical resulting structure, exactly one document change notification, and a
  cleared selection. Focus lands inside the surface that invoked the operation: the canvas surfaces
  focus the promoted child section, the Outline row menu keeps focus on the equivalent Outline row,
  and the Inspector keeps focus in its own selection region.
- Every surface shows the same command vocabulary. The header menu carries the checked overflow
  toggle, ungroup, and the two host section commands; the pane menu carries the host creation
  catalog above the host pane actions with the toggle painted as a checkbox; the Inspector shows
  Group, Ungroup, Delete, and the host action, with the disabled Group row explaining
  `Grouping needs at least two selected sections.`
- The chord labels are this platform's. `Mod` prints as `⌘`, the package's three focus chords stay
  on `Ctrl + Shift + 2/3/4`, the host's own lock and unlock bindings print as `⌘ + Alt + L` and
  `⌘ + Alt + U`, and the host creation commands answer to `N` and `G`.
- Conflict detection answers for the same platform. Asking to move locking onto `Mod + G` reports
  `⌘ + G is already taken by workspace.group-sections and workspace.lock-sections.`
- The viewport bindings run the operations the toolbar runs: `F` fits the workspace to zoom
  0.457766, `Equal` zooms to 0.54932, `Minus` returns to 0.457766, `⌘ + Comma` resets to 1, and `Z`
  re-centres the pointer location at the default zoom.
- `⌘ + A` selects all 23 sections; `⌘ + Shift + A` selects the 16 top-level non-group sections.
  `Alt + J` and `Alt + K` walk the canvas reading order forwards and back, and
  `Ctrl + Shift + 2/3/4` move focus to the leading pane, the canvas, and the trailing pane.
- The creation chord appends one host note created `from the keyboard`, selects it, and travels the
  canvas to it because it landed out of sight; the change callback fired 16 times across that
  insertion and its animated travel. The contributed creation control creates the same section from
  no pointer position, and its run fired the callback twice.
- The contributed controls carry command state, not their own. The highlight toggle moves from
  `aria-pressed="false"` to `"true"` and the pane menu's checkbox reads `aria-checked="true"` for
  the same command. `Clear host action status` refuses through `aria-disabled` rather than the
  native attribute, keeps the reference's 0.4 disabled opacity, names
  `There is no host action status to clear yet.`, becomes available once a host action publishes a
  status, resets that status when it runs, and then refuses again.
- An editable target keeps its own chords. With the caret in a section's parameter filter,
  `⌘ + A` did not select the workspace's sections and `N` typed into the field instead of creating a
  section, and the filtering itself reported no document change.
- The toolbar column is 32 x 330 px with ten controls: the contributed creation control above the
  package's viewport group, and the host toggle and refusing action between the viewport and
  minimap groups. Desktop, compact 320 px, and effective-200% captures all keep page overflow
  false, and the compact controls keep their 24 px coarse-pointer hit areas around the unchanged
  painted box.

## Post-acceptance verification

- Fresh package production build and built-artifact boundary: pass.
- Fresh playground production build: pass.
- Changed-file formatting and quality checks: pass.
- Changed-module policy suites: no suite matched, because this recording changes evidence and plan
  status only and leaves package and playground source untouched.
- Focused production Chrome recording: pass for five-surface ungroup consistency, menu and
  Inspector vocabulary, platform chord labels and conflict reporting, viewport and selection
  bindings, section navigation, focus scopes, keyboard and toolbar creation, contributed toggle and
  refusal state, editable-target exclusion, desktop dark and light, compact 320 px, effective-200%
  reflow, URL stability, dialogs, page overflow, and warning or error console output.

## Post-acceptance milestone audit

The audit over the accepted milestone corrected two defects, both recorded in
[C4 gate corrections](c4-gate-corrections.md):

- A canvas its own panes covered completely refused to frame anything. At the compact 320 px host,
  activating an Outline row raised `Cannot fit bounds without a visible workspace canvas area.`
  before the section was selected or focused; the `Z` chord, a minimap click, and a keyboard
  creation's travel raised it from `setCenter`. Production Chrome now activates an Outline row,
  runs the chords, and creates and travels to a section at 320 px without an exception, and a
  1512 px fit view still lands on the `x 375.695, y 254.17, zoom 0.457766` this bundle records.
- Capture 01 held the minimap mid-transition rather than at its accepted position. It is
  re-recorded from the same accepted artifacts, with the capture trap noted in Provenance.

The measured results are in
[`interactions/post-audit-checks.json`](interactions/post-audit-checks.json). The full ordinary
test profile and both production builds pass on the corrected tree; builds from it no longer match
the built-artifact hashes above, which stay the accepted commit's.

## Design records

The package-only decisions and the deliberate behavior changes each Milestone C batch introduced:

- [C1 command registry](c1-command-registry.md)
- [C2 key bindings](c2-key-bindings.md)
- [C2 viewport and selection bindings](c2-viewport-and-selection-bindings.md)
- [C2 focus scopes and section navigation](c2-focus-and-navigation-bindings.md)
- [C2 creation chords and empty-space placement](c2-creation-bindings.md)
- [C3 host toolbar contributions](c3-toolbar-contributions.md)
- [C4 gate corrections: press activation and physical viewport insets](c4-gate-corrections.md)

### Frozen reference

Frozen main at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` has no command registry. Its actions are
written directly into each surface — section header buttons, context menus, Inspector panes — and
its shortcut engine binds separate application handlers. The registry, its surfaces, and its
disabled-state explanations are therefore package design accepted during Milestone C at
`a0e50eccf`, not main parity. Every canonical operation the commands run is unchanged accepted
package behavior.
