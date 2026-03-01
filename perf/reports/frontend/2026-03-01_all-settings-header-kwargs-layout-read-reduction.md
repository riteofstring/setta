# All Settings Header/Kwargs Layout-Read Reduction

Date: 2026-03-01
Area: frontend
Branch/Commit: frontend-performance @ 63b78c14 (+ working tree)

## Goal

Reduce repeated layout/style reads in section height measurers (`SectionHeader`, `KwargsControls`) while preserving current sizing behavior.

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3054/settings`
- Steps to reproduce (keep deterministic): switch tabs `All Settings -> Core -> All Settings` repeatedly
- Data set / project used: `Settings` project, `All Settings` view
- Browser + OS: Chrome (via `chrome-devtools-mcp`) on macOS
- Notes (extensions, throttling, dev/prod build, etc): dev server, no CPU throttle

## Before (baseline)

- Measurement method:
  - CDP `evaluate_script` instrumentation around one `Core -> All Settings` transition (3-run sample, medians)
  - Wrapped `window.getComputedStyle`, `HTMLElement.offsetHeight`, and `Element.getBoundingClientRect` to count calls by callsite bucket
  - Captured tab-switch timing medians with 5-run loop (`PerformanceObserver` longtask + elapsed)

- Key metrics:
  - Layout-read counters (`Core -> All Settings`, 3-run median):
    - `getComputedStyle`: `333`
      - `SectionHeader`: `111`
      - `KwargsControls`: `111`
      - `GroupContainer`: `37`
      - `re-resizable`: `74`
    - `offsetHeight`: `270`
      - `SectionHeader`: `111`
      - `KwargsControls`: `111`
      - `Other`: `48`
    - `getBoundingClientRect`: `492`
      - `useViewportHelper`: `254`
      - `edgeHandles`: `222`
      - `Other`: `16`
  - Timing medians (5 runs):
    - `All Settings -> Core`: elapsed `666.5 ms`, long-task total `373 ms`
    - `Core -> All Settings`: elapsed `1428.9 ms`, long-task total `1170 ms`

## After

- Key metrics:
  - Layout-read counters (`Core -> All Settings`, 3-run median):
    - `getComputedStyle`: `259` (`-22.2%`)
      - `SectionHeader`: `74` (`-33.3%`)
      - `KwargsControls`: `74` (`-33.3%`)
      - `GroupContainer`: `37` (no change)
      - `re-resizable`: `74` (no change)
    - `offsetHeight`: `196` (`-27.4%`)
      - `SectionHeader`: `74` (`-33.3%`)
      - `KwargsControls`: `74` (`-33.3%`)
      - `Other`: `48` (no change)
    - `getBoundingClientRect`: `492` (no change)
  - Timing medians (5 runs):
    - `All Settings -> Core`: elapsed `644.0 ms`, long-task total `363 ms`
    - `Core -> All Settings`: elapsed `1407.1 ms`, long-task total `1158 ms`

- Observations:
  - The targeted callsites (`SectionHeader` and `KwargsControls`) both dropped by one-third for `getComputedStyle` and `offsetHeight`.
  - End-to-end gains are modest but consistently positive in this sample.

## Conclusion

- What improved:
  - Reduced repeated style/layout reads in two hot per-section measurers with no behavior changes in tested paths.
  - Slight top-line improvements in tab-switch elapsed and long-task medians.
- What regressed (if any) + why it is acceptable:
  - No regressions observed in this measurement pass.
- Follow-ups:
  - Complete Priority 3 by reducing repeated style reads in `GroupContainer` fixed-height measurement path.
  - Continue with Priority 4 viewport-origin caching and then automated perf guardrails.

## Raw Artifacts (local-only)

- Captured via inline CDP scripts (no trace file persisted for this pass).

## Automated Perf Tests

- Vitest:
  - `src/components/Section/heightMeasurements.test.ts`
  - `src/components/Section/Header/SectionHeader.test.tsx`
  - `src/state/actions/temporaryMiscState.test.ts`
  - `src/state/hooks/sectionSizes.integration.test.tsx`
