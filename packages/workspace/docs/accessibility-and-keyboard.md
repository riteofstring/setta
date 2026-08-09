# Accessibility and keyboard interaction

Pointer, touch, and keyboard paths share the same package command and planning boundaries. Built-in
controls are native elements with names, state, visible focus, coarse-pointer targets, focus
restoration, and pre-mounted polite announcements. Automated scans supplement these interaction
contracts; they do not replace host testing with a keyboard and screen reader.

Set a concise `ariaLabel` on each `Workspace` when a page contains more than one workbench. Give
each `WorkspaceOutline`, `WorkspaceViewportPresets`, `SortableItemTree`, and `SortableItemLists`
surface its own `ariaLabel`, and give sortable items stable labels. Each named item list exposes a
visible label and a native named region inside the shared movement group.

Optional connections expose a visually hidden group named from the workspace. It lists every
labeled port and every complete source-to-target edge, including directed state. The visible SVG
and port marks are non-interactive and hidden from assistive technology, so they add no pointer-only
action or keyboard stop. A host-provided connection editor remains responsible for native controls,
focus, announcements, and equivalent keyboard completion.

## Global and selection commands

| Focus or context                                 | Keys                                         | Result                                                                                                      |
| ------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Workbench, outside a local text-editing surface  | Control/Command+A                            | Select every section in canonical order.                                                                    |
| Workbench with a selection                       | Escape                                       | Clear selection when no more specific dialog, editor, or drag owns Escape.                                  |
| Blank canvas                                     | Shift+drag                                   | Marquee-select using the configured partial/full mode.                                                      |
| Section selection control                        | Enter or Space                               | Select that section; hold Shift to toggle it in the selection.                                              |
| Section or selection control                     | Shift+F10 or Context Menu                    | Open the package selection-actions menu.                                                                    |
| Blank canvas keyboard context                    | Shift+F10 or Context Menu                    | Open searchable creation at the last meaningful canvas point or viewport center when creation is available. |
| Workbench                                        | Control/Command+Z                            | Undo the latest accepted section command.                                                                   |
| Workbench                                        | Control/Command+Shift+Z or Control/Command+Y | Redo.                                                                                                       |
| Workbench with a selection and clipboard adapter | Control/Command+C                            | Copy normalized selection roots and their complete subtrees.                                                |
| Workbench with a clipboard adapter               | Control/Command+V                            | Validate, clone, place, select, and focus one pasted root block.                                            |

Inputs, textareas, selects, editable content, and elements marked with
`data-workspace-local-shortcuts` keep their local copy, paste, undo/redo, and editing shortcuts. Do
not intercept these keys in a host wrapper and forward them to the canvas. Clipboard completion,
invalid input, unsupported versions or kinds, host rejection, and controlled rejection use a
pre-mounted polite live region. Accepted paste moves focus to the first pasted selection control;
copy does not move focus.

## Section movement and resizing

| Focus                                   | Keys                  | Result                                                                                                                                                            |
| --------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root movement handle in spatial mode    | Arrow keys            | Move one root or the selected root block. Snapping advances to the next grid line; otherwise the step is 10 workbench units.                                      |
| Structural movement handle              | Enter or Space        | Start movement; press again to commit the displayed preview.                                                                                                      |
| Structural movement handle while active | Arrow keys            | Preview the next orientation-aware sibling position or, in free mode, a valid measured container/canvas destination. Logical horizontal direction mirrors in RTL. |
| Structural movement handle while active | Escape                | Cancel without changing the document and restore handle focus.                                                                                                    |
| Resize handle                           | Applicable Arrow keys | Resize along the handle axes with the same constraints, zoom correction, and snapping as pointer resize.                                                          |
| Resize handle                           | Enter or Space        | Return supported handle axes to content sizing.                                                                                                                   |

A pointer or keyboard section move starts only from the named movement handle. Normalized selected
roots move atomically in free-move mode even across source parents; the active root anchors the
first keyboard direction. Sorting remains sibling-only, and locked selections report why movement is
unavailable. Start, destination, parent/depth changes, rejection, completion, and cancellation are
announced from a polite live region.

