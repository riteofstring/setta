# Settings All Settings ZoomPane Transform RAF Coalescing Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`

## Goal

Reduce whole-scene renderer-main churn on the active viewport-interaction lane by coalescing interaction-driven React Flow `transform` store writes to one pending update per animation frame instead of emitting a new store write for every raw D3 zoom event.

## Implementation

- `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - interaction-driven `zoom` events now queue the latest `transform` into one pending animation-frame update instead of synchronously calling `useReactFlow.setState(...)` on every raw wheel / drag / pinch event
  - non-interaction transforms still flush immediately so programmatic viewport changes such as initial `fitView` keep their current semantics
  - `zoom end` now flushes the final pending transform synchronously so the last interaction position is committed even if the gesture settles before the queued frame runs
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`
  - added focused coverage for coalescing repeated wheel transforms into one next-frame commit and for synchronously flushing the final wheel transform on gesture end

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
  - Chrome DevTools MCP, headless Chromium
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Fresh Dense Metrics

Fresh live rerun on the current worktree runtime recorded:

- blank pane point: `x=24`, `y=60`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5496`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 43.97`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1166.59`
- `longTasks.count: 8`
- `longTasks.totalMs: 5992`
- `longTasks.maxMs: 3508`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md` on the same chat-normalized dense probe:

- `documentNodeCount: 5494 -> 5496`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.28 -> 43.97`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 33.4 -> 50`
- `raf.maxMs: 1183.29 -> 1166.59`
- `longTasks.count: 8 -> 8`
- `longTasks.totalMs: 6076 -> 5992`
- `longTasks.maxMs: 3610 -> 3508`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Interpretation

- This is a bounded whole-scene event-pacing cleanup on the current renderer-main JS / GC lane, not a new dense-scene breakthrough.
- The live surface stayed in the same improved runtime band and the canary remained visually intact, so coalescing raw interaction transforms to animation frames is safe to keep.
- The result is mixed rather than decisive: the long-task totals improved a little, but the frame-time checkpoint did not materially beat the current best whole-scene report.
- Close this sub-lane here instead of continuing to polish `ZoomPane` event pacing by inertia.
- The next default frontier should return to a larger trace-backed renderer-main reducer or escalate to the broader Pixi-owned graph-surface step.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/ZoomPane.tsx src/forks/xyflow/core/container/ZoomPane.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/ZoomPane.test.ts`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-020/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (41.0s)`
- CDP visual check:
  - verified in a fresh headless DevTools sub-agent on `/settings` with `All Settings` active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were visible
  - no blank graph, detached shell/body artifact, or other gross visual breakage was visible
