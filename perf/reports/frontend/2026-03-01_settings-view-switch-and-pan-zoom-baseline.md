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
