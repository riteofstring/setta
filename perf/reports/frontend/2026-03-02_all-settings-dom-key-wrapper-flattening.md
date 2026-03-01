# All Settings DOM Key-Wrapper Flattening

Date: 2026-03-02
Area: frontend
Branch/Commit: frontend-performance @ c581b4ae (+ working tree)

## Goal

Remove repeated non-nested param-row key wrapper nodes in `Settings -> All Settings` while preserving current interaction UX.

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3054/settings`
- Steps to reproduce (keep deterministic): open `All Settings`; benchmark tab switches `All Settings -> Core -> All Settings`
- Data set / project used: `Settings` project
- Browser + OS: Chromium (Playwright + CDP) on macOS
- Notes (extensions, throttling, dev/prod build, etc): dev server, no CPU throttle

## Before (baseline)

- Measurement method:
  - DOM counts via CDP `evaluate_script`
  - 9-run tab-switch benchmark harness (`warmup=2`) with `PerformanceObserver` longtask metrics
- Key metrics:
  - Total DOM elements: `9715`
  - Param rows (`[data-param-row="true"]`): `697`
  - Avg param-row subtree size: `15.35`
  - Non-nested `.section-key` wrappers: `627`
  - `All -> Core` median: elapsed `446.4 ms`, longtask total `116 ms`
  - `Core -> All` median: elapsed `1044.1 ms`, longtask total `819 ms`

## After

- Key metrics:
  - Total DOM elements: `9088` (`-6.5%`)
  - Param rows (`[data-param-row="true"]`): `697` (unchanged)
  - Avg param-row subtree size: `13.93` (`-9.3%`)
  - Non-nested `.section-key` wrappers: `0` (`-627`)
  - `All -> Core` median: elapsed `421.6 ms` (`-5.6%`), longtask total `114 ms` (`-1.7%`)
  - `Core -> All` median: elapsed `1039.4 ms` (`-0.5%`), longtask total `817 ms` (`-0.2%`)

- Observations:
  - This step gives a clear DOM-size reduction and a measurable improvement in the lighter tab direction (`All -> Core`).
  - The heavier direction (`Core -> All`) changes only slightly, indicating the largest remaining cost is still full section-body/content mount work.

## Conclusion

- What improved:
  - Removed `627` repeated wrapper nodes and lowered average param-row subtree size.
  - Kept interaction behavior intact in focused params UX regression tests.
- What regressed (if any) + why it is acceptable:
  - No regressions observed in the tested paths.
- Follow-ups:
  - Continue with plan step 3 (resize-handle markup collapse) for additional DOM reduction.

## Raw Artifacts (local-only)

- `/tmp/all-settings-bench9-5dca5073.json`
- `/tmp/all-settings-bench9-wrapper-flatten.json`

## Automated Perf Tests

- Playwright:
  - `frontend/tests/e2e/params/callable-params.spec.ts`
  - `frontend/tests/e2e/params/dict-kwargs.spec.ts`
  - `frontend/tests/e2e/params/param-label-focus-handoff.spec.ts`
  - `frontend/tests/e2e/params/param-nested-persistence-and-reorder.spec.ts`
  - `frontend/tests/e2e/params/param-type-error-affordance.spec.ts`
- Budgets/assertions added:
  - None in this step (existing UX/perf guardrails reused).
