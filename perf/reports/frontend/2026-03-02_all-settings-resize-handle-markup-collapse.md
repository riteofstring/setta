# All Settings Resize-Handle Markup Collapse

Date: 2026-03-02
Area: frontend
Branch/Commit: frontend-performance @ 3d8d87c5 (+ working tree)

## Goal

Reduce repeated param-row chrome by collapsing `ResizeHandle` markup to one interactive element while preserving drag hit area and visual affordances.

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3054/settings`
- Steps to reproduce (keep deterministic): open `All Settings`; switch tabs in loop (`All Settings -> Core -> All Settings`)
- Data set / project used: `Settings` project
- Browser + OS: Chromium (Playwright + CDP) on macOS
- Notes (extensions, throttling, dev/prod build, etc): dev server, no CPU throttle

## Before (baseline)

- Measurement method:
  - DOM counts via CDP `evaluate_script`
  - 9-run benchmark harness (`warmup=2`) with timestamp-window longtask accounting
- Key metrics:
  - Total DOM elements: `9088`
  - Param rows (`[data-param-row="true"]`): `697`
  - Avg param-row subtree size: `13.93`
  - `All -> Core` median: elapsed `509.2 ms`, longtask total `202 ms`
  - `Core -> All` median: elapsed `986.7 ms`, longtask total `768 ms`

## After

- Key metrics:
  - Total DOM elements: `7666` (`-15.6%`)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Avg param-row subtree size: `11.09` (`-20.4%`)
  - Interactive resize handles: `627` (unchanged behavior count), nested handle child nodes: `0`
  - `All -> Core` median: elapsed `411.2 ms` (`-19.2%`), longtask total `124 ms` (`-38.6%`)
  - `Core -> All` median: elapsed `944.5 ms` (`-4.3%`), longtask total `725 ms` (`-5.6%`)

- Observations:
  - This step provides the first large DOM reduction in the plan and a clear improvement in transition responsiveness.
  - The biggest gains are in `All -> Core`; `Core -> All` improves more modestly, suggesting section content mount still dominates that direction.

## Conclusion

- What improved:
  - Removed repeated nested resize-handle nodes without changing resize interaction behavior.
  - Lower DOM load and lower transition cost in both directions, with a significant reduction in `All -> Core`.
- What regressed (if any) + why it is acceptable:
  - No regressions observed in targeted and broader params/settings E2E suites.
- Follow-ups:
  - Proceed with step 4 (`nested connector helper node removal`) for additional row-chrome reduction.

## Raw Artifacts (local-only)

- `/tmp/all-settings-bench9-current-width-fix.json`
- `/tmp/all-settings-bench9-resize-handle-collapse-improved.json`

## Automated Perf Tests

- Playwright:
  - `frontend/tests/e2e/settings/settings-param-column-width-uniformity.spec.ts`
  - `frontend/tests/e2e/params/callable-params.spec.ts`
  - `frontend/tests/e2e/params/dict-kwargs.spec.ts`
  - `frontend/tests/e2e/params/param-label-focus-handoff.spec.ts`
  - `frontend/tests/e2e/params/param-nested-persistence-and-reorder.spec.ts`
  - `frontend/tests/e2e/params/param-type-error-affordance.spec.ts`
- Budgets/assertions added:
  - None in this step (existing guardrails + new resize-uniformity behavior checks).
