# Overview Ordering and Badge Refresh Bounds

Date: 2026-02-17
Area: frontend
Branch/Commit: workspace-navigation-file-manager (working tree, uncommitted)
Related PR: n/a

Code paths touched:
- `frontend/src/components/Panes/Overview/ProjectConfigs.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts`

## Goal

Reduce avoidable work in Overview pane paths:
- remove redundant project-config reorder pass
- bound Setta-badge refresh fan-out to avoid request bursts

## Scenario

- Entry point (URL/route/screen): project screen (`http://127.0.0.1:3025/<project>`)
- Steps to reproduce (deterministic):
  1. Use `chrome-devtools-mcp` `evaluate_script` to benchmark legacy vs refactored project-config ordering logic on a synthetic 5,000-config dataset.
  2. Use `evaluate_script` to simulate Setta-badge refresh over 60 folders and record max in-flight tasks for legacy `Promise.all` vs bounded concurrency (`limit=8`).
- Data set / project used: synthetic arrays generated in-page.
- Browser + OS: Chrome 144 on macOS (via chrome-devtools-mcp).
- Notes: dev build, no throttling.

## Before (baseline)

- Measurement method:
  - CDP runtime evaluation (`chrome-devtools-mcp` `evaluate_script`) with legacy algorithm variants embedded in the script.
- Key metrics:
  - Project-config ordering (legacy two-pass): **0.5065 ms/call** average (200 iterations, 5,000 configs).
  - Badge refresh fan-out (legacy `Promise.all` over 60 folders): **max in-flight = 60**.
- Observations:
  - Ordering path performed an unnecessary second pass even when ID reconciliation was already complete.
  - Badge refresh could burst all expanded-folder requests at once.

## After

- Key metrics:
  - Project-config ordering (single-pass): **0.2740 ms/call** average.
  - Ordering improvement: **45.90% faster** in this synthetic benchmark.
  - Badge refresh bounded path (`limit=8`): **max in-flight = 8**.
- Observations:
  - Ordering path now does one deterministic ID->config pass.
  - Badge refresh request scheduling is now capped and predictable.

## Conclusion

- What improved:
  - Lower per-render ordering cost in Overview project-config list path.
  - Controlled refresh fan-out for large expanded folder sets.
- What regressed (if any) + why it is acceptable:
  - No regression observed in behavior tests; bounded concurrency trades burst throughput for steadier load.
- Follow-ups:
  - If needed, tune `SETTA_BADGE_REFRESH_CONCURRENCY_LIMIT` based on backend capacity/latency.

## Raw Artifacts (local-only)

- CDP `evaluate_script` outputs captured in-session on page `http://127.0.0.1:3025/small_shining`.

## Automated Perf Tests

- Playwright spec(s): n/a (functional E2E coverage updated separately)
- Vitest test(s) / bench(es): `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.test.ts`
- Budgets/assertions added:
  - `forEachWithConcurrencyLimit` unit test asserts bounded in-flight concurrency behavior.
