# Settings All Settings Viewport Persistence Interaction Deferral Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-chat-window-normalized-motion-probes-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Stop mirroring the live React Flow viewport into `useProjectState` on every active pan/zoom frame so dense `All Settings` viewport motion stops paying whole-app project-store churn during the interaction burst.

## Implementation

- `frontend/src/state/actions/sectionInfos.ts`
  - extended the viewport dispatch helper so callers can update the pending persisted viewport snapshot without immediately mirroring that snapshot into `useProjectState`
  - added `dispatchViewportUpdateWhileInteracting()` for the active-motion path
- `frontend/src/state/subscriptions.ts`
  - the React Flow transform subscription now includes `viewportInteractionActive`
  - while viewport interaction is active, it only refreshes the pending viewport snapshot instead of rewriting `useProjectState.projectConfig.viewport`
  - when interaction settles, it mirrors the latest viewport snapshot back into `useProjectState` once and preserves the existing immediate auto-fit flush path
- `frontend/src/state/subscriptions.test.ts`
  - added focused coverage for the deferred mirror behavior: active interaction keeps `projectConfig.viewport` stale while still queuing the pending viewport, then the settled transition mirrors the latest viewport into project state

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
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-010/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

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
- `raf.meanMs: 43.28`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 33.4`
- `raf.maxMs: 1183.29`
- `longTasks.count: 8`
- `longTasks.totalMs: 6076`
- `longTasks.maxMs: 3610`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-chat-window-normalized-motion-probes-rerun.md` on the same chat-normalized dense probe:

- `documentNodeCount: 5494 -> 5494`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 126.46 -> 43.28`
- `raf.p50Ms: 83.3 -> 33.3`
- `raf.p95Ms: 116.7 -> 33.4`
- `raf.maxMs: 4649.9 -> 1183.29`
- `longTasks.count: 81 -> 8`
- `longTasks.totalMs: 17245 -> 6076`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Interpretation

- This is a real renderer-main reduction on the live dense canary, not another ownership proof: the whole-scene DOM counts stayed flat while the motion metrics improved sharply.
- Because the dense probe shape, chat-window normalization, document-node counts, interactive-core counts, and motion-hidden-body totals all stayed aligned, the most credible explanation is the intended one: the dense viewport path is no longer rewriting `useProjectState.projectConfig.viewport` on every motion frame.
- The lane still is not “done” in absolute terms, but this pass materially lowers the renderer-main JS/store-churn floor and keeps the current frontier on the same motion-performance lane instead of reopening another closed section-family cleanup.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-010/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.6s)`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/state/actions/sectionInfos.ts src/state/subscriptions.ts src/state/subscriptions.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/state/subscriptions.test.ts`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- CDP visual check:
  - first fresh headless DevTools pass surfaced a docked `Chat Window 1` panel on the right side; treated as workspace-chrome noise, not a renderer defect
  - reran the visual check in a fresh headless DevTools sub-agent after closing that docked chat panel
  - `All Settings` stayed active with exactly one retained `react-flow__section-shell-backdrop` canvas mounted
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` remained visually intact with no obvious blank or detached artifact
