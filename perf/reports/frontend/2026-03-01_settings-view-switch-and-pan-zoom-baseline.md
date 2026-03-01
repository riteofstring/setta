# Settings View Switch + Pan/Zoom Baseline

Date: 2026-03-01
Area: frontend
Branch/Commit: frontend-performance-2 @ 474fd190
Related PR: n/a

## Goal

Lock a reproducible baseline for large-project frontend performance pain in the `settings` project and add automated guardrails before refactor work.

Touched code paths:
- `frontend/tests/e2e/settings/perfScenario.ts`
- `frontend/tests/e2e/settings/settings-performance-guardrails.spec.ts`
- `docs/plans/large-project-frontend-performance-10x-plan.md`

## Scenario

- Entry point (URL/route/screen): `/settings`.
- Steps to reproduce:
  1. Load settings view and wait for canvas ready state.
  2. Measure DOM complexity for `Core`, `Param Defaults`, and `All Settings`.
  3. Measure long-task durations while switching into `All Settings`.
  4. Run a fixed 180-frame viewport transform stress loop per tab.
- Data set / project used: built-in `settings` project (many sections/params in `All Settings` tab).
- Browser + OS: Chrome (CDP MCP) on macOS; Playwright Chromium headless for automated guardrails.
- Notes (extensions, throttling, dev/prod build, etc): no throttling, local dev instance, CDP-driven profiling plus E2E automation.

## Before (baseline)

- Measurement method:
  - CDP: `PerformanceObserver` long-task measurements + DOM counts + viewport transform stress loop.
  - Playwright: new guardrail spec asserts coarse long-task and DOM budgets.
- Key metrics:
  - DOM size by tab:
    - `Core`: 3696 elements, 5 nodes, 301 param rows.
    - `Param Defaults`: 1868 elements, 13 nodes, 76 param rows.
    - `All Settings`: 9715 elements, 42 nodes, 697 param rows, max depth 30, max children 166.
  - View switch long-task cost (2.2s observation windows):
    - `Core -> All Settings`: 1447ms total, 885ms max.
    - `Param Defaults -> All Settings`: 1669ms total, 1067ms max.
    - `All Settings -> Core`: 422ms total/max.
    - `All Settings -> Param Defaults`: 277ms total/max.
  - Transform stress (180 frames):
    - `Core`: 120.3 FPS avg.
    - `Param Defaults`: 120.7 FPS avg.
    - `All Settings`: 56.9 FPS avg.
    - Long-task count during stress loop: 0 in all runs.
- Observations:
  - Switching into `All Settings` is main-thread expensive.
  - Pan/zoom degradation in heavy views appears paint/layout/compositing bound rather than long-task JS bound.
  - DOM complexity in `All Settings` is very high relative to other tabs.

## After

(Append this section after refactor, using the same scenario + method.)

- Key metrics:
- Observations:

## Conclusion

- What improved:
  - Added explicit baseline and automated E2E guardrails to prevent unbounded regressions during the refactor.
- What regressed (if any) + why it is acceptable:
  - None.
- Follow-ups:
  - Run the same scenario after each optimization phase and append results in this file.

## Raw Artifacts (local-only)

- None committed. CDP traces were used during investigation; keep future traces under `perf/artifacts/frontend/`.

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/settings/settings-performance-guardrails.spec.ts`
- Vitest test(s) / bench(es):
  - None in this step.
- Budgets/assertions added:
  - Tab-switch long-task ceilings for `Core -> All Settings`, `Param Defaults -> All Settings`, and `All Settings -> Core`.
  - DOM complexity ceilings for `Core`, `Param Defaults`, and `All Settings` (element count, node count, param rows, depth, max children).

## Rerun (2026-03-02, post `backend-performance` merge)

- Branch/commit at rerun: `frontend-performance-2 @ 4cb68f46`.
- Trigger: verify whether the merged backend performance work changed the frontend settings baseline.

### Automated guardrail rerun

- Command:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-performance-guardrails.spec.ts`
- Result:
  - `2 passed` (`settings tab switching long-task cost stays within budget`, `settings DOM complexity stays within guardrail budgets`).