## Sortable-item commands

| Focus                                      | Keys                | Result                                                                        |
| ------------------------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| Item selection control                     | Enter or Space      | Select that item; Control, Command, or Shift toggles it.                      |
| Item movement handle                       | Enter or Space      | Start movement; press again to commit the displayed preview.                  |
| Active item movement handle                | ArrowUp / ArrowDown | Move before or after siblings.                                                |
| Active item movement handle                | Logical forward     | Indent into a valid preceding container: ArrowRight in LTR, ArrowLeft in RTL. |
| Active item movement handle                | Logical backward    | Outdent: ArrowLeft in LTR, ArrowRight in RTL.                                 |
| Active item movement handle in named lists | Page Up / Page Down | Move to the corresponding position in the previous or next named list.        |
| Active item movement handle                | Escape              | Cancel and restore focus.                                                     |

The package announces the complete normalized moving block, the proposed list, parent, and
position, host rejection, completion, and cancellation.
Logical backward stops at a named-list root and announces the Page Up/Page Down alternative rather
than silently crossing a region. Inputs and buttons rendered inside an item row remain natively
operable because the row itself is not the drag activator.

When `visibleItemIds` filters a surface, the surface description identifies the filtered view and
announcements call destination indexes “visible positions.” The surface exposes shown and
canonical counts in its accessible description. Hosts must give their filter a native label,
announce result-count changes politely, clear selection that becomes hidden, and provide a clear
filter action for an empty result.

## Outline navigator commands

| Focus                       | Keys                                  | Result                                                                                          |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Outline tree item           | ArrowUp / ArrowDown                   | Move roving focus through visible sections without moving the viewport.                         |
| Outline tree item           | Home / End                            | Move focus to the first or last visible section.                                                |
| Collapsed container         | Logical forward                       | Expand it; press again to move to its first child.                                              |
| Expanded container or child | Logical backward                      | Collapse the container or move from a child to its parent.                                      |
| Outline tree item           | Enter or Space                        | Select, center, and focus that section in the workbench.                                        |
| Outline tree item           | Control, Command, or Shift + activate | Toggle that section in the selection and announce the resulting count without leaving the tree. |

Logical forward is ArrowRight in LTR and ArrowLeft in RTL; logical backward is the opposite. Every
visible row reports its level, sibling position and count, selected state, and container expansion.
Pointer disclosure changes only transient outline state. Collapsed descendants leave the outline
DOM but remain unchanged in the workbench document.

## Menus, editors, toolbar, and minimap alternatives

- Saved-view creation and rename use native forms. Enter submits, Escape cancels rename, invalid
  blank names remain focused with an associated instruction, and accepted create, rename, or delete
  requests restore focus to the resulting view or the creation field. Restore buttons keep focus
  while the viewport synchronizes; a pre-mounted polite region reports every outcome.
- The creation search receives focus on open. Type to filter, press ArrowDown to enter results,
  activate a result with Enter or Space, and press Escape to close and restore the invoking control.
  Empty results and creation rejection remain visible and announced.
- The selection-actions menu uses ArrowUp/ArrowDown, Home, and End for item navigation. Enter or
  Space activates an available action. Escape, Tab, or dismissal closes it and restores the
  invoker. Discoverable unavailable actions stay in menu navigation with `aria-disabled="true"`
  and a specific reason.
- Inline title editing uses Enter to submit and Escape to cancel. Empty input exposes an associated
  error. An asynchronous `validateSectionTitle` rejection keeps the input open, marked invalid, and
  focused until corrected or canceled.
- Toolbar and host-injected controls are native buttons. Their visible `label`, `pressed`, and
  `disabled` state is the accessible contract; an icon or tooltip is not the name.
- Registered pane controls are native toolbar disclosures with `aria-expanded` and `aria-controls`.
  One named complementary landmark mounts at a time. Activation retains trigger focus; the pane's
  native close button returns focus to that trigger. Logical start/end placement mirrors in RTL,
  and narrow workbenches stack pane and canvas in reading order instead of covering focusable
  canvas content.
