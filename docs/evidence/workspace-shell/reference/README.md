# Workspace-shell frozen-reference preflight

Reference: `../setta-main` verified clean on `main` at
`043d3b2e9c69caf99d1246f1408b3ad7194b7864` on 2026-08-12. This directory is the
repository-actionable source and ownership half of the workspace-shell evidence preflight. It is
not a completed live reference bundle, package-output evidence, or developer approval.

The detailed dependency cone, state-read classification, algorithm boundary, and package seam are
in [`ownership-map.md`](ownership-map.md).

## Existing accepted evidence that remains usable

The workspace-shell amendment postdates Phase 0, so the earlier bundle is incomplete for this
milestone. These accepted captures still establish a small subset of the shell reference without
being copied or relabelled:

| Existing evidence                                                                                                                                                                   | What it proves                                                                                                                                            | What it does not prove                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Desktop dark](../../phase0/reference/screenshots/01-full-workspace-dark-1440x900.png) and [desktop light](../../phase0/reference/screenshots/02-full-workspace-light-1440x900.png) | Left Overview pane open at its normal desktop width, both 40 px icon rails, right pane closed, pane/canvas seams, minimap placement, and light/dark paint | Pane resizing, paired panes, full width, context menus, right pane contents, focus, or transitions |
| [Narrow dark](../../phase0/reference/screenshots/22-narrow-workspace-dark-800x900.png)                                                                                              | The existing 800 px product layout and the Overview list's depth indentation                                                                              | The milestone's 320 px package shell, paired-pane negotiation, or an accessible collapsible tree   |
| [Browser 200% dark](../../phase0/reference/screenshots/23-browser-page-scale-200-dark.png)                                                                                          | Frozen main's effective 200% product presentation and the still-flat Overview list                                                                        | The package's already-accepted 200% reflow contract or any new shell behavior                      |
| [Phase 0 style metrics](../../phase0/reference/computed/reference-style-metrics.json)                                                                                               | Previously accepted canvas, toolbar, minimap, section, and z-layer facts                                                                                  | Pane, rail, context-menu, Outline, and Inspector metrics required by this milestone                |

No existing capture shows an open right pane or a workspace context menu. None can satisfy the new
matched dark/light evidence requirement by itself.

## Required live capture matrix

The following states remain uncaptured. Rows marked **producible** have a frozen-main source path
and must be captured by the supervised implementation loop before their corresponding user-visible
batch. Rows marked **absent / authorized new behavior** cannot be produced by the frozen reference
at the recorded commit; their source proof is the pre-implementation evidence, while the milestone
contract and final combined developer gate govern their implementation.

| Surface                                                                         | Frozen-main status                   | Required evidence before implementation                                                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pane creation menu at each viewport edge                                        | Producible by pointer                | Dark/light original-pixel captures; search, filtering, arrow/Enter/Escape trace; computed menu geometry, overflow, focus, and created workspace coordinate                           |
| Section and multi-selection menu                                                | Producible by pointer                | Single and mixed locked/unlocked selections, capability-disabled actions, labels, geometry, focus, and dismissal                                                                     |
| Left/right rails and panes                                                      | Producible                           | Closed, open, resized, simultaneous, full-width, restored, viewport-normalized, and narrow states; resize and focus traces; paint, seam, stacking, overflow, and transition metrics  |
| Overview nested section listing                                                 | Partially producible                 | Dark/light nested rows and pointer/Space activation can be captured; depth, type, color, and focus metrics can be measured                                                           |
| Overview collapsed groups, selected-row treatment, and tree keyboard navigation | **Absent / authorized new behavior** | Frozen main has no disclosure state or control, no selected-section row state, no tree semantics, and no roving/arrow navigation to capture; implement the milestone's tree contract |
| UI Editor with no selection and exactly one selected section                    | Producible                           | Placeholder and ordinary section/UI configuration presentations in both appearances                                                                                                  |
| Selection-aware UI Editor for exactly one selected item                         | **Absent / authorized new behavior** | Item selection is not an input to `UiEditor`; use its UI-control presentation as the visual seed and implement the milestone's selected-item contract                                |
| Selection-aware UI Editor for multiple selected sections                        | **Absent / authorized new behavior** | Multiple active sections produce the generic placeholder; implement only the common actions expressly named by the milestone                                                         |
| Menu-key/Shift+F10 context-menu opening                                         | **Absent / authorized new behavior** | Frozen main opens menus only from pointer `contextmenu`; implement the milestone's keyboard invocation and focus-restoration contract                                                |

## Source-proven reference gaps

### Overview is not the planned Outline

Frozen main's `ProjectOverview.tsx` recursively flattens visible sections into records containing
only `id`, `name`, `depth`, `tagColor`, and an application AI-working flag. `SectionListItems.tsx`
then renders every record as an independent `li` with `tabIndex={0}`, a physical
`marginLeft: 0.75rem * depth`, pointer activation, and Space activation.

There is no group disclosure field, local expansion state, disclosure button, `tree`/`treeitem`
role, `aria-expanded`, roving tab stop, arrow/Home/End/typeahead handler, selected-section input, or
locked/minimized input in this cone. The only `aria-expanded` in `ProjectOverview.tsx` belongs to
the unrelated tag-filter popover. The value named `activeSectionIds` is derived from AI runs and
drives the “AI working” badge; it is not canonical workspace selection. The accepted narrow and
200% Phase 0 captures above visibly corroborate the flat always-expanded list.

### UI Editor is not selection-aware at item or multi-section granularity

`UiEditor.tsx` reads `useSolelyActiveSectionUIId()`. Exactly one active section selects a
section-type-specific tab. Zero or multiple active sections render `Select A Section to Edit`
unless exactly one application workflow edge is selected. `UIConfig.tsx` obtains every parameter
id/name for that sole section and renders all of them; it never reads selected parameter ids.

Consequently, frozen main supplies useful pane paint, empty-state, section-config, and parameter
UI-config presentation references, but it has no one-selected-item inspector branch and no
multi-section lock/delete/group inspector branch. Those are approved product additions in the
milestone prose, not extractable executable reference states.

### Workspace menus have pointer invocation only

`Pane.tsx` opens the creation menu from a background `contextmenu` event, and
`NodesSelection.tsx` opens the selection menu from its selection rectangle's `contextmenu` event.
No key-activation or context-menu module handles the Menu key or Shift+F10. The pane menu's keyboard
helper covers filter editing and navigation after the menu is open; it does not provide keyboard
invocation or invocation-owner focus restoration.

## Gate conclusion

The ownership preflight is complete, and the authority gap is resolved by the developer's explicit
2026-08-12 authorization of the workspace-shell amendment. The Outline tree interactions,
selection-aware Inspector branches, and keyboard context-menu invocation are new, opinionated
package behavior governed by the milestone's concrete contracts. Frozen main remains authoritative
for the surrounding pane/menu behavior and presentation seeds that it actually implements. No
reference re-baseline is required, and the source-proven absent states must not be represented as
matching-main captures.

The remaining producible dark/light states still require capture before their corresponding
user-visible shell/menu batch. The existing frozen-main service and deterministic browser tooling
may be used under root supervision; no intermediate developer approval is required. The typed item
schema is therefore the next actionable batch, and the combined milestone gate remains the sole
developer visual/interaction approval.
