# Browser Area Folder Session

Date: `2026-03-16`

## Scenario

- URL: `http://127.0.0.1:3002/wave_tiger`
- Surface: browser section on the project canvas with the workspace root loaded
- View states checked:
  - default canvas viewport at `1440x900`
  - compact viewport at `960x900`

## Refactor Scope

- `frontend/src/components/Section/Layouts/BrowserArea.tsx` now acts as the
  browser-section coordinator for file-open routing, preview state wiring,
  column composition, and section shell layout.
- `frontend/src/components/Section/Layouts/useBrowserAreaFolderSession.ts` now
  owns browser root bootstrap, folder/history navigation, recursive filter
  crawling, path completion state, and saved-search persistence.

## Measurements

| Metric                                 | Before | After |
| -------------------------------------- | -----: | ----: |
| `BrowserArea.tsx` lines                |   1302 |   588 |
| `useBrowserAreaFolderSession.ts` lines |      0 |   790 |
| Browser section subtree nodes          |    290 |   289 |
| Browser explorer subtree nodes         |    142 |   142 |
| Browser section button count           |     34 |    34 |
| Browser section textbox count          |      2 |     2 |
| Browser section width (unscaled)       |    722 |   722 |
| Browser section height (unscaled)      |    462 |   462 |
| Path textbox width (unscaled)          |    416 |   416 |
| Filter textbox width (unscaled)        |    200 |   200 |

- The React Flow canvas zoom changed between runs, so the report uses
  unscaled `offsetWidth` and `offsetHeight` values instead of raw bounding
  rectangles.
- Compact-width after check at `960x900`:
  - `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  - the browser section kept the same unscaled `722px` by `462px` geometry
  - the path and filter textboxes stayed at `416px` and `200px`
  - the visible browser section still rendered its breadcrumbs, search scope,
    and file explorer without horizontal overflow

## Result

- The front-door file dropped by `714` lines while the measured browser-section
  subtree stayed effectively flat and the explorer subtree stayed unchanged.
- CDP checks at `1440x900` and `960x900` showed the browser surface kept the
  same unscaled geometry and avoided horizontal overflow after the
  folder-session extraction.
