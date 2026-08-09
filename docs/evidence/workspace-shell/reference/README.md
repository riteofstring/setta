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
and can be captured in a supervised reference session. Rows marked **absent** cannot be produced by
the frozen reference at the recorded commit; the exact source findings are below.

| Surface                                                                         | Frozen-main status                  | Required evidence before implementation                                                                                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pane creation menu at each viewport edge                                        | Producible by pointer               | Dark/light original-pixel captures; search, filtering, arrow/Enter/Escape trace; computed menu geometry, overflow, focus, and created workspace coordinate                          |
| Section and multi-selection menu                                                | Producible by pointer               | Single and mixed locked/unlocked selections, capability-disabled actions, labels, geometry, focus, and dismissal                                                                    |
| Left/right rails and panes                                                      | Producible                          | Closed, open, resized, simultaneous, full-width, restored, viewport-normalized, and narrow states; resize and focus traces; paint, seam, stacking, overflow, and transition metrics |
| Overview nested section listing                                                 | Partially producible                | Dark/light nested rows and pointer/Space activation can be captured; depth, type, color, and focus metrics can be measured                                                          |
| Overview collapsed groups, selected-row treatment, and tree keyboard navigation | **Absent**                          | Frozen main has no disclosure state or control, no selected-section row state, no tree semantics, and no roving/arrow navigation to capture                                         |
| UI Editor with no selection and exactly one selected section                    | Producible                          | Placeholder and ordinary section/UI configuration presentations in both appearances                                                                                                 |
| Selection-aware UI Editor for exactly one selected item                         | **Absent**                          | Item selection is not an input to `UiEditor`; its UI Config tab renders all parameters for the sole active section                                                                  |
| Selection-aware UI Editor for multiple selected sections                        | **Absent as the planned inspector** | Multiple active sections remove the sole-section id and produce the generic placeholder; there are no mixed common actions                                                          |
| Menu-key/Shift+F10 context-menu opening                                         | **Absent**                          | Frozen main opens the workspace menus only from `contextmenu` pointer handlers; keyboard code operates only after the pane menu is already open                                     |

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

The ownership preflight is complete, but the required pre-implementation reference capture cannot
be completed as written. Several states that the plan requires to be captured from frozen main do
not exist in frozen main, and the product-authority rule forbids an implementation agent from
inventing their visual or interaction reference.

Before any workspace-shell implementation batch begins, the developer must explicitly resolve the
authority gap by doing one of the following:

1. amend the evidence contract to identify the Outline tree, selection-aware Inspector, and
   keyboard menu invocation as developer-authorized new package behavior, with a concrete
   pre-implementation interaction/presentation target; or
2. explicitly re-baseline the product authority to a reference that implements the required
   states.

The remaining producible dark/light reference states also still require the supervised capture
defined by the plan. No package source, fixture, dependency, baseline, or public API was changed by
this preflight.
