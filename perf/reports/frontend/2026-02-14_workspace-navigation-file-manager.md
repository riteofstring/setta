# Workspace Navigation File Manager Performance Report (2026-02-14)

## Scope

- Home page file-manager layout refactor.
- Shared file-browser usage in load/save modals.
- View-mode/tab reorder plumbing and ordering utility updates.

## Measurement setup

- Tool: Chrome DevTools MCP performance trace.
- URL/scenario: load `/home` and measure initial navigation.
- CPU/network throttling: none.

## Baseline (before refactor)

- Source artifact: `perf/artifacts/home-baseline-trace.json`
- Prior recorded summary:
  - LCP: 1752 ms
  - CLS: 0.00

## After (this branch)

- Source artifact (local trace capture): `perf/artifacts/home-after-workspace-file-manager-trace.json`
- Trace summary (`NAVIGATION_0`):
  - LCP: 1723 ms
  - CLS: 0.00
  - LCP breakdown: TTFB 127 ms, render delay 1596 ms

## Delta

- LCP improved by 29 ms (1752 -> 1723).
- CLS unchanged (0.00 -> 0.00).
- No regression observed for initial home navigation under this scenario.

## Automated perf guardrails run

- Vitest file: `frontend/src/utils/viewModeOrdering.perf.test.ts`
- Assertions exercised:
  - `sortViewModes` on 20,000 entries stays under 1800 ms.
  - `reorderViewModeIdList` on 15,000 ids stays under 250 ms.
- Result: pass.
