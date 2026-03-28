# File Browser Pane

This document explains how the shared File Browser UI works in both the
Overview sidebar and the Home page workspace browser, including
browse/filter/sort behavior, transfer operations, and the universal
preview/editor surface.

## Where It Lives

- The File Browser pane is the "Explorer" tab in the Overview sidebar.
- In Overview, the tab renders a split workspace:
  - top: file tree/list (`FileBrowserPane`)
  - bottom: universal preview (`FileBrowserUniversalPreview`)
- The same `FileBrowserPane` component is also used in the Home page "Workspace
  Browser" column (`frontend/src/components/Pages/Home/HomePage.tsx`), backed by
  `useHomeFileBrowserState`.
- Browser sections reuse the same list/tree surface and compose the shared
  path-control components from `BrowserArea`.
- In the Overview sidebar, Explorer is hidden in share/deployment mode.
- Backend file-browser routes are blocked with 403s in share/deployment mode.

## Loading Roots And Folders

- On first load, the pane calls `route_get_file_browser_root` to get the default root
  path, OS path separator, and ignore patterns.
- The returned path separator + ignore patterns are cached in file browser state so
  path autocompletion can reuse the same root metadata.
- Default ignore patterns include `.git`, `node_modules`, `.venv`, `dist`, `build`,
  `__pycache__`, and `setta_files`.
- The root defaults to the workspace root (which defaults to the backend CWD when
  no workspace override is provided).
- `FileBrowserPane` supports an `allowOutsideWorkspaceRoot` flag:
  - default `false`: root + folder browsing is restricted to workspace-root-relative paths.
  - `true`: absolute path browsing is allowed (subject to backend existence/permission checks).
- `FileBrowserPane` also supports `showPathNavigation`:
  - default `true`: shows a shared path field, an up-one-level button, and
    ancestor breadcrumbs.
  - `false`: hides that chrome and lets the host provide its own root picker.
- Overview Explorer and Browser sections keep `allowOutsideWorkspaceRoot=false`
  and use the shared path-navigation controls to move within the workspace tree.
- Home workspace browser enables `allowOutsideWorkspaceRoot=true`, disables the
  shared path-navigation chrome, and keeps its dedicated root-path input
  (`home-file-browser-path-input`) backed by `useHomeFileBrowserState`.
- The shared path field commits navigation on Enter/blur, supports folder
  autocomplete, and breadcrumbs jump directly to ancestor paths.
- Folder contents are fetched lazily when a folder expands.
- Each folder request limits results to 5000 entries and returns folders before files,
  sorted by case-insensitive name.
- Folder entries return normalized paths, so `fullPath` values are relative to the
  project root when possible.
- The pane requests `mtime` values (`includeMtime=true`) so the Date modified column
  can render.
- Consumers can request Setta initialization metadata with
  `includeSettaInitialized=true`; folder entries then include
  `isSettaInitialized` when that folder has Setta state (local `setta_files/`,
  local `setta_files_dev/`, or a resolved global setta-files directory for that path).

## Sorting And Columns

- The header row provides two sortable columns: `Files` and `Date modified`.
- Default sort is name ascending. Clicking the same header toggles ascending/descending.
  Sorting by date defaults to newest-first (descending).
- Sorting is applied per folder level and always keeps folders above files.
- The file column can be resized by dragging the divider in the header row.
  - The Overview pane stores the width in `--file-browser-column-width` (not persisted).
  - When embedded elsewhere (for example Browser section list view), the pane can be
    supplied a `columnWidthConfig` to drive a persisted width.

## Transfers (Move/Copy)

- Dragging a file/folder row onto a folder row moves the source into that folder.
- Keyboard transfer shortcuts are supported when the tree has focus:
  - `Cmd/Ctrl+C`: copy selected row.
  - `Cmd/Ctrl+X`: cut selected row (move on paste).
  - `Cmd/Ctrl+V`: paste into selected folder, or selected file's parent, or root.
- Transfer shortcuts are ignored while focus is inside editable controls (for
  example filter/path CodeMirror, inputs, textareas).