- Lock uses pressed-state semantics. Minimize uses expanded/collapsed semantics. Orientation and
  overflow controls name the resulting state rather than only showing an icon.
- The minimap is supplementary pointer navigation. The toolbar plus section selection controls and
  controller-backed focus, fit, next, and previous actions provide equivalent keyboard paths.

## Detached-window focus and recovery

An opted-in section's native Open in a new window button works with Enter or Space and exposes its
current pressed state. On success, focus moves to the detached window's named heading. The docked
placeholder retains native Focus window and Redock section buttons, while the popup provides Return
to workspace. Redocking, closing, reloading, or losing the opener restores focus to the original
detachment control when it still exists. Popup blocking and host-policy rejection leave focus and
content in the workbench and use a pre-mounted polite status message with recovery guidance.

Detached content keeps the renderer's React context and current accessible state, but a second
browser window is a separate focus context. Host renderers must not assume `window` or `document`
means the opener, install unscoped global listeners, or rely on opener-only styles. Use
`renderWindowHead` for explicit renderer metadata or styles and test the popup itself with keyboard,
screen reader, zoom, reflow, contrast, and reduced-motion settings.

## Focus behavior

Focus restoration is bounded and context-aware. Creation returns to its invoker on cancellation;
title, style, lock, minimize, orientation, overflow, and resize actions return to a surviving
control; move completion and cancellation return to the active handle; group/ungroup and deletion
move focus to the resulting visible structure. Undo and redo recover focus only when the previously
focused element was removed.

Measured navigation uses `preventScroll` and waits for the accepted viewport so browser scroll does
not diverge from canvas pan. A controlled rejection or a later user focus change cancels stale
focus work. Hosts should not call `focus()` from render or use document-level scroll restoration
that competes with these operations.

## Host-renderer responsibilities

The package owns frame semantics, but it cannot repair arbitrary host content. A section renderer
must:

- Use semantic HTML and provide programmatic labels for its inputs, buttons, landmarks, scroll
  regions, errors, and status messages.
- Enforce content editing policy from `SectionRenderProps.readOnly`; package capabilities are not a
  security boundary.
- Keep durable data in the section payload because minimize unmounts the renderer.
- Keep controls keyboard-operable without positive `tabIndex`, required hover, or pointer-only
  gestures.
- Preserve text selection and native input behavior. Use `WorkspaceInteractionBoundary` for custom
  transformed overlays or nested scrolling/drop surfaces that need explicit gesture isolation.
- Supply `getItemLabel` for sortable rows when an item ID is not a suitable spoken name.
- Avoid color-only meaning for application errors, selection, status, or drag validity, including
  when consuming section accent and tag colors.
- Announce host-owned asynchronous results itself. Package live regions cover package commands, not
  uploads, remote saves, or domain validation outside the public callbacks.

## Zoom, reflow, touch, and motion

Test the integrated page at 200% browser zoom and at 320 CSS pixels, not only the workbench in
isolation. Required toolbar, creation, title, selection, overflow, and equivalent minimap actions
must remain reachable without two-dimensional page scrolling. Host content is responsible for its
own wrapping and reflow inside a content- or fixed-sized section.

Package controls target at least 40 by 40 CSS pixels on desktop and 44 by 44 for coarse pointers.
Do not place host hit targets where they overlap package handles. Touch movement uses the explicit
handle and long-press activation; ordinary touch scrolling inside host content must remain
available.

Package transitions respect `prefers-reduced-motion`. Host renderers, icons, overlays, and pane
content must also remove nonessential motion and avoid autoplay or repeated entrance animation
during pan, drag, resize, reorder, and canonical document updates.

Before shipping an integration, verify accessible names, roles, states, error associations, live
announcements, focus order/restoration, keyboard completion and cancellation, 200% zoom, 320-pixel
reflow, coarse-pointer targets, RTL logical movement, and reduced motion with representative host
renderers. Run an automated accessibility scan as an additional check, not the completion criterion.
