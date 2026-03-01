# All Settings Temporary Height Write Batching

Date: 2026-03-01
Area: frontend
Branch/Commit: frontend-performance @ 689a182b (+ working tree)

## Goal

Reduce temporary height store churn during `Core -> All Settings` without changing user-facing section layout behavior.

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3054/settings`
- Steps to reproduce (keep deterministic): switch tabs `All Settings -> Core -> All Settings` repeatedly
- Data set / project used: `Settings` project, `All Settings` view
- Browser + OS: Chrome (via `chrome-devtools-mcp`) on macOS
- Notes (extensions, throttling, dev/prod build, etc): dev server, no CPU throttle

## Before (baseline)

- Measurement method:
  - CDP `evaluate_script` instrumentation around one `Core -> All Settings` transition
  - Wrapped `useTemporaryMiscState.setState` to count writes by callsite
  - Captured timing/long-task medians with 5-run tab-switch loop (`PerformanceObserver` longtask + elapsed)

- Key metrics:
  - Temporary store writes per transition: `407`
    - `SectionHeader.tsx`: `148`
    - `KwargsControls.tsx`: `148`
    - `GroupContainer.tsx`: `111`
  - Timing medians (5 runs):
    - `All Settings -> Core`: elapsed `671.4 ms`, long-task total `390 ms`
    - `Core -> All Settings`: elapsed `1454.6 ms`, long-task total `1163 ms`

## After

- Key metrics:
  - Temporary store `setState` calls per transition: `3` median (`-99.3%`)
  - Temporary height key writes inside those batched calls: `222` median (`-45.5%` vs 407)
    - `section-header-height-*`: `74`
    - `kwargs-controls-height-*`: `74`
    - `params-fixed-height-*`: `74`
  - Timing medians (5 runs):
    - `All Settings -> Core`: elapsed `664 ms`, long-task total `392 ms`
    - `Core -> All Settings`: elapsed `1437.1 ms`, long-task total `1205 ms`

- Observations:
  - Primary target improved strongly: store commit churn collapsed from hundreds of calls to a few batched commits.
  - End-to-end long-task timing remained in the same band; no clear improvement in this step alone.

## Conclusion

- What improved:
  - Significant reduction in temporary state commit churn for measured height updates.
  - Behavior-preserving write coalescing with no test-detected UX regressions.
- What regressed (if any) + why it is acceptable:
  - `Core -> All Settings` long-task median was slightly higher in this sample (`1163 -> 1205 ms`, ~`+3.6%`), but overall elapsed remained similar and this optimization still removes a major internal hotspot needed for follow-up work.
- Follow-ups:
  - Continue with layout-read reductions in `SectionHeader`, `KwargsControls`, and `GroupContainer`.
  - Add automated perf guardrails so write churn and long-task budgets are checked together.

## Raw Artifacts (local-only)

- Captured via inline CDP scripts (no trace file persisted for this pass).

## Automated Perf Tests

- Vitest:
  - `src/state/actions/temporaryMiscState.test.ts`
  - `src/components/Params/GroupContainer.test.tsx`
  - `src/state/hooks/sectionSizes.integration.test.tsx`
  - `src/components/Section/Header/SectionHeader.test.tsx`
