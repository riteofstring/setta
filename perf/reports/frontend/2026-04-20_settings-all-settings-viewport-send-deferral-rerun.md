# Settings All Settings Viewport Send Deferral Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Reduce active viewport-interaction JS work a little further by keeping the optimistic local viewport snapshot authoritative during pan/zoom while deferring backend viewport-send scheduling until the interaction settles.

## Implementation

- `frontend/src/state/actions/sectionInfos.ts`
  - extended the viewport dispatch options so active interaction can refresh `pendingViewportRef.snapshot` and preserve the optimistic pending op without rearming the backend send debounce on every motion tick
  - `dispatchViewportUpdateWhileInteracting()` now keeps `mirrorToProjectState: false` and also sets `scheduleSend: false`
- `frontend/src/state/subscriptions.test.ts`
  - added focused coverage proving active interaction keeps the optimistic viewport pending op alive without starting the backend send debounce until the settled transition

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
- `raf.meanMs: 43.7`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1116.6`
- `longTasks.count: 9`
- `longTasks.totalMs: 6378`
- `longTasks.maxMs: 3903`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md` on the same chat-normalized dense probe:

- `documentNodeCount: 5494 -> 5494`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.28 -> 43.7`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 33.4 -> 50`
- `raf.maxMs: 1183.29 -> 1116.6`
- `longTasks.count: 8 -> 9`
- `longTasks.totalMs: 6076 -> 6378`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Interpretation

- This is a safe whole-scene viewport-persistence cleanup, not a new dense-motion breakthrough.
- The checked dense canary stayed in the same improved band, which means deferring backend send scheduling during active interaction does not reopen the earlier viewport-persistence regression.
- It did not materially beat the current whole-scene checkpoint, so this lane should close here as a bounded reducer rather than consuming more default iterations by inertia.
- The next default frontier should escalate to the broader Pixi-owned graph-surface step unless a fresh trace identifies a stronger renderer-main JS / GC source than the now-closed viewport-persistence send path.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-012/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (36.9s)`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/state/actions/sectionInfos.ts src/state/subscriptions.test.ts`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/state/subscriptions.test.ts`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- CDP visual check:
  - verified in a fresh headless DevTools sub-agent using a fresh one-shot bootstrap URL from `./scripts/dev-runtime-info.sh`
  - `All Settings` stayed active
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` remained visually intact with no obvious blank or detached shell/body artifact on the canvas path
  - the only residual noise in that pass was bottom project-chat chrome that persisted after close/minimize attempts, treated as workspace chrome noise rather than renderer drift
