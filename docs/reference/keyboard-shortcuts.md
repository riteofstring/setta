# Keyboard Navigation and Manipulation

This document summarizes the keyboard-driven navigation and manipulation that
Setta exposes. Defaults come from Settings -> Shortcuts; every shortcut below
is configurable.

## Conventions

- `Mod` means Command on macOS and Control on Windows/Linux.
- Some shortcuts are hold-to-activate (pan, zoom, drag modes). Others are
  one-shot actions.
- Most global shortcuts are ignored while a text field is focused so native
  editing keys keep working. If a shortcut does not fire, click the canvas.

## Navigation and focus

- Tab / Shift + Tab: move focus through Setta UI elements (including the
  canvas-scoped focus targets).
- Mod + K: focus search. When exactly one section is active, this targets that
  section's param filter instead of the global search bar.
- Mod + P: open advanced search.
- Mod + Shift + P: open command palette.
- Ctrl + Shift + 1/2/3/4: focus header / overview / canvas / UI editor panes.
- Alt + J / Alt + K: focus next / previous top-level section (canvas scope).

## Pane and tab switching

- V: show the Version (section variants) tab in the UI editor (requires an
  active section).
- P: show the Params (UI config) tab in the UI editor (requires an active
  section).
- O: show the Project Overview tab.

## Canvas view controls

- F: fit the viewport to show all sections.
- Z: center the viewport on the mouse location and reset zoom to the default
  level.
- Mod + Comma: reset zoom to the default level (keeps the current center).
- Equal / Minus: zoom in / out.
- Space (hold): pan mode (drag the canvas instead of nodes).
- Mod (hold): force scroll-wheel zoom (overrides pan-on-scroll while held).

## Selection and layout

- Shift (hold): enable selection mode for box-select on the canvas.
- Mod (hold): multi-select on the canvas.
- Mod + A: select all sections.
- Mod + Shift + A: select all top-level, non-group sections.
- Backspace: delete selected edges; if none are selected, delete active
  sections.
- Mod + G: group active sections.
- Mod + Shift + G: ungroup active groups.
- Alt (hold): moving-free drag mode for sections (reposition/reparent).
- Mod + Alt (hold): sorting drag mode for sections (reorder within a parent).
- While holding Alt (moving-free), drag the selection box to move all selected
  sections together.

## Section creation and clipboard

- N: add a new Card in empty space.
- G: add a new Group in empty space.
- Ctrl + `: add a new Terminal in empty space.
- Mod + C: copy active sections (only when no text is selected).
- Mod + V: paste sections (uses the last canvas click or to the right of the
  current selection).
- Mod + Shift + V: paste sections as references.
- Mod + S: save the current project configuration.
- Mod + Shift + S: save as.
- Mod + L: load a project configuration.
- Mod + Shift + Enter: run the entry code block for the project.
- Alt + Shift + R: restart the language server.

## Params (selection and structure)

- Mod + Shift (hold): enter param selection mode.
- Tab / Shift + Tab: indent / unindent selected params when param selection is
  active.
- Alt + ArrowUp / ArrowDown: move selected params up or down.
- Escape: clear param selection and close frozen tooltips.

## Tooltip inspection

- Q (hold): show tooltips for hovered UI elements.
- While holding Q:
  - ArrowLeft / ArrowRight: previous or next tooltip page.
  - Q + C: copy tooltip text.
  - Q + S: open tooltip as a plaintext section.
  - Q + W: open tooltip as a markdown section.
  - Q + F: freeze tooltip (keeps it visible).
- When a tooltip is frozen:
  - ArrowLeft / ArrowRight: previous or next tooltip page.
  - C: copy tooltip text.
  - S / W: open as plaintext or markdown section.
  - Escape: close the frozen tooltip.

## Code editor behavior

- Mod + Z / Mod + Shift + Z: undo/redo project state even while a CodeMirror
  field is focused.
- Shift + Alt + F: format the active Python code section (Code or GenPythonCode).
- Tab:
  - Accept autocomplete if it is active.
  - Otherwise, advance focus in single-line fields.
- Shift + Tab: move focus backward in single-line fields.
- Escape: dismiss autocomplete or exit the field in places that support it.