- The move/copy backend route is `route_transfer_file_browser_entry`.
- Guardrails:
  - moving into the same parent is treated as a no-op.
  - moving/copying a folder into itself (or a descendant) is rejected.
  - copy naming auto-resolves conflicts (`name copy`, `name copy 2`, ...).

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
- Dev-facing dotfiles are shown by default (`.env`, `.gitignore`, etc.).
- Internal roots and ignore-pattern matches are still hidden by the backend
  (`.git`, `.venv`, `node_modules`, `setta_files`, and similar configured
  ignores).
- Rows show a spinner while loading and a small error marker when a folder fails to
  load.

## Setta Initialization Badges

- Home page exposes a `Show Setta badges` toggle that passes
  `includeSettaInitializedFolders` to `FileBrowserPane`.
- When toggled on, the pane refreshes root + currently expanded folders so badge
  metadata becomes available without manual collapse/expand.
- Root-folder badge state is fetched through `route_check_workspace_initialized`
  because `route_get_folder_contents` returns metadata for children, not the root
  node entry itself.
- Badge refresh requests use a bounded concurrency limit
  (`SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT = 8`).
- Badge rendering is folder-only and uses `data-testid="setta-initialized-badge"`
  with visible label text `Setta`.

## Selection And Opening Files

- Single click selects a row.
- Double click (or Enter) on a folder toggles expansion.
- Use the chevron to expand or collapse a folder without opening it.
- Double click (or Enter) on a file opens it in a Code section (in Overview).
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

## Universal Preview (Overview)

- The preview pane tracks the current selected file row.
- The split between list and preview is vertically resizable and the preview can be
  minimized/expanded.
- Preview modes:
  - spreadsheet (`.csv`, `.tsv`, `.xlsx`, `.xls`): inline spreadsheet editor.
  - text: text preview.
  - image/pdf/audio/video: media preview via signed download URL.
  - unsupported/binary/archive: unavailable message.
- Text preview fetches bytes using `route_get_file_browser_file_content` and
  `route_binary_download`, then decodes UTF-8 in the client.
  - request cap for text preview: `1 MiB`
  - rendered text cap: `4,000` characters
- Spreadsheet editor behavior (Overview preview and Browser preview):
  - reads bytes via `route_get_file_browser_file_content`.
  - saves through binary upload + `route_write_file_browser_file_content`.
  - uses `expectedMtimeNs` to reject stale writes (409 conflict on mismatch).
  - UI file-size cap: `8 MiB`.

## File Content API Notes

- `route_get_file_browser_file_content` returns metadata plus `contentId` (bytes are
  fetched from `/api/binary/{contentId}`).
- `route_get_file_browser_file_stat` returns `mtimeNs` + `size` for stale-check polling.
- `route_write_file_browser_file_content` writes bytes by `contentId`.
  - `expectedMtimeNs = null` means create-only (fails with 409 if file exists).
- Backend max file content size for these read/write routes is `10 MiB`.

## Keyboard Navigation

Keyboard navigation works when the list has focus.

- Up/Down changes selection.
- Right expands a folder or selects its first child.
- Left collapses a folder or selects its parent.
- Enter opens the selected file or toggles a folder.

## Implementation References

- UI: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- Browser section host: `frontend/src/components/Section/Layouts/BrowserArea.tsx`
- Home wrapper: `frontend/src/components/Pages/Home/HomePage.tsx`
- Overview split workspace: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserWorkspace.tsx`
- Universal preview: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserUniversalPreview.tsx`
- Spreadsheet preview/editor: `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx`
- Shared path chrome: `frontend/src/components/Utils/FileBrowserPathControls.tsx`
- Autocomplete: `frontend/src/components/Utils/CodeMirror/folderPathCompletions.ts`
- Path helpers: `frontend/src/utils/browserPaths.ts`
- Path-navigation helpers: `frontend/src/utils/fileBrowserNavigation.ts`
- State: `frontend/src/state/definitions.ts`
- Open file flow: `frontend/src/state/actions/sections/createSections.ts`
- Backend routes/services: `internal/httpapi/filebrowser_routes.go`, `internal/filebrowser/service.go`
