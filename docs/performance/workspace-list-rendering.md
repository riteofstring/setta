# Workspace List Rendering Performance

## 2026-05-29 Baseline Before Virtualization

Scenario: production desktop build launched with a temporary Electron
`userData` directory containing `app-state.json` with 3,000 active workspaces
and the same 3,000 recent workspaces.

Measurement command: one-off Playwright Electron launch against
`desktop/out/main/index.js`.

Results:

- Active workspace rows in DOM: 3,000
- Recent workspace rows in DOM: 3,000
- Total DOM elements: 84,062
- Launch-to-row-visible elapsed time: 1,544 ms

## 2026-05-29 After Fixed-Row Virtualization

Scenario: same production desktop build shape and same temporary app-state size:
3,000 active workspaces and 3,000 recent workspaces.

Measurement command: one-off Playwright Electron launch against
`desktop/out/main/index.js`.

Results:

- Active workspace rows in DOM: 9
- Recent workspace rows in DOM: 10
- Total DOM elements: 347
- Launch-to-row-visible elapsed time: 783 ms
- Active list viewport height: 219 px
- Recent list viewport height: 203 px

## 2026-06-03 After Flat Sidebar Navigation Model

Scenario: production desktop build launched by
`node desktop/scripts/chat-workflows.test.mjs --deterministic-only` with
temporary app data seeded with 3,000 active workspaces and 3,000 inactive recent
workspaces. The workflow created a backend conversation for active workspace
1,500, scrolled the sidebar virtualizer to that workspace, selected it through
the renderer, verified its conversation row remained mounted, then scrolled to
the recent workspace rows and opened an inactive recent workspace through the
production IPC/backend path.

Results:

- Selected large-list workspace active rows in DOM: 24
- Selected large-list workspace conversation rows in DOM: 1
- Selected large-list workspace total DOM elements: 590
- Recent workspace scroll active rows in DOM: 6
- Recent workspace scroll recent rows in DOM: 18
- Recent workspace scroll total DOM elements: 524