### Metric probe rerun

- Method:
  - Scripted browser probe using `@playwright/test` Chromium against `http://127.0.0.1:3002/settings`.
  - In-page `PerformanceObserver` (`longtask`) + DOM counters + fixed 180-frame viewport transform stress loop.
  - Note: `chrome-devtools-mcp` was unavailable in this session (`MCP startup cancelled`), so this rerun used equivalent in-page instrumentation instead of DevTools trace tooling.
- Key metrics:
  - DOM by tab:
    - `Core`: 3700 elements, 5 nodes, 301 param rows, max depth 30, max children 62.
    - `Param Defaults`: 1872 elements, 13 nodes, 76 param rows, max depth 26, max children 57.
    - `All Settings`: 9715 elements, 42 nodes, 697 param rows, max depth 30, max children 166.
  - Long-task switch cost (2.2s windows):
    - `Core -> All Settings`: 795ms total, 547ms max.
    - `Param Defaults -> All Settings`: 1043ms total, 675ms max.
    - `All Settings -> Core`: 216ms total/max.
    - `All Settings -> Param Defaults`: 173ms total/max.
  - Transform stress (180 frames):
    - `Core`: 120.9 FPS avg.
    - `Param Defaults`: 121.2 FPS avg.
    - `All Settings`: 45.2 FPS avg.
    - Long-task count during transform loops: 0.

### Observations from rerun

- DOM complexity in `All Settings` is effectively unchanged from baseline.
- Switch-to-`All Settings` long-task totals were lower in this run than the original baseline run.
- Pan/zoom-like transform performance in `All Settings` remained poor and was worse in this run (`45.2 FPS`), reinforcing that heavy-view paint/layout/compositing remains a major bottleneck.

## Rerun (2026-03-02, after view-mode delta websocket path)

- Branch/commit at rerun: `frontend-performance-2` working tree after Phase 2 view-mode delta implementation.
- Trigger: measure impact of targeted view-mode websocket updates (avoid full project-state snapshot apply on view-mode actions).

### Automated guardrail rerun

- Command:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-performance-guardrails.spec.ts`
- Result:
  - `2 passed` (`settings tab switching long-task cost stays within budget`, `settings DOM complexity stays within guardrail budgets`).

### Metric probe rerun

- Method:
  - Scripted browser probe using `@playwright/test` Chromium against `http://127.0.0.1:3002/settings`.
  - In-page `PerformanceObserver` (`longtask`) + DOM counters + fixed 180-frame viewport transform stress loop.
  - Note: `chrome-devtools-mcp` was unavailable in this session (`MCP startup cancelled`), so this rerun used equivalent in-page instrumentation instead of DevTools trace tooling.
- Key metrics:
  - DOM by tab:
    - `Core`: 3696 elements, 5 nodes, 301 param rows, max depth 30, max children 62.
    - `Param Defaults`: 1868 elements, 13 nodes, 76 param rows, max depth 26, max children 57.
    - `All Settings`: 9715 elements, 42 nodes, 697 param rows, max depth 30, max children 166.
  - Long-task switch cost (2.2s windows):
    - `Core -> All Settings`: 770ms total, 559ms max.
    - `Param Defaults -> All Settings`: 981ms total, 661ms max.
    - `All Settings -> Core`: 223ms total/max.
    - `All Settings -> Param Defaults`: 140ms total/max.
  - Transform stress (180 frames):
    - `Core`: 120.6 FPS avg.
    - `Param Defaults`: 121.2 FPS avg.
    - `All Settings`: 45.8 FPS avg.
    - Long-task count during transform loops: 0.

### Observations from rerun

- Switch-to-`All Settings` long-task totals improved modestly versus the previous rerun (`795ms -> 770ms` from `Core`, `1043ms -> 981ms` from `Param Defaults`), consistent with less front-end work during view-mode state apply.
- DOM complexity and heavy-view transform FPS are effectively unchanged, so paint/layout/compositing cost in `All Settings` remains the dominant bottleneck.

