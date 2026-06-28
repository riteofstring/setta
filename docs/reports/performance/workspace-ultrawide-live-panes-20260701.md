# Workspace Ultra-Wide Live Panes - 2026-07-01

## Scope

Verify that real workspace panes which are fully or partially visible in a very wide viewport load immediately as live, interactive surfaces instead of being capped by a small host pool or downgraded to snapshot/throttled runtime states.

## Pre-Change Baseline

Static baseline from the previous runtime mode contract:

- Real workspace host pool: fixed at 18 hosts.
- Workspace content sync during movement: disabled.
- Workspace runtime degradation during movement/overview/resize: enabled by default.
- Workspace live budgets: `DEFAULT_PANE_BUDGET`, including `maxLiveHeavyDomPanes: 12`, `maxLiveTerminalRenderers: 8`, and `maxLiveWebGpuCanvases: 4`.

For an ultra-wide viewport with 23 viewport-intersecting panes, that baseline cannot host every intersecting pane and can also downgrade visible heavy/canvas/terminal panes away from `live`.

## Post-Change Verification

Command:

```sh
node desktop/tests/electron/run-workflows.mjs --skip-build --workflow workspace-ultrawide-live-panes
```

Artifact:

```text
.recordings/workspace-ultrawide-live-panes/20260701T194904592Z/summary.json
```

Observed production Electron/main/preload/renderer path:

- Viewport: `12000x900`.
- Real workspace persisted layout: 24 panes.
- Viewport-intersecting panes: 23.
- Visible host runtime states: `{ "live": 24 }`.
- Every viewport-intersecting pane had `runtimeState: "live"`.
- Every viewport-intersecting pane had `pointerEvents: "auto"`.
- Every viewport-intersecting pane had a non-empty `surfaceId` and `surfaceKind`.
- Every viewport-intersecting terminal pane had a mounted terminal viewport, non-empty terminal status, and a `terminal_*` session id while unfocused.
- Every viewport-intersecting workflow graph pane had mounted workflow graph surface and host DOM while unfocused.
- Multi-row verification first used a constrained `2200x520` viewport with 12 panes across 6 stacked columns.
- The constrained multi-row pass had 8 viewport-intersecting panes with `{ "live": 12 }`; visible unfocused terminal panes had `terminal_*` session ids, and visible unfocused workflow graph panes had mounted graph DOM.
- Dispatching the workspace `Alt+Meta+ArrowDown` shortcut moved focus from `multirow_pane_0` to lower-row terminal pane `multirow_pane_1`; the focused lower-row pane was viewport-intersecting and live.
- Expanding the same multi-row layout to `3600x900` revealed all 12 panes as viewport-intersecting with `{ "live": 12 }`, including newly visible terminal and workflow graph panes.
- Clicking a visible unfocused terminal and a visible unfocused workflow graph preserved workspace focus on `multirow_pane_1`.

Result: pass.

## Supporting Checks

Before adding the Electron workflow/report:

```sh
pnpm --dir desktop exec vitest run src/renderer/src/workspace-layout/runtime-mode-options.test.ts src/renderer/src/workspace-layout/layout-engine-ultrawide.test.ts src/renderer/src/workspace-layout/layout-engine.test.ts src/renderer/src/workspace-layout/presentation-engine.test.ts src/renderer/src/workspace-layout/runtime-policy.test.ts
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
./scripts/format.sh
./check_quality.sh --git-changes
```

After tightening the persisted layout loader and terminal/workflow ultra-wide assertions:

```sh
pnpm --dir desktop exec vitest run src/renderer/src/workspace-layout/workspace-ui-layout.test.ts src/renderer/src/workspace-layout/workspace-scene.test.ts
node desktop/tests/electron/run-workflows.mjs --skip-build --workflow workspace-ultrawide-live-panes
```

After making visible panes activate without niri pane focus:

```sh
pnpm --dir desktop exec vitest run src/renderer/src/workspace-layout/terminal-surface-adapter.test.ts src/renderer/src/workspace-layout/react-dom-surface-adapter.test.tsx src/renderer/src/workspace-layout/surface-adapters.test.ts
pnpm --dir desktop exec electron-vite build
node desktop/tests/electron/run-workflows.mjs --skip-build --workflow workspace-ultrawide-live-panes
```

After adding row-navigation and viewport-expansion coverage:

```sh
node desktop/tests/electron/run-workflows.mjs --skip-build --workflow workspace-ultrawide-live-panes
```

Broad `./check_quality.sh --git-changes` verification is intentionally deferred until the pre-merge pass.
