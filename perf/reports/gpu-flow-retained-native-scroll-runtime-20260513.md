# GPU Flow Retained Native Scroll Runtime

Date: 2026-05-13
Area: frontend
Branch/Commit: diagnostics/retained-text-recording-20260513 @ 97e979f40
Related PR: n/a

## Goal

Make retained-content settings section scrolling use a browser-owned native
scroll source while preserving GPU retained canvas rendering, active DOM island
alignment, custom retained scrollbars, and viewport pan/zoom ownership.

## Scenario

- Entry point: `/settings`
- Steps to reproduce: open Settings, switch to All Settings, center
  `settings-section__shortcuts:param-content:unpinned`, run deterministic
  small-to-large wheel bursts over the retained section.
- Data set / project used: local settings scene with retained param content.
- Browser + OS: latest local Playwright Chromium on macOS.
- Notes: native scroll source is a transparent overlay above the canvas and
  below active DOM islands; its native scrollbar is hidden because Setta keeps
  the retained canvas scrollbar visual. Pointer capture stays on the GPU-flow
  container, so retained controls continue to hit-test by coordinate.

## Before (baseline)

- Measurement method: latest Chrome recording `recording-20260513-174017`
  plus the retained section scroll performance probe.
- Key metrics:
  - 281 `gpu-flow-retained-content-scroll-flush` events.
  - 266 / 281 flushes applied `deltaOffset.y === totalWheelDeltaY`.
  - 15 remaining flushes were scroll-bound clamps.
  - Scroll commit work: p50 `0.1ms`, p95 `0.3ms`, max `2.2ms`.
  - Flush latency: p50 `4.7ms`, p95 `7.7ms`, max `15.8ms`.
  - Each flush contained at most one coalesced wheel event.
- Observations: commit cost was already cheap, but visual scroll position was
  directly derived from raw wheel packets and retained scene/page maintenance.

## After

- Key metrics:
  - Added native-source Playwright probe in
    `frontend/tests/e2e/settings/settings-retained-native-scroll-runtime.spec.ts`.
  - Updated the retained texture-backlog Playwright probe in
    `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`.
  - Focused Vitest verification passed: 6 files, 35 tests.
  - Playwright retained native scroll probe passed against a live app session:
    native source `scrollTop` advanced to `944`, page scroll did not leak,
    p50 frame interval `8.3ms`, p95 `11.6ms`, max `16.9ms`, and no long task
    over `50ms` occurred during the measured burst.
  - Playwright retained texture-backlog probe passed against a live app session:
    no retained scrollbar texture uploads, no unexpected retained surface
    uploads, max dirty backlog `0`, and worst sampled frame interval `9.3ms`.
  - CDP visual check passed with the same browser feature flags: 21 native
    retained scroll sources were present, the `shortcuts` retained source
    advanced from `scrollTop 0` to `360`, retained debug rows changed from
    `advancedSearchShortcut` to `frozenTooltipCopyShortcut`, and page scroll
    remained `0`.
  - Chrome repro recording captured one retained settings scroll session:
    `recording-20260513-191702`, with 304 events, 11 wheel events, 6 scroll
    events, 50 performance events, and 176 performance records.
  - `./scripts/quality/check.sh` passed.
  - Filtered frontend typecheck found no errors in changed GPU-flow retained
    scroll files.
- Observations:
  - Plain retained wheel input now reaches
    `[data-gpu-flow-retained-scroll-source]` and updates `scrollTop`.
  - Scrollbar, keyboard navigation, programmatic reveal, and drag auto-scroll
    write the native source position instead of committing independent retained
    scroll maps.
  - Scroll frames apply runtime scroll state before retained page maintenance.
  - DOM islands resolve retained positions from the live runtime scene during
    overlay sync instead of relying on scroll-time island rect mutation.

## Conclusion

- What improved: retained scrolling has one canonical live source,
  `scrollTop`/`scrollLeft`, and the visual frame path samples it before page
  maintenance.
- What regressed: repository-wide `pnpm -C frontend run typecheck` still has
  unrelated pre-existing failures outside the changed retained-scroll files.
- Follow-ups: none required for this migration pass.

## Raw Artifacts (local-only)

- Chrome repro recording:
  `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260513-191702`

## Automated Perf Tests

- Playwright spec:
  `frontend/tests/e2e/settings/settings-retained-native-scroll-runtime.spec.ts`,
  `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`
- Vitest specs:
  `frontend/src/gpuFlow/GpuFlow/retainedContentScrollSourceLayer.test.tsx`,
  `frontend/src/gpuFlow/interactions/panZoom.test.ts`,
  `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx`,
  `frontend/src/gpuFlow/retainedContentRuntimeState.test.ts`,
  `frontend/src/gpuFlow/retainedContentScroll.test.ts`,
  `frontend/src/gpuFlow/GpuFlow/flowSurface.test.tsx`
- Budgets/assertions added: native source scroll sample count, page scroll
  leakage, retained debug-row visual movement, p95/max frame interval, long task
  count, monotonic visual movement, catch-up jump bounds, retained texture
  backlog, and retained scrollbar upload absence.
