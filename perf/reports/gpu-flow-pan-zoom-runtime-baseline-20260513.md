# GPU Flow Pan/Zoom Runtime Baseline

Date: 2026-05-13
Area: frontend
Branch/Commit: diagnostics/retained-text-recording-20260513 @ 34aebdecf
Related PR: n/a

## Goal

Capture the retained-content-heavy settings pan/zoom problem before moving the viewport hot path into a GPU-flow runtime. The baseline checks whether interaction frames are blocked by draw/upload work or by public viewport state fanout.

## Scenario

- Entry point: `/settings`, All Settings GPU-flow view.
- Steps: reproduce the latest Chrome recording, run dense trackpad-like wheel zoom and scroll-pan over the canvas, and inspect GPU-flow frame diagnostics around wheel events.
- Data set / project used: local settings scene with retained text-like rows.
- Browser + OS: Chromium via local Chrome recording on macOS arm64.
- Notes: the recording included broad app-state diagnostics, so absolute frame gaps are likely amplified. The distribution still captures the blocking shape.

## Before (baseline)

- Measurement method: Chrome recording `recording-20260513-115850` plus GPU-flow performance diagnostics.
- Wheel events: 1,487 events over about 36.6 seconds.
- Wheel-associated frame gaps: 47.
- Frame interval distribution around wheel events: p50 about 50 ms, p95 about 66.7 ms, max about 241.7 ms.
- GPU-flow `wheel-zoom` frame time: average about 2.4 ms, max about 8.8 ms.
- GPU-flow `pan-scroll` viewport frame time: average about 3.5 ms.
- Active `wheel-zoom` and `pan-scroll` frames reported zero retained texture uploads.
- Visual state: retained visuals remained drawable in the recording, but interaction cadence was visibly behind dense wheel input.
- Long tasks: the recording showed wheel-associated gaps well above the 50 ms user-visible budget; exact long-task accounting is recording-tool dependent because the capture serialized large diagnostics.

## Baseline Interpretation

The draw and upload path is not the primary bottleneck during active viewport movement. The slow shape comes from immediate public viewport store mutation and subscriber/diagnostic fanout competing with the frame loop for every wheel tick.

The new Playwright guardrail in `frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts` is expected to fail on this baseline architecture because it asserts dense All Settings pan/zoom frame cadence, native-scroll prevention, visible retained rows, and active editor overlay alignment while the old implementation still routes wheel and pan through synchronous public viewport updates.

## Raw Artifacts

- Latest Chrome recording: `recording-20260513-115850`.
- Baseline source: `docs/plans/gpu-flow-pan-zoom-runtime-refactor-plan.md`.

## Automated Perf Tests

- Playwright spec added for the refactor: `frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts`.
- Budgets targeted by the plan: p95 frame interval <= 34 ms, max frame interval <= 50 ms after warmup, and no measured long task > 50 ms.
- Note: the baseline recording was captured before the runtime refactor. I did not reset this worktree to rerun the new spec against the pre-change implementation.
