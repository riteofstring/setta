# Home Project Partition Single-Pass Refactor

Date: 2026-02-17
Area: frontend
Branch/Commit: workspace-navigation-file-manager (working tree, uncommitted)
Related PR: n/a

Code paths touched:
- `frontend/src/components/Pages/Home/HomePage.tsx`
- `frontend/src/components/Pages/Home/HomePage.test.tsx`

## Goal

Reduce Home gallery render-time overhead when partitioning large project lists into favorite/non-favorite buckets.

## Scenario

- Entry point (URL/route/screen): `/home`
- Steps to reproduce (deterministic):
  1. Open Home page in Chrome with DevTools MCP.
  2. Run a JS benchmark in-page comparing:
     - baseline logic: two `filter` passes + array concat for count
     - refactor logic: single `for...of` pass + direct `projects.length`
  3. Use identical dataset and iteration counts for both implementations.
- Data set / project used: synthetic list of 50,000 project-like entries, ~33% favorites.
- Browser + OS: Chrome 144 on macOS (via chrome-devtools-mcp).
- Notes: no network throttling; warmup loops included before each timed run.

## Before (baseline)

- Measurement method (DevTools panels used, settings):
  - CDP Runtime evaluation (`chrome-devtools-mcp` `evaluate_script`) with `performance.now()` timing.
- Key metrics:
  - Average over 3 runs (120 iterations/run): **2.3297 ms** per call.

## After

- Key metrics:
  - Average over 3 runs (120 iterations/run): **0.9375 ms** per call.
  - Absolute improvement: **1.3922 ms** per call.
  - Relative improvement: **59.71% faster**.
- Per-run samples:
  - Run 1: legacy 2.4342 ms, single-pass 0.9483 ms (61.04% faster)
  - Run 2: legacy 2.3450 ms, single-pass 0.9367 ms (60.06% faster)
  - Run 3: legacy 2.2100 ms, single-pass 0.9275 ms (58.03% faster)

## Conclusion

- What improved:
  - The Home partition hot path now avoids duplicate scans and temporary concat allocation.
  - Synthetic large-list cost dropped by about 60% for this operation.
- What regressed (if any) + why it is acceptable:
  - No regression observed in this benchmark.
- Follow-ups:
  - If Home lists grow further, consider adding memoized pre-indexes for favorite ids by workspace/session scope.

## Raw Artifacts (local-only)

- CDP runtime benchmark output captured in-session (DevTools MCP `evaluate_script`, page `http://127.0.0.1:3025/home`).

## Automated Perf Tests

- Playwright spec(s): `frontend/tests/e2e/home/home-file-manager.spec.ts`
- Vitest test(s) / bench(es): `frontend/src/components/Pages/Home/HomePage.test.tsx`
- Budgets/assertions added:
  - Functional guardrails for partition output correctness (favorites/non-favorites/count).
