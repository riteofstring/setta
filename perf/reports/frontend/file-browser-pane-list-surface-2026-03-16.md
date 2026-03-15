# File Browser Pane List Surface

Date: 2026-03-16

## Scenario

- URL: `http://127.0.0.1:3002/home`
- Surface: `Home -> Workspace Browser`
- State: workspace root loaded with the default top-level file list visible

## Refactor Scope

- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  now only owns tree state, path chrome, and file-browser command wiring.
- `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneListSurface.tsx`
  now owns the list header, virtualized rows, local column sizing, and row drag
  or tooltip rendering.
- `frontend/src/components/Panes/Overview/FileBrowser/fileBrowserPaneSearchFilter.tsx`
  now owns the filter input, saved-search action, and search-scope popover.

## Measurements

| Metric                          | Before | After |
| ------------------------------- | -----: | ----: |
| `FileBrowserPane.tsx` lines     |   1399 |   646 |
| Home document nodes             |    503 |   503 |
| Workspace browser subtree nodes |    266 |   266 |
| Visible file rows               |     29 |    29 |
| Sort button count               |      1 |     1 |
| Search-scope button count       |      1 |     1 |
| Workspace browser width         |    283 |   283 |
| Workspace browser height        |    633 |   633 |

## Result

- The front-door file dropped by 753 lines while the measured workspace-browser
  subtree stayed flat in the same home-page scenario.
- CDP checks at `1200x900` and `1440x900` showed the visible workspace browser
  kept the same `283px` pane width with no horizontal overflow.
- The home page collapses the side pane below that range, so the visibility
  checks were taken at the smallest layout where the shared file-browser pane is
  actually rendered.
