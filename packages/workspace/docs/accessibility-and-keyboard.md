# Accessibility and keyboard interaction

Pointer, touch, and keyboard paths share the same package command and planning boundaries. Built-in
controls are native elements with names, state, visible focus, coarse-pointer targets, focus
restoration, and pre-mounted polite announcements. Automated scans supplement these interaction
contracts; they do not replace host testing with a keyboard and screen reader.

Set a concise `ariaLabel` on each `Workspace` when a page contains more than one workbench. Give
each `SortableItemTree` its own `ariaLabel` and stable item labels.

## Global and selection commands

| Focus or context                                | Keys                                         | Result                                                                                                      |
| ----------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Workbench, outside a local text-editing surface | Control/Command+A                            | Select every section in canonical order.                                                                    |
| Workbench with a selection                      | Escape                                       | Clear selection when no more specific dialog, editor, or drag owns Escape.                                  |
| Blank canvas                                    | Shift+drag                                   | Marquee-select using the configured partial/full mode.                                                      |
| Section selection control                       | Enter or Space                               | Select that section; hold Shift to toggle it in the selection.                                              |
| Section or selection control                    | Shift+F10 or Context Menu                    | Open the package selection-actions menu.                                                                    |
| Blank canvas keyboard context                   | Shift+F10 or Context Menu                    | Open searchable creation at the last meaningful canvas point or viewport center when creation is available. |
| Workbench                                       | Control/Command+Z                            | Undo the latest accepted section command.                                                                   |
| Workbench                                       | Control/Command+Shift+Z or Control/Command+Y | Redo.                                                                                                       |

Inputs, textareas, selects, editable content, and elements marked with
`data-workspace-local-shortcuts` keep their local undo/redo and editing shortcuts. Do not intercept
these keys in a host wrapper and forward them to the canvas.

## Section movement and resizing

| Focus                                   | Keys                  | Result                                                                                                                                                            |
| --------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root movement handle in spatial mode    | Arrow keys            | Move one root or the selected root block. Snapping advances to the next grid line; otherwise the step is 10 workbench units.                                      |
| Structural movement handle              | Enter or Space        | Start movement; press again to commit the displayed preview.                                                                                                      |
| Structural movement handle while active | Arrow keys            | Preview the next orientation-aware sibling position or, in free mode, a valid measured container/canvas destination. Logical horizontal direction mirrors in RTL. |
| Structural movement handle while active | Escape                | Cancel without changing the document and restore handle focus.                                                                                                    |
| Resize handle                           | Applicable Arrow keys | Resize along the handle axes with the same constraints, zoom correction, and snapping as pointer resize.                                                          |
| Resize handle                           | Enter or Space        | Return supported handle axes to content sizing.                                                                                                                   |

A pointer or keyboard section move starts only from the named movement handle. A selected sibling
block moves atomically; mixed-parent movement and locked selections report why movement is
unavailable. Start, destination, parent/depth changes, rejection, completion, and cancellation are
announced from a polite live region.

## Sortable-item commands

| Focus                       | Keys                | Result                                                                        |
| --------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| Item selection control      | Enter or Space      | Select that item; Control, Command, or Shift toggles it.                      |
| Item movement handle        | Enter or Space      | Start movement; press again to commit the displayed preview.                  |
| Active item movement handle | ArrowUp / ArrowDown | Move before or after siblings.                                                |
| Active item movement handle | Logical forward     | Indent into a valid preceding container: ArrowRight in LTR, ArrowLeft in RTL. |
| Active item movement handle | Logical backward    | Outdent: ArrowLeft in LTR, ArrowRight in RTL.                                 |
| Active item movement handle | Escape              | Cancel and restore focus.                                                     |

The package announces whether a selected sibling block or mixed-parent active-item fallback is
moving, the proposed parent and position, host rejection, completion, and cancellation. Inputs and
buttons rendered inside an item row remain natively operable because the row itself is not the drag
activator.

## Menus, editors, toolbar, and minimap alternatives

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
- Lock uses pressed-state semantics. Minimize uses expanded/collapsed semantics. Orientation and
  overflow controls name the resulting state rather than only showing an icon.
- The minimap is supplementary pointer navigation. The toolbar plus section selection controls and
  controller-backed focus, fit, next, and previous actions provide equivalent keyboard paths.

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

Package transitions respect `prefers-reduced-motion`. Host renderers, icons, and overlays must also
remove nonessential motion and avoid autoplay or repeated entrance animation during pan, drag,
resize, reorder, and canonical document updates.

Before shipping an integration, verify accessible names, roles, states, error associations, live
announcements, focus order/restoration, keyboard completion and cancellation, 200% zoom, 320-pixel
reflow, coarse-pointer targets, RTL logical movement, and reduced motion with representative host
renderers. Run an automated accessibility scan as an additional check, not the completion criterion.
