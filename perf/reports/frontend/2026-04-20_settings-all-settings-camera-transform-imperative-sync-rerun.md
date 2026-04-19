# Settings All Settings Camera Transform Imperative Sync Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Reduce active viewport-interaction React/store churn a little further by taking the graph-surface camera wrappers off React-driven transform subscriptions while keeping the same visible camera behavior.

## Implementation

- `frontend/src/forks/xyflow/core/container/useViewportTransformStyle.ts`
  - added a small imperative transform-sync hook that reads the current React Flow transform once, subscribes to future transform changes, and writes the transform string directly onto a DOM ref instead of rerendering a wrapper component on every camera tick
- `frontend/src/forks/xyflow/core/container/GraphSurfaceCameraLayer.tsx`
  - now uses the imperative transform-sync hook for the retained canvas camera layer
- `frontend/src/forks/xyflow/core/container/Viewport.tsx`
  - now uses the same hook for the DOM viewport wrapper
- `frontend/src/forks/xyflow/core/container/GraphSurface.test.tsx`
  - extended focused coverage so the retained camera layer and DOM viewport both prove they update their transform after a post-mount React Flow state change

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
- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 44.26`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 66.7`
- `raf.maxMs: 1049.92`
- `longTasks.count: 11`
- `longTasks.totalMs: 5885`
- `longTasks.maxMs: 3408`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md` on the same chat-normalized dense probe:

- `documentNodeCount: 5494 -> 5494`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.28 -> 44.26`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 33.4 -> 66.7`
- `raf.maxMs: 1183.29 -> 1049.92`
- `longTasks.count: 8 -> 11`
- `longTasks.totalMs: 6076 -> 5885`
- `longTasks.maxMs: 3610 -> 3408`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Interpretation

- This is a safe shared transform-path cleanup on the active viewport-interaction lane, not a new dense-scene breakthrough.
- The dense canary stayed in the same improved band and the live visual check stayed clean, so taking the two camera wrappers off React-driven transform rerenders does not reopen the checked canary path.
- The result is mixed rather than decisive: long-task totals improved a little, but mean/p95 frame timing did not materially beat the current whole-scene checkpoint.
- Close this camera-wrapper sub-lane here instead of spending another default iteration on transform-wrapper polish.
- The next default frontier should stay on the remaining renderer-main JS / GC blocker. The current trace-backed evidence still points more strongly at motion-time subtree unmount/remount churn or the broader Pixi-owned graph-surface step than at another wrapper-level transform subscription cleanup.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-013/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.5s)`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/GraphSurfaceCameraLayer.tsx src/forks/xyflow/core/container/Viewport.tsx src/forks/xyflow/core/container/useViewportTransformStyle.ts src/forks/xyflow/core/container/GraphSurface.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/GraphSurface.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- CDP visual check:
  - verified in a fresh headless DevTools sub-agent using a fresh one-shot bootstrap URL from `./scripts/dev-runtime-info.sh`
  - `/settings` was mounted with `All Settings` active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` remained visually intact with no obvious blank or detached shell/body artifact after one bounded fit-view adjustment
  - only expected workspace chrome noise was visible (top/side/bottom workspace chrome), with nothing anomalous on the graph surface
