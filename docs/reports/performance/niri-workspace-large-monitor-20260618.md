# Niri Workspace Large-Monitor Performance Pass - 2026-06-18

## Context

Target: improve large-monitor real-workspace movement and pane resize behavior toward a steady
120fps budget. At 120Hz the per-frame budget is 8.33ms, so this pass focused on removing repeated
main-thread and native-view work from the active interaction path.

The pre-existing plan was `docs/plans/niri_workspace_large_monitor_performance_plan.md`. A clean
large-monitor 120Hz before/after FPS baseline was not available in the repo harness before this pass;
the current evidence is therefore correctness gates plus targeted performance-path assertions.

## Changes Made

- Pane splitter drag now computes a preview marker during pointer movement and commits the layout
  store mutation only on release. Before this pass, every pointer move called the layout store resize
  path and notified subscribers.
- Real workspace mode now enables movement degradation. Focus no longer keeps expensive browser,
  heavy DOM, settings, terminal, git graph, and workflow graph panes live while the workspace is
  moving.
- Browser native view updates are deduped across all runtime states, not only live states. Snapshot
  and hidden browser panes no longer resend identical native updates each frame.
- Browser proxy adapters only queue per-frame native updates while live; freeze/resume/viewport
  transitions still queue immediately.
- Real terminal output is buffered while the terminal adapter is frozen and drained on resume/focus/
  visible transitions.
- Chat transcript timeline row construction now depends only on message ids, message records, and
  transcript turns, so streaming run-output maps do not rebuild the timeline.

## Verification

Focused tests:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/workspace-layout/layout-store.test.ts \
  src/renderer/src/workspace-layout/runtime-policy.test.ts \
  src/renderer/src/workspace-layout/runtime-mode-options.test.ts \
  src/renderer/src/workspace-layout/native-view-bounds-batcher.test.ts \
  src/renderer/src/workspace-layout/surface-adapters.test.ts \
  src/renderer/src/workspace-layout/terminal-surface-adapter.test.ts \
  src/renderer/src/components/chat-transcript-timeline.test.ts
```

Result: 7 files passed, 80 tests passed.

Broad gate:

```sh
./scripts/format.sh
./check_quality.sh --all
```

Result: passed. The full gate included Go checks, desktop formatting, lint/complexity, typecheck,
476 Vitest tests, production build, dead-code checks, and required Electron workflows.

Required Electron workflow summary:

- chat
- chat-last-selected
- corrupt-chat
- app-window-drag
- settings-pane
- terminal
- terminal-profile
- terminal-backend-crash
- pane-focus-click
- pane-resize-handles
- dom-pane-snapshot-scroll
- mobile-layout
- workflow-graph-smoke
- workflow-blank-canvas
- semantic-graph
- semantic-cartographer-auto

## Performance Harness Attempts

```sh
node desktop/tests/electron/run-workflows.mjs --tier performance
```

Result: failed in `workflow-graph-scale-validation` after two passing graph scale scenarios. Failure:
marquee exact selection selected only `synthetic-node-00501` instead of the expected 3x3 node set.
This failure is outside the modified workspace movement and resize paths, but it prevented the full
performance tier from completing.

```sh
node desktop/tests/electron/overview-zoom-performance.test.mjs \
  --skip-build \
  --artifact-dir .recordings/overview-zoom-performance/niri-workspace-movement-20260618
```

Result: failed while waiting for visible native browser panes. The harness observed zero visible
browser panes during setup and timed out in `ensureVisibleBrowserPaneCount`.

## Remaining Measurement Gap

This pass removes the highest-confidence steady-interaction costs, but it does not prove steady
120fps on a real large monitor. The next measurement step should use a real large-workspace fixture
on 120Hz hardware, capture before/after frame timing around horizontal workspace movement and pane
resize, and record p95/p99 frame time plus dropped-frame counts.
