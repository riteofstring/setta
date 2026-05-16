# GPU Flow Atomic Retained Display Frame Audit - 2026-05-15

Status: implementation complete for the local checkout; true 120 Hz hardware verification is still outstanding.

## Satisfied

- Atomic desired/prepared/published retained display frame boundary exists.
- `renderHtmlSurfaceFrame` draws retained page visuals from the published frame.
- Published retained frames carry coverage proof and reject prepared frames with missing visible coverage.
- Fallback pages are gated through `canDrawRetainedFallbackPage`.
- Wheel ownership reads the published retained runtime frame.
- Passive source identity no longer changes when active text-like snapshots are omitted.
- Previous published pages are protected from eviction while a replacement frame is prepared.
- Active native island attach, detach, and coverage-blocked commit-detach publication transactions are owned by retained display-frame diagnostics.
- Published retained frames report scroll visual lag in CSS pixels, milliseconds, pixels/ms, held frame counts, and held-without-visible-preparation-progress counts.
- Retained texture budgeting now has explicit visible, active-island, near-viewport, offscreen-prefetch, and hard-max buckets; offscreen prefetch is enforced by the upload scheduler.
- Large-scene pan, zoom, retained-hover zoom, retained section scroll, and combined scroll-then-zoom samples currently report no interaction long tasks over `50ms`.
- The documented `pnpm -C frontend exec vitest run src/gpuFlow` command now passes after moving helper-only files out of the `*.test.ts` pattern.
- The documented compatibility matrix command passes.
- GPU Flow probe helper tests pass under Vitest. The plan's Playwright-wrapper command is invalid for these `*.test.ts` files in this checkout and reports no Playwright tests.
- `./scripts/quality/check.sh` passes.
- Required user-visible regression names are present as E2E test names or named large-scene assertion steps.
- Baseline and after reports exist under `perf/reports/`.

## Remaining Gaps

- This is a refresh-aware local run, not a confirmed true 120 Hz hardware run.

## Latest Evidence

- Large-scene sample: `perf/reports/gpu-flow-atomic-retained-display-frame-after-20260515.jsonl`
- Latest representative metrics:
  - Pan frame p95 `8.9ms`, long-task max `0ms`
  - Viewport zoom frame p95 `8.9ms`, long-task max `0ms`
  - Retained-hover zoom frame p95 `9.2ms`, long-task max `0ms`
  - Retained scroll frame p95 `9.3ms`, long-task max `0ms`
  - Scroll then retained-hover zoom frame p95 `9.2ms`, long-task max `0ms`
