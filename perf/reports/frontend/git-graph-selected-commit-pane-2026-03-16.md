# Git Graph Selected Commit Pane

## Scenario

- Date: `2026-03-16`
- URL: `http://127.0.0.1:3002/wave_tiger`
- Viewport: current dev-window viewport on the live CDP session
- Surface: Git Graph window with the newest commit selected and its first
  changed file opened in the diff viewer

## Refactor Scope

- `GitGraphOverlay.tsx` stays as the coordinator for git graph layout,
  virtualization, lane rendering, and header/sidebar composition.
- `gitGraphOverlaySelectedCommitPane.tsx` now owns the selected-commit summary,
  expanded metadata or file list, and the diff viewer shell.

## Measurements

| Metric                      |                                         Before |                                          After |
| --------------------------- | ---------------------------------------------: | ---------------------------------------------: |
| `GitGraphOverlay.tsx` lines |                                           1550 |                                           1224 |
| Selected-commit pane nodes  |                                            108 |                                            108 |
| Changed-file row count      |                                              1 |                                              1 |
| Diff viewer visible         |                                         `true` |                                         `true` |
| Selected-commit pane height |                                            654 |                                            654 |
| Selected-commit headline    | `Log project chat bottom dock lifecycle slice` | `Log project chat bottom dock lifecycle slice` |

## Result

- The git front-door file dropped by 326 lines while the measured
  selected-commit subtree stayed flat.
- Whole-page and whole-overlay node counts drifted during the hot-reload
  session, so the stable comparison here is the selected-commit pane itself.
- CDP spot checks confirmed the same selected-commit summary, expanded file
  list, reload action, and diff viewer after the extraction.
