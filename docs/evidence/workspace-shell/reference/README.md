# Workspace-shell frozen-reference preflight

Reference: `../setta-main` verified clean on `main` at
`043d3b2e9c69caf99d1246f1408b3ad7194b7864` on 2026-08-12. This directory contains the
repository-actionable source/ownership preflight and the completed frozen-main pane/rail capture
required before workspace-shell implementation batch 2, plus the completed Overview capture and
accepted nested-row index required before batch 3, and the completed UI Editor capture required
before batch 4. It is not package-output evidence or developer approval. The producible
context-menu captures remain attached to batch 5.

The supervised frozen reference service for this milestone is
`http://127.0.0.1:3063/` (including `http://127.0.0.1:3063/settings`) with its backend on
`http://127.0.0.1:8063/`. Ports `3000`, `5173`, and the package playground on `5174` are not this
reference. Verify these recorded endpoints before treating a reference page as unavailable.

The detailed dependency cone, state-read classification, algorithm boundary, and package seam are
in [`ownership-map.md`](ownership-map.md).

## Existing accepted evidence that remains usable

The workspace-shell amendment postdates Phase 0, so the earlier bundle is incomplete for this
milestone. These accepted captures still establish a small subset of the shell reference without
being copied or relabelled:

| Existing evidence                                                                                                                                                                             | What it proves                                                                                                                                            | What it does not prove                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Desktop dark](../../phase0/reference/screenshots/01-full-workspace-dark-1440x900.png) and [desktop light](../../phase0/reference/screenshots/02-full-workspace-light-1440x900.png)           | Left Overview pane open at its normal desktop width, both 40 px icon rails, right pane closed, pane/canvas seams, minimap placement, and light/dark paint | Pane resizing, paired panes, full width, context menus, right pane contents, focus, or transitions |
| [Narrow dark](../../phase0/reference/screenshots/22-narrow-workspace-dark-800x900.png)                                                                                                        | The existing 800 px product layout and the Overview list's depth indentation                                                                              | The milestone's 320 px package shell, paired-pane negotiation, or an accessible collapsible tree   |
| [Browser 200% dark](../../phase0/reference/screenshots/23-browser-page-scale-200-dark.png)                                                                                                    | Frozen main's effective 200% product presentation and the still-flat Overview list                                                                        | The package's already-accepted 200% reflow contract or any new shell behavior                      |
| [Nested dark](../../phase0/reference/screenshots/10-three-level-nesting-horizontal-group-dark.png) and [nested light](../../phase0/reference/screenshots/26-final-fixture-light-1440x900.png) | Recursive Overview rows, document-order nesting, compact row paint, and depth indentation in both appearances                                             | Disclosure, selected-row paint, ARIA tree semantics, or tree keyboard behavior                     |
| [Phase 0 style metrics](../../phase0/reference/computed/reference-style-metrics.json)                                                                                                         | Previously accepted canvas, toolbar, minimap, section, and z-layer facts                                                                                  | Pane, rail, context-menu, Outline, and Inspector metrics required by this milestone                |

No earlier capture shows an open right pane or a workspace context menu. The new pane/rail bundle
below closes the former gap; context-menu evidence remains with batch 5.

## Pane and rail capture complete

The matched bundle was captured from the already-running frozen `/settings` reference through the
worktree-scoped Chrome DevTools service. The source checkout remained clean. All PNGs preserve the
page's device-pixel ratio of 2; the filename records the CSS-pixel viewport.

| Files                                                                                                                                             | State                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`01`](screenshots/01-initial-left-open-right-closed-dark-1492x696.png), [`08`](screenshots/08-initial-left-open-right-closed-light-1492x696.png) | Initial 335 px leading pane, closed 40 px trailing rail              |
| [`02`](screenshots/02-both-panes-open-dark-1492x696.png), [`09`](screenshots/09-both-panes-open-light-1492x696.png)                               | Both panes open at 335/500 px                                        |
| [`03`](screenshots/03-both-open-left-resized-dark-1492x696.png), [`10`](screenshots/10-both-open-left-resized-light-1492x696.png)                 | Leading pane pointer-resized to 401 px while both panes remain open  |
| [`04`](screenshots/04-left-full-width-right-closed-dark-1492x696.png), [`11`](screenshots/11-left-full-width-right-closed-light-1492x696.png)     | Leading pane at the 1452 px full-width maximum; trailing pane closed |
| [`05`](screenshots/05-left-restored-dark-1492x696.png), [`12`](screenshots/12-left-restored-light-1492x696.png)                                   | Leading pane restored to its remembered 401 px width                 |
| [`06`](screenshots/06-both-panes-closed-dark-1492x696.png), [`07`](screenshots/07-both-panes-closed-light-1492x696.png)                           | Both panes closed to their 40 px rails                               |
| [`13`](screenshots/13-narrow-left-open-right-closed-light-800x772.png), [`16`](screenshots/16-narrow-left-open-right-closed-dark-800x772.png)     | Narrow initial state                                                 |
| [`14`](screenshots/14-narrow-both-open-light-800x772.png), [`17`](screenshots/17-narrow-both-open-dark-800x772.png)                               | Narrow paired panes after exact overflow negotiation to 300/500 px   |
| [`15`](screenshots/15-narrow-right-full-width-light-800x772.png), [`18`](screenshots/18-narrow-right-full-width-dark-800x772.png)                 | Narrow trailing pane at the 760 px full-width maximum                |

