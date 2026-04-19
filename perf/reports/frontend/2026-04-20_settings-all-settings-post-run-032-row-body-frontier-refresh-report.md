# Settings All Settings Post-Run-032 Row-Body Frontier Refresh Report

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior row-body reference: `perf/reports/frontend/2026-04-19_settings-all-settings-row-body-surface-ranking.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-browser-shell-lightweight-nested-children-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Refresh the stale row-body/article-chrome frontier after run `032` so the next automated pass is chosen from current evidence instead of the older April 19 ranking snapshot.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__browserSectionDefault`
- Commands:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-033/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

## Focused Row-Body Refresh

Fresh row-body rerank on the live run-`033` runtime recorded:

- `mountedSectionCount: 46`
- `totalRowCount: 759`
- `totalRemainingRowCount: 0`
- `totalRemainingVisibleElementCount: 0`
- `totalRemainingVisibleChromeElementCount: 0`
- `totalRemainingVisibleLabelElementCount: 0`
- `totalRemainingVisibleValueElementCount: 0`
- `commonRemainingKinds: []`

Highest-row-count sections on the same rerank still included:

- `settings-section__sectionSizingPolicy`: `rowCount 211`, `remainingRowCount 0`
- `settings-section__shortcuts`: `rowCount 62`, `remainingRowCount 0`
- `settings-section__chatSectionDefault`: `rowCount 24`, `remainingRowCount 0`
- `settings-section__gui`: `rowCount 22`, `remainingRowCount 0`
- `settings-section__browserSectionDefault`: `rowCount 15`, `remainingRowCount 0`
- `settings-section__promptSectionDefault`: `rowCount 15`, `remainingRowCount 0`

Interpretation:

- The older April 19 row-body ranking is now stale as a default product selector.
- The currently mounted `ParamContainer` row-body/article-chrome frontier is already cleared on the live canary.
- Another automated pass aimed at a “next shared row-body/article-chrome survivor” would be churn unless a brand-new survivor family is first re-established by fresh evidence.

## Fresh Dense Metrics

The paired dense rerun on the same runtime recorded:

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 42.99`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 49.9`
- `raf.maxMs: 1083.2`
- `longTasks.count: 8`
- `longTasks.totalMs: 6094`
- `longTasks.maxMs: 3743`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared with `perf/reports/frontend/2026-04-20_settings-all-settings-browser-shell-lightweight-nested-children-cluster-rerun.md`:

- `documentNodeCount: 5494 -> 5494`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.42 -> 42.99`
- `raf.p95Ms: 50 -> 49.9`
- `longTasks.totalMs: 5916 -> 6094`

Interpretation:

- The dense canary remains in the same `~43ms` band even though the row-body frontier is already zero.
- That means the queued row-body/article-chrome lane can no longer explain the current dense blocker on its own.
- The next real frontier needs a broader renderer-side structural decision or a fresh hotspot/research pass, not another stale row-body cleanup.

## Verification

- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-033/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (57.1s)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent
  - `All Settings` was active and `settings-section__browserSectionDefault` was present in the page state
  - the single mounted graph canvas sampled as fully transparent/blank, so the retained graph could not be visually confirmed on this headless canary
  - no obvious detached shell/body artifact showed up during the same check
  - notable noise: the minimized chat window remained docked at the bottom and DevTools emitted heavy live-region/status chatter
