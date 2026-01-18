# File browser pane plan

## Goals
- Add a VSCode-style Explorer pane on the left with a file tree.
- Double-clicking a file opens (or focuses) a code section bound to that path.
- Keep the UI fast for large trees via lazy loading and virtualization.
- Respect share mode path restrictions.

## Current building blocks
- `Overview` + `PaneContainer` already handle left-side tabs and resizing.
- `route_get_folder_contents` in `backend/setta/routers/artifact.py` returns folder items.
- Code sections bind to files via `route_set_code_file_binding` and reload via watchers.
- `route_create_top_level_section` creates code sections; `route_set_section_name` renames.
- `goToSection` focuses an existing section on the canvas.

## Proposed UX
- Add an "Explorer" tab (folder icon) to the Overview activity bar.
- Render a folder/file tree with expand/collapse toggles.
- Single-click selects; double-click opens; Enter key opens; Left/Right to collapse/expand.
- Optional filter input for quick narrowing.
- Allow switching the root path via a breadcrumb or editable path input.
- Sticky scroll breadcrumbs (VSCode-style): pin the current ancestor path stack
  at the top of the list as the user scrolls.
- Share mode: disable file browsing (hide the pane entirely).

## Backend changes
- Add a "file browser roots" endpoint that returns:
  - `rootPath` (CWD).
  - `pathSeparator` or normalized paths to avoid client-side join issues.
- Endpoint name + response shape (example):
  - Route: `/getFileBrowserRoot`
  - Response:
    - `rootPath: string`
    - `pathSeparator: string`
    - `ignorePatterns: string[]`
- `route_get_folder_contents` should include full item paths so the frontend does not
  guess path joins:
  - Return items like `{ name, type, fullPath }`.
- Extend `route_get_folder_contents` to optionally:
  - include full/normalized item paths
  - include `mtime`/`size` (on demand)
  - accept ignore patterns + hidden file toggle
  - enforce `maxEntries` or similar guardrails for huge folders.

## Frontend state + components
- `frontend/src/utils/constants.ts`: add `OverviewTabNameEnum.FileBrowser`.
- `frontend/src/state/definitions.ts`: store file browser state
  (expanded paths, selected path, last root, filter text).
- New `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`:
  - fetch roots on mount
  - track `nodesByPath`, `childrenByPath`, `expandedPaths`, `loadingPaths`
  - flatten visible nodes for rendering and virtualization
  - show loading and error states per folder.
- Wire the new pane into `Overview` tab rendering.

## Opening files into code sections
- On double-click:
  - If a code section already binds to the file path, call `goToSection(sectionId)`.
  - Else create a code section with `implOverrides` containing:
    - `codeLanguage` (map by extension)
    - `codeFileBinding` (avoid default `setta_files/code/...` write)
  - Then call `route_set_section_name` with the file basename.
- Language mapping: `.py` -> python, `.sh`/`.bash` -> bash; others map to new languages,
  and fall back to plaintext if no CodeMirror extension exists.
- Initial language set: python, bash, javascript, typescript, json, yaml, markdown, plaintext.
- Canonical path matching:
  - Normalize paths in the backend to project-relative when possible
    (`backend/setta/utils/utils.py:normalize_path`).
  - Store and compare full paths in the frontend so double-click focuses the
    existing section without duplication.
- Non-python/bash behavior:
  - No LSP requests or run commands.
  - Hide/disable the run button for non-runnable languages.
  - Keep file read/write + watcher reloads.
- Rely on the file watcher to pull file contents into the new section.

## Performance strategy
- Lazy-load folder contents only when expanded; cache results per path.
- Use `react-window` with a fixed row height (24px) for tree virtualization.
- Avoid full-tree rerenders; update only affected nodes on expand/collapse.
- Debounce filter input; optionally prefetch root children on idle.
- Fixed ignore list (v1): `.git`, `node_modules`, `.venv`, `dist`, `build`,
  `__pycache__`, `setta_files`.

## Suggested files to touch
- Backend:
  - `backend/setta/routers/artifact.py`
  - `backend/setta/types/routes.py`
  - `backend/setta/project_state/project_manager_types.py`
- Frontend:
  - `frontend/src/components/Panes/Overview/Overview.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/*` (new)
  - `frontend/src/state/definitions.ts`
  - `frontend/src/utils/constants.ts`
  - `frontend/src/state/actions/sections/createSections.ts` (helper for open-by-path)

## Tests + manual verification
- Backend unit tests for new root + folder endpoints and share-mode restrictions.
- Manual:
  - Expand a large repo with common ignores (`node_modules`, `.git`, `setta_files`).
  - Double-click `.py` and `.sh` files to open/focus sections.
  - Verify external edits reload into the code section and vice versa.

## Decisions
- Default root: CWD.
- Ignore patterns: fixed defaults (v1).
- Languages: true multi-language code sections with plaintext fallback.
- Share mode: disable file browsing.
- Root switching: allow users to edit the root path and reload the tree.
  - UI: breadcrumb or editable path input with validation + error state.
- Virtualization choice: `react-window` with a fixed row height (24px).
- Sticky behavior target: VSCode-style ancestor breadcrumb stack (not just group headers).
