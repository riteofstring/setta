# Project Chat Skills View Owners

## Scenario

- Date: `2026-03-16`
- URL: `http://127.0.0.1:3002/wave_tiger`
- Surface: Project AI Settings -> Skills
- State: markdown viewer expanded, no skills present in the measured workspace

## Refactor Scope

- `ProjectChatSkillsMcpViewer.tsx` stays as the coordinator for skills/MCP/slash-command routing plus the async skill fetch/create/save flows.
- `projectChatSkillsBrowser.tsx` now owns the grouped skills list, filter/search shell, selection row chrome, and split-pane composition.
- `projectChatSkillMarkdownViewer.tsx` now owns the markdown preview/edit accordion, CodeMirror surface, and save affordances.
- `projectChatSkillsViewModel.ts` now owns pure skill preview, truncation, save gating, and draft-hydration helpers.
- `projectChatSkillsMcpPathGroupHeader.tsx` now owns per-root path section headers inside the skills browser.

## Measurements

| Metric                                 |   Before |    After |
| -------------------------------------- | -------: | -------: |
| `ProjectChatSkillsMcpViewer.tsx` lines |     1661 |      912 |
| Whole document nodes                   |      537 |      553 |
| Skills surface nodes                   |       48 |       48 |
| Markdown viewer visible                |   `true` |   `true` |
| Resize handle count                    |        1 |        1 |
| Surface width                          |      250 |      250 |
| Surface height                         |      626 |      626 |
| Skills list pane height                |      334 |      334 |
| Splitter height                        |       12 |       12 |
| Skills surface overflowY               | `scroll` | `scroll` |

## Result

- The front-door file dropped by 749 lines while the measured skills subtree stayed flat.
- The whole document node count rose slightly, but the isolated skills surface metrics did not change, so this slice did not show a measured DOM/layout regression in the refactored area.
- Visual spot checks through CDP confirmed the same empty-state layout, expanded markdown viewer shell, and resize affordance after the extraction.