## CDP Rerun (2026-03-02, chrome-devtools-mcp reconnected)

- Branch/commit at rerun: `frontend-performance-2` working tree after Phase 2 view-mode delta implementation.
- Trigger: re-run measurements using live Chrome DevTools MCP (headed browser) instead of fallback scripted probe only.

### CDP metric run

- Method:
  - `chrome-devtools-mcp` page navigation to `http://127.0.0.1:3002/settings`.
  - In-page metric script via DevTools MCP `evaluate_script` (same structure as prior probe):
    - DOM counters by tab.
    - 2.2s long-task windows for tab switches.
    - 180-frame viewport transform stress loop per tab.
- Key metrics:
  - DOM by tab:
    - `Core`: 3696 elements, 5 nodes, 301 param rows, max depth 30, max children 62.
    - `Param Defaults`: 1831 elements, 13 nodes, 76 param rows, max depth 26, max children 57.
    - `All Settings`: 9615 elements, 42 nodes, 697 param rows, max depth 30, max children 108.
  - Long-task switch cost (2.2s windows):
    - `Core -> All Settings`: 1044ms total, 722ms max.
    - `Param Defaults -> All Settings`: 1458ms total, 1026ms max.
    - `All Settings -> Core`: 351ms total/max.
    - `All Settings -> Param Defaults`: 566ms total, 343ms max.
  - Transform stress (180 frames):
    - `Core`: 111.7 FPS avg.
    - `Param Defaults`: 116.1 FPS avg.
    - `All Settings`: 89.4 FPS avg.
    - Long-task totals during stress loop: `Core` 129ms, `Param Defaults` 62ms, `All Settings` 523ms.

### CDP trace run

- Method:
  - DevTools MCP `performance_start_trace` / `performance_stop_trace` around a `Core -> All Settings` switch interaction.
- Observation:
  - Trace summary returned a `NO_NAVIGATION` insight set tied to bootstrap URL activity and no built-in insight cards, so timeline diagnosis relied on the metric run above.

## CDP Rerun (2026-03-02, after incremental node-map patch for view-mode deltas)

- Branch/commit at rerun: `frontend-performance-2` working tree after incremental node-map update logic in `processViewModeStateUpdateFromBackend`.
- Trigger: validate impact of avoiding full node-map rebuilds on view-mode delta applies.

### Automated guardrail rerun

- Command:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-performance-guardrails.spec.ts`
- Result:
  - `2 passed` (`settings tab switching long-task cost stays within budget`, `settings DOM complexity stays within guardrail budgets`).

### CDP metric run

- Method:
  - `chrome-devtools-mcp` on `http://127.0.0.1:3002/settings`.
  - In-page metric script via `evaluate_script` (DOM by tab, 2.2s long-task switch windows, 180-frame transform stress).
- Key metrics:
  - DOM by tab:
    - `Core`: 3696 elements, 5 nodes, 301 param rows, max depth 30, max children 62.
    - `Param Defaults`: 1831 elements, 13 nodes, 76 param rows, max depth 26, max children 57.
    - `All Settings`: 9615 elements, 42 nodes, 697 param rows, max depth 30, max children 108.
  - Long-task switch cost (2.2s windows):
    - `Core -> All Settings`: 1063ms total, 740ms max.
    - `Param Defaults -> All Settings`: 1388ms total, 993ms max.
    - `All Settings -> Core`: 362ms total/max.
    - `All Settings -> Param Defaults`: 574ms total, 344ms max.
  - Transform stress (180 frames):
    - `Core`: 110.9 FPS avg.
    - `Param Defaults`: 116.8 FPS avg.
    - `All Settings`: 88.2 FPS avg.
    - Long-task totals during transform loop: `Core` 135ms, `Param Defaults` 62ms, `All Settings` 544ms.

### CDP trace run

