# Project Chat Bottom Dock Window Lifecycle

## Scenario

- Date: `2026-03-16`
- URL: `http://127.0.0.1:3002/wave_tiger`
- Viewport: `1440x900`
- Surface: one auto-created docked project chat window, no floating or maximized windows

## Refactor Scope

- `ProjectChatBottomDock.tsx` stays as the coordinator for dock/floating/maximized surface composition, viewport layout, tracked git-pane geometry, and floating snap orchestration.
- `projectChatBottomDockWindowLifecycle.ts` now owns dock window create/open/minimize/close/dock/maximize/restore commands, dock-cycle focus behavior, and enter/exit animation bookkeeping.

## Measurements

| Metric                            |          Before |           After |
| --------------------------------- | --------------: | --------------: |
| `ProjectChatBottomDock.tsx` lines |            1658 |            1197 |
| Whole document nodes              |             553 |             533 |
| Dock panel count                  |               1 |               1 |
| Floating window count             |               0 |               0 |
| Maximized window count            |               0 |               0 |
| Minimized pill count              |               0 |               0 |
| Dock strip width                  |             468 |             468 |
| Dock strip height                 |              40 |              40 |
| First dock panel width            |             460 |             460 |
| First dock panel height           |             540 |             540 |
| First dock panel title            | `Chat Window 1` | `Chat Window 1` |

## Result

- The dock front-door file dropped by 462 lines while the measured dock subtree stayed flat.
- The overall document node count dropped because the after reload returned to the main chat surface instead of the auxiliary skills surface that was open during the baseline capture; the dock-specific counts and dimensions remained unchanged.
- CDP spot checks confirmed the same single-window dock layout, manager controls, and canvas toggle behavior after the extraction.
