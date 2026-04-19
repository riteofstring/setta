# Settings All Settings Spreadsheet FlowZoom Freeze Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Stop feeding live React Flow zoom updates into the heavy spreadsheet editor during active viewport interaction so the `SpreadsheetArea` section stops paying spreadsheet-theme recalculation churn on every zoom frame.

## Implementation

- `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx`
  - added `useSpreadsheetFlowZoom(...)`, which snapshots the current React Flow zoom and freezes the spreadsheet editor's `flowZoom` prop while `viewportInteractionActive` is true
  - once interaction settles, the hook resynchronizes the editor with the latest zoom level
- `frontend/src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  - added focused coverage proving the spreadsheet editor keeps the previous `flowZoom` during active interaction and catches up after the interaction ends

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
  - `settings-section__spreadsheetSectionDefault`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-011/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

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
- `raf.meanMs: 44.12`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1216.6`
- `longTasks.count: 8`
- `longTasks.totalMs: 6044`
- `longTasks.maxMs: 3520`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-persistence-interaction-deferral-rerun.md` on the same dense probe:

- `documentNodeCount: 5494 -> 5494`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 47 -> 47`
- `raf.meanMs: 43.28 -> 44.12`
- `raf.p50Ms: 33.3 -> 33.3`
- `raf.p95Ms: 33.4 -> 50`
- `raf.maxMs: 1183.29 -> 1216.6`
- `longTasks.count: 8 -> 8`
- `longTasks.totalMs: 6076 -> 6044`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`

## Interpretation

- This is a bounded spreadsheet-specific rerender suppression slice on the broader viewport-interaction JS lane, not a new whole-scene perf breakthrough.
- The dense canary stayed broadly flat after the change, with a small long-task-total reduction but no meaningful global frame-time move. That keeps the larger `browserSectionDefault` renderer-main JS/GC frontier open.
- The value of this pass is narrower: it removes one obvious per-frame zoom dependency from a heavyweight section and does so without introducing a visible spreadsheet-surface artifact on the live canary.

## Verification

- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-011/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (40.4s)`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Layouts/SpreadsheetArea.tsx src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  - result: blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before test collection, not by this slice
- CDP visual check:
  - verified in a fresh headless DevTools sub-agent using a fresh one-shot bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized the surface to `All Settings`
  - `settings-section__spreadsheetSectionDefault` was visible and intact on the settings surface
  - after one bounded fit-view adjustment there was no obvious blank or detached artifact around the spreadsheet section
