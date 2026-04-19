# Settings All Settings Viewport Persistence Project-Store Fanout Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior hotspot reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Reduce one trace-backed renderer-main JS / GC source on the canonical dense `All Settings` lane by removing eager project-store viewport mirroring from local viewport persistence and specializing the React Flow transform subscription equality path.

## Canonical lane

- target section: `settings-section__browserSectionDefault`
- sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Trace-backed reason for the slice

Local CPU sample aggregation on the saved hotspot artifact from `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md` showed the checked `wheel` `EventDispatch` window spending time in:

- `src/state/subscriptions.ts`
- `dispatchViewportUpdate(...)` in `src/state/actions/sectionInfos.ts`
- `applyViewportSnapshotToProjectState(...)`
- `lodash` deep-equality checks under the viewport persistence subscription path

That made the next bounded product pass a project-store fanout reducer, not another section-shell or `ZoomPane` micro-polish pass.

## Implementation shape

- `frontend/src/state/actions/sectionInfos.ts`
  - viewport snapshots now stay authoritative in `pendingViewportRef` plus the existing optimistic pending-op replay path instead of eagerly mirroring into `useProjectState` during local viewport persistence
  - local viewport comparisons on the persistence path now use a fixed-field viewport comparator instead of `_.isEqual(...)`
  - exported `areViewportTransformsEqual(...)` so the hot subscription path can compare the fixed transform tuple without lodash
- `frontend/src/state/subscriptions.ts`
  - the React Flow transform subscription now uses a fixed-field equality function keyed to `fitViewOnInit`, `fitViewOnInitDone`, `viewportInteractionActive`, and the `[x, y, zoom]` tuple
  - the same fixed transform comparator replaces the old transform-array `_.isEqual(...)` check before scheduling viewport persistence
- `frontend/src/state/subscriptions.test.ts`
  - updated the viewport persistence expectations so the project store stays stale locally until backend reconciliation replays the pending viewport op

## Fresh dense rerun

Fresh live rerun on the current worktree runtime recorded:

- `blankPanePoint: { x: 24, y: 60 }`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `documentNodeCount: 5498`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 43.28`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1199.9`
- `longTasks.count: 8`
- `longTasks.totalMs: 5980`
- `longTasks.maxMs: 3472`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- This is a bounded whole-scene persistence-fanout reducer on the active renderer-main JS / GC lane.
- The dense canary stayed in the same improved `~43 ms` / `~6.0 s long-task total` band instead of regressing, so the narrower viewport-authority path is safe to keep.
- This pass removes one known project-store fanout from the trace-backed hotspot, but it is not yet the missing whole-scene breakthrough by itself.
- Keep the canonical dense lane on `settings-section__browserSectionDefault`; the next default pass should re-measure the remaining renderer-main JS / GC work or escalate to the broader Pixi-owned graph-surface step rather than reopen another `ZoomPane` micro-pass.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/state/subscriptions.ts src/state/actions/sectionInfos.ts src/state/subscriptions.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/state/subscriptions.test.ts`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-023/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.6s)`
- Chrome DevTools MCP:
  - verified in a fresh headless DevTools sub-agent after consuming a fresh bootstrap URL
  - normalized to `All Settings`, used `Full screen pane`, and applied `fit view`
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were visible on the graph surface
  - no blank graph or obvious detached shell/body artifact was visible on the checked lane
