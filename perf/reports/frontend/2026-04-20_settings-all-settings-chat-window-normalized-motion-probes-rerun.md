# Settings All Settings Chat-Window-Normalized Motion Probes Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-backdrop-measurement-scale-freeze-rerun.md`
Focused motion probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Normalize the canonical `settings` -> `All Settings` motion probes so project chat window chrome does not contaminate the dense viewport-motion lane before the next renderer-main hotspot decision.

## Implementation

- `frontend/tests/e2e/helpers.ts`
  - tightened `clearProjectChatWindows(...)` to wait on actual floating/docked/maximized/pill window chrome instead of an unrelated in-pane chat title
  - added `disableProjectChatAutoCreate(...)` so tests can suppress `autoCreateInitialChat` and start from an empty authoritative `projectChatWindowing` payload on `/settings`
- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
  - now disables project chat auto-create before bootstrap
  - now clears project chat windows after the settings surface is ready
  - now records `projectChatChromeCount` and asserts the dense run is measuring a chat-free workspace state
- `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
  - now disables project chat auto-create before bootstrap
  - now clears project chat windows before the focused motion-hidden-body verification runs

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
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-009/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

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
- `raf.meanMs: 126.46`
- `raf.p50Ms: 83.3`
- `raf.p95Ms: 116.7`
- `raf.maxMs: 4649.9`
- `longTasks.count: 81`
- `longTasks.totalMs: 17245`
- `longTasks.maxMs: 3587`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-backdrop-measurement-scale-freeze-rerun.md`:

- `projectChatChromeCount: unknown -> 0`
- `documentNodeCount: 5575 -> 5494`
- `inputCount: 5 -> 3`
- `textareaCount: 2 -> 1`
- `buttonCount: 60 -> 47`
- `raf.meanMs: 122.4 -> 126.46`
- `raf.p95Ms: 116.7 -> 116.7`
- `longTasks.count: 72 -> 81`
- `longTasks.totalMs: 16216 -> 17245`

## Focused Motion Proof

- The focused motion-hidden body probe still passed on the same chat-normalized runtime:
  - before motion on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`:
    - `hiddenBodyCount: 0`
    - `hiddenHeaderControlsCount: 0`
    - `display: block`
    - `childElementCount: 2`
  - during one checked zoom interaction:
    - `hiddenBodyCount: 45`
    - `hiddenHeaderControlsCount: 45`
    - `display: none`
    - `childElementCount: 0`
  - after settle:
    - `hiddenBodyCount: 0`
    - `hiddenHeaderControlsCount: 0`
    - `display: block`
    - `childElementCount: 2`

## Interpretation

- This is a probe-normalization slice, not a product perf win: the dense lane now proves the checked run started with `projectChatChromeCount: 0`, so the remaining numbers are less polluted by chat-window workspace chrome.
- The lower `documentNodeCount`, `inputCount`, `textareaCount`, and `buttonCount` confirm the normalization mattered materially for whole-page counts.
- Even after removing that chrome, the dense canary is still clearly bad in absolute terms. `raf.meanMs 126.46` and `longTasks.totalMs 17245` keep the renderer-main viewport-motion blocker explicit.
- That means the current frontier remains product work on viewport-interaction JS/GC reduction or the broader graph-surface step; this normalization pass should stop future iterations from misreading chat-window noise as graph-surface progress.

## Verification

- Playwright focused + dense probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-009/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.1m)`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/helpers.ts tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
  - result: blocked by pre-existing unused-symbol errors elsewhere in `frontend/tests/e2e/helpers.ts` (`BOOTSTRAP_TOKEN`, `setSectionEdgeOutputsFromFrontend`, `refreshProjectStateFromBackend`, `waitForProjectUrl`), not by the new normalization lines
- CDP visual check:
  - see the iteration handoff/history entry for the fresh headless DevTools confirmation on `/settings`
