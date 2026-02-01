# File Browser Pane

This document explains how the File Browser pane works in the Overview sidebar and how
it opens files into Code sections.

## Where It Lives

- The File Browser pane is the "Explorer" tab in the Overview sidebar.
- It is hidden in share mode, and the backend blocks browsing routes with 403s.

## Loading Roots And Folders

- On first load, the pane calls `route_get_file_browser_root` to get the default root
  path, OS path separator, and ignore patterns.
- Default ignore patterns include `.git`, `node_modules`, `.venv`, `dist`, `build`,
  `__pycache__`, and `setta_files`.
- The root defaults to the backend CWD and must stay inside the project root. Attempts
  to browse outside the project root fail with a 403.
- Changing the root (enter key or "Go") resets selection and expansion state, then
  reloads the tree from the new root.
- Blank root input is rejected locally with a "Root path is required" message.
- Folder contents are fetched lazily when a folder expands.
- Each folder request limits results to 5000 entries and returns folders before files,
  sorted by case-insensitive name.
- Folder entries return normalized paths, so `fullPath` values are relative to the
  project root when possible.

## Filters And Visibility

- The Filter input does a case-insensitive substring match on file and folder names.
- Filtering only includes nodes that have already been loaded. Expand folders first if
  you want their children to participate in filtering.
- Hidden items (dotfiles) and default ignore patterns are filtered out by the backend.
- Rows show a spinner while loading and a small error marker when a folder fails to
  load.

## Selection And Opening Files

- Single click selects a row and updates the breadcrumb strip.
- Double click (or Enter) on a folder toggles expansion.
- Use the chevron to expand or collapse a folder without opening it.
- Double click (or Enter) on a file opens it in a Code section.
- If a Code section already targets the same file path, the pane focuses it instead of
  creating a duplicate.
- New Code sections are named after the file and infer the code language from the file
  extension.

## Breadcrumbs And Keyboard Navigation

- The breadcrumb strip reflects the top visible row in the list, not necessarily the
  selected row.
- Click a breadcrumb segment to select it and expand it if it is a folder.

Keyboard navigation works when the list has focus.

- Up/Down changes selection.
- Right expands a folder or selects its first child.
- Left collapses a folder or selects its parent.
- Enter opens the selected file or toggles a folder.

## Implementation References

- UI: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- State: `frontend/src/state/definitions.ts`
- Open file flow: `frontend/src/state/actions/sections/createSections.ts`
- Backend routes: `backend/setta/routers/artifact.py`
