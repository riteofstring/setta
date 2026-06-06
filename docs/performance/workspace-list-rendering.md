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
