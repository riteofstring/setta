# File Browser Pane

This document explains how the shared File Browser UI works in both the
Overview sidebar and the Home page workspace browser, and how it opens files
into Code sections.

## Where It Lives

- The File Browser pane is the "Explorer" tab in the Overview sidebar.
- The same `FileBrowserPane` component is also used in the Home page "Workspace
  Browser" column (`frontend/src/components/Pages/Home/HomePage.tsx`), backed by
  `useHomeFileBrowserState`.
- In the Overview sidebar, Explorer is hidden in share/deployment mode.
- Backend file-browser routes are still blocked with 403s in deployment mode.

## Loading Roots And Folders

- On first load, the pane calls `route_get_file_browser_root` to get the default root
  path, OS path separator, and ignore patterns.
- The returned path separator + ignore patterns are cached in file browser state so
  path autocompletion can reuse the same root metadata.
- Default ignore patterns include `.git`, `node_modules`, `.venv`, `dist`, `build`,
  `__pycache__`, and `setta_files`.
- The root defaults to the workspace root (which defaults to the backend CWD when
  no workspace override is provided) and must stay inside the project root. Attempts
  to browse outside the project root fail with a 403.
- The pane currently does not expose a root-path input; consumers change the root by
  updating file browser state.
- The Home page wrapper adds a root path input (`home-file-browser-path-input`) and
  writes the selected root into `useHomeFileBrowserState`.
- Folder contents are fetched lazily when a folder expands.
- Each folder request limits results to 5000 entries and returns folders before files,
  sorted by case-insensitive name.
- Folder entries return normalized paths, so `fullPath` values are relative to the
  project root when possible.
- The pane requests `mtime` values (`includeMtime=true`) so the Date modified column
  can render.
- Consumers can request Setta initialization metadata with
  `includeSettaInitialized=true`; folder entries then include
  `isSettaInitialized` when that folder contains a `setta_files/` directory.

## Sorting And Columns

- The header row provides two sortable columns: `Files` and `Date modified`.
- Default sort is name ascending. Clicking the same header toggles ascending/descending.
  Sorting by date defaults to newest-first (descending).
- Sorting is applied per folder level and always keeps folders above files.
- The file column can be resized by dragging the divider in the header row.
  - The Overview pane stores the width in `--file-browser-column-width` (not persisted).
  - When embedded elsewhere (for example Browser section list view), the pane can be
    supplied a `columnWidthConfig` to drive a persisted width.

## Filters And Visibility

- The Filter input (when shown) does a case-insensitive substring match on file and
  folder names by default.
- If the filter includes `/` or `\`, it also matches normalized relative paths (root
  trimmed) plus full paths, which makes it possible to filter by path fragments.
- Path filtering normalizes backslashes to `/` before matching.
- The filter input uses CodeMirror autocomplete to suggest folder names. It runs off
  the current root path + ignore patterns and can be forced with `Ctrl+Space`.
- Filtering only includes nodes that have already been loaded. Expand folders first if
  you want their children to participate in filtering.
- Hidden items (dotfiles) and default ignore patterns are filtered out by the backend.
- Rows show a spinner while loading and a small error marker when a folder fails to
  load.

## Setta Initialization Badges

- Home page exposes a `Show Setta badges` toggle that passes
  `includeSettaInitializedFolders` to `FileBrowserPane`.
- When toggled on, the pane refreshes root + currently expanded folders so badge
  metadata becomes available without manual collapse/expand.
- Badge refresh requests use a bounded concurrency limit
  (`SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT = 8`).
- Badge rendering is folder-only and uses `data-testid="setta-initialized-badge"`
  with visible label text `Setta`.

## Selection And Opening Files

- Single click selects a row.
- Double click (or Enter) on a folder toggles expansion.
- Use the chevron to expand or collapse a folder without opening it.
- Double click (or Enter) on a file opens it in a Code section.
- If a Code section already targets the same file path, the pane focuses it instead of
  creating a duplicate.
- New Code sections are named after the file and infer the code language from the file
  extension. Current mapping includes:
  - `.py` -> python
  - `.sh`, `.bash` -> bash
  - `.ts`, `.tsx` -> typescript
  - `.js`, `.jsx`, `.mjs` -> javascript
  - `.json` -> json
  - `.yaml`, `.yml` -> yaml
  - `.toml` -> toml
  - `.md`, `.markdown` -> markdown
  - fallback -> plaintext

## Keyboard Navigation

Keyboard navigation works when the list has focus.

- Up/Down changes selection.
- Right expands a folder or selects its first child.
- Left collapses a folder or selects its parent.
- Enter opens the selected file or toggles a folder.

## Implementation References

- UI: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- Home wrapper: `frontend/src/components/Pages/Home/HomePage.tsx`
- Autocomplete: `frontend/src/components/Utils/CodeMirror/folderPathCompletions.ts`
- Path helpers: `frontend/src/utils/browserPaths.ts`
- State: `frontend/src/state/definitions.ts`
- Open file flow: `frontend/src/state/actions/sections/createSections.ts`
- Backend routes: `backend/setta/routers/artifact.py`
