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
.recordings/workspace-ultrawide-live-panes/20260701T165516779Z/summary.json
```

Observed production Electron/main/preload/renderer path:

- Viewport: `12000x900`.
- Real workspace persisted layout: 24 panes.
- Viewport-intersecting panes: 23.
- Visible host runtime states: `{ "live": 24 }`.
- Every viewport-intersecting pane had `runtimeState: "live"`.
- Every viewport-intersecting pane had `pointerEvents: "auto"`.
- Every viewport-intersecting pane had a non-empty `surfaceId` and `surfaceKind`.

Result: pass.

## Supporting Checks

Before adding the Electron workflow/report:

```sh
pnpm --dir desktop exec vitest run src/renderer/src/workspace-layout/runtime-mode-options.test.ts src/renderer/src/workspace-layout/layout-engine-ultrawide.test.ts src/renderer/src/workspace-layout/layout-engine.test.ts src/renderer/src/workspace-layout/presentation-engine.test.ts src/renderer/src/workspace-layout/runtime-policy.test.ts
pnpm --dir desktop exec tsc --noEmit -p tsconfig.json
./scripts/format.sh
./check_quality.sh --git-changes
```

Broad `./check_quality.sh --git-changes` verification is intentionally deferred until the pre-merge pass.