- Method:
  - DevTools MCP trace around `Core -> All Settings` interaction.
- Observation:
  - Trace summary again surfaced a `NO_NAVIGATION` insight set (URL `http://127.0.0.1:3002/settings`) with no built-in insight cards.

### Observations from rerun

- Versus the immediately prior CDP rerun, the results are mixed and mostly within run-to-run noise:
  - `Param Defaults -> All Settings` improved (`1458ms -> 1388ms` total long-task).
  - `Core -> All Settings` slightly regressed (`1044ms -> 1063ms`).
  - `All Settings` transform FPS stayed in the same range (`89.4 -> 88.2`).
- Conclusion: incremental node-map patch is behavior-safe and low-risk, but by itself it does not move the needle enough toward the 10x target; the larger wins are still likely in param rendering/layout/paint phases.

## CDP Rerun (2026-03-02, after view-mode runtime store split)

- Branch/commit at rerun: `frontend-performance-2` working tree on top of `a1ddcff7` (runtime store split not yet committed).
- Trigger: evaluate impact of splitting frequently changing view-mode runtime fields (`activeViewModeId`, `isEditingViewMode`, `topLevelSections`, `viewport`) into a dedicated store and migrating high-impact subscribers.

### Automated guardrail rerun

- Command:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-performance-guardrails.spec.ts`
- Result:
  - `2 passed` (`settings tab switching long-task cost stays within budget`, `settings DOM complexity stays within guardrail budgets`).

### CDP metric run

- Method:
  - `chrome-devtools-mcp` on `http://127.0.0.1:3002/settings`.
  - In-page metric script via `evaluate_script`:
    - DOM counters by tab.
    - 2.2s long-task windows for tab switches.
    - 180-frame transform stress loop per tab via synthetic `ctrl+wheel` events on `.react-flow__pane`.
- Key metrics:
  - DOM by tab:
    - `Core`: 3696 elements, 5 nodes, 301 param rows, max depth 30, max children 62.
    - `Param Defaults`: 1868 elements, 13 nodes, 76 param rows, max depth 26, max children 57.
    - `All Settings`: 9715 elements, 42 nodes, 697 param rows, max depth 30, max children 166.
  - Long-task switch cost (2.2s windows):
    - `Core -> All Settings`: 1201ms total, 834ms max.
    - `Param Defaults -> All Settings`: 1672ms total, 1191ms max.
    - `All Settings -> Core`: 366ms total/max.
    - `All Settings -> Param Defaults`: 222ms total/max.
  - Transform stress (180 frames):
    - `Core`: 120.8 FPS avg.
    - `Param Defaults`: 121.6 FPS avg.
    - `All Settings`: 33.8 FPS avg.
    - Long-task count during transform loops: 0 in all runs.
  - Repeat check (`All Settings` transform only, same method):
    - Run 1: 32.3 FPS.
    - Run 2: 32.1 FPS.

### CDP trace run

- Method:
  - DevTools MCP trace around `Core -> All Settings` interaction.
  - Artifact saved to:
    - `perf/artifacts/frontend/2026-03-02-view-mode-runtime-store-core-to-all.trace.json`
- Trace summary:
  - Insight set remained `NO_NAVIGATION` (bootstrap URL context), consistent with previous CDP trace behavior in this environment.
  - `DOMSize` insight reported:
    - Total elements: 3638.
    - Max DOM depth: 30.
    - Max children on one element: 62.
    - Largest style recalculation event: 1386ms affecting 6310 elements.

### Observations from rerun

- DOM size is effectively unchanged versus prior runs.
- Switch-time long-task results are mixed and do not show a clear net improvement in this single rerun:
  - Entering `All Settings` regressed versus the immediately prior CDP rerun.
  - `All Settings -> Param Defaults` improved materially.
- Heavy-view transform performance remains poor under the synthetic pan/zoom stress path (`~32-34 FPS` in `All Settings`) with zero long tasks, reinforcing that rendering/layout cost remains the dominant bottleneck.