Exact geometry, paint, z-order, overflow, transition, resize-target, full-width, and
viewport-normalization facts are in
[`computed/pane-style-metrics.json`](computed/pane-style-metrics.json). Pointer, focus, paired-pane,
full-width/restore, and normalization traces are in
[`interactions/pane-trace.json`](interactions/pane-trace.json). The trace also records that frozen
main has native button activation but no roving tablist or Arrow/Home/End behavior; the milestone
contract is the authority for that deliberate accessibility addition.

## Overview capture complete

The already-accepted Phase 0 nested dark/light captures above are the original pinned-product
visuals required by the batch-3 matrix; they remain authoritative at their original paths rather
than being copied or relabelled. A fresh deterministic pass over the already-running pinned
reference recorded exact 20 px row geometry, 12/16 typography, 12 px depth indentation, tag-dot,
idle/hover/focus paint, and the source-proven boundary between main's flattened Overview and the
authorized package Outline. Those facts are in
[`computed/outline-style-metrics.json`](computed/outline-style-metrics.json).

The same pass used a real pointer click and Space key to activate the first two live Overview rows.
It records focus retention, fitted camera matrices, selection outlines, and z-index changes in
[`interactions/outline-trace.json`](interactions/outline-trace.json). Main's pointer/Space behavior
is the executable reference. Disclosure, selected-row presentation, ARIA tree semantics, roving
focus, Arrow/Home/End/typeahead behavior, registered kind icons, and locked/minimized cues are the
milestone-authorized package additions documented below.

## UI Editor capture complete

The six original-pixel JPEGs below capture the frozen `/settings` UI Editor at the accepted desktop
viewport in both appearances. They cover its reusable empty state, one selected section's Section
configuration, and the same section's Params configuration presentation. Exact pane, title,
empty-state, label, and control geometry/type/paint plus screenshot hashes are in
[`computed/inspector-style-metrics.json`](computed/inspector-style-metrics.json). The real-pointer
state path and the boundary between executable reference behavior and the milestone-authorized
selection branches are in
[`interactions/inspector-trace.json`](interactions/inspector-trace.json).

| Files                                                                                                                   | State                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [`19`](screenshots/19-inspector-empty-dark-1492x696.jpg), [`22`](screenshots/22-inspector-empty-light-1492x696.jpg)     | No canonical section selection              |
| [`20`](screenshots/20-inspector-section-dark-1492x696.jpg), [`23`](screenshots/23-inspector-section-light-1492x696.jpg) | One selected `backend` section, Section tab |
| [`21`](screenshots/21-inspector-params-dark-1492x696.jpg), [`24`](screenshots/24-inspector-params-light-1492x696.jpg)   | One selected `backend` section, Params tab  |

The frozen `gui` settings path was also inspected, but its UI configuration crashes in
`ColorPickerInput.tsx` while mapping undefined `AvailableColors` choices. The trace records that
frozen-product limitation once. The stable `backend` section supplies the required ordinary
Section/Params evidence, so the failure neither changes package behavior nor waives a gate.

## Required live capture matrix

The following states remain uncaptured. Rows marked **producible** have a frozen-main source path
and must be captured by the supervised implementation loop before their corresponding user-visible
batch. Rows marked **absent / authorized new behavior** cannot be produced by the frozen reference
at the recorded commit; their source proof is the pre-implementation evidence, while the milestone
contract and final combined developer gate govern their implementation.

| Surface                                                                         | Frozen-main status                   | Required evidence before implementation                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pane creation menu at each viewport edge                                        | Producible by pointer                | Dark/light original-pixel captures; search, filtering, arrow/Enter/Escape trace; computed menu geometry, overflow, focus, and created workspace coordinate                                   |
| Section and multi-selection menu                                                | Producible by pointer                | Single and mixed locked/unlocked selections, capability-disabled actions, labels, geometry, focus, and dismissal                                                                             |
| Left/right rails and panes                                                      | **Captured for batch 2**             | Complete in the pane/rail bundle above: closed, open, resized, simultaneous, full-width, restored, viewport-normalized, narrow, focus, paint, seam, stacking, overflow, and transition facts |
| Overview nested section listing                                                 | **Captured for batch 3**             | Complete through the accepted dark/light nested captures above plus fresh row metrics and the pointer/Space trace                                                                            |
| Overview collapsed groups, selected-row treatment, and tree keyboard navigation | **Absent / authorized new behavior** | Frozen main has no disclosure state or control, no selected-section row state, no tree semantics, and no roving/arrow navigation to capture; implement the milestone's tree contract         |
| UI Editor with no selection and exactly one selected section                    | **Captured for batch 4**             | Complete in the UI Editor bundle above: placeholder plus Section and Params configuration presentations in both appearances                                                                  |
| Selection-aware UI Editor for exactly one selected item                         | **Absent / authorized new behavior** | Item selection is not an input to `UiEditor`; use its UI-control presentation as the visual seed and implement the milestone's selected-item contract                                        |
| Selection-aware UI Editor for multiple selected sections                        | **Absent / authorized new behavior** | Multiple active sections produce the generic placeholder; implement only the common actions expressly named by the milestone                                                                 |
| Menu-key/Shift+F10 context-menu opening                                         | **Absent / authorized new behavior** | Frozen main opens menus only from pointer `contextmenu`; implement the milestone's keyboard invocation and focus-restoration contract                                                        |

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

The pane/rail, Overview, and UI Editor captures are complete, so workspace-shell implementation
batches 2 through 4 have their required reference inputs. The remaining producible dark/light menu
states still require capture before batch 5. The existing frozen-main service and deterministic
browser tooling may be used under root supervision; no intermediate developer approval is
required. The combined milestone gate remains the sole developer visual/interaction approval.
