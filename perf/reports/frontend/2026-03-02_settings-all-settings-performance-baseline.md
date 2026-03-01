# Settings All Settings Performance Baseline Harness

Date: 2026-03-02
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ c6bc442b (with local changes)
Code paths touched:
- `frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`

## Goal

Establish a reproducible baseline for fundamental browser interaction cost in the Settings project `All Settings` view before implementing large architectural optimizations.

## Scenario

- Entry point: `/settings` -> `All Settings`
- Test harness behavior:
  1. Wait for React Flow renderer and all top-level settings nodes.
  2. Fit view.
  3. Measure scripted pan throughput (wheel events).
  4. Measure scripted zoom throughput (ctrl+wheel events).
  5. Measure interaction start hitch and stop hitch.
  6. Measure per-keystroke cost on a visible section `Filter` input.
  7. Record DOM complexity counters.
- Data set: temporary seeded e2e workspace from `run-playwright-e2e.sh`.
- Browser: Playwright Chromium (no explicit CPU/network throttling).

## Measurement Method

- Command:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- Test status:
  - `1 passed (33.6s)`
- Metrics source:
  - In-page measurements emitted by the spec via `console.info` and JSON test attachment.

## Baseline Metrics

- Throughput:
  - `panFps`: `37.7`
  - `zoomFps`: `35.0`
- Start hitch:
  - `avgMs`: `4.12`
  - `p95Ms`: `4.50`
  - `worstMs`: `4.80`
- Stop hitch:
  - `avgMs`: `5.05`
  - `p95Ms`: `8.20`
  - `worstMs`: `9.30`
- Typing latency (section `Filter` input):
  - `avgFrameMs`: `164.91`
  - `p95FrameMs`: `204.80`
  - `worstFrameMs`: `252.60`
  - `samples`: `9`
- DOM:
  - `totalNodes`: `9715`
  - `topLevelSectionCount`: `42`
  - `visibleSectionCount`: `42`
  - `iconLikeNodeCount`: `549`

## Observations

- Pan/zoom throughput is in the mid-30 FPS range in this baseline scenario, which is materially below smooth 60 FPS interaction.
- Start/stop hitch metrics are comparatively low in this scripted harness, so throughput and steady-state workload appear to be the dominant bottleneck here.
- Typing in a visible section filter shows large per-keystroke frame cost, indicating significant non-pan interaction overhead in the same view.

## Automated Perf Guardrails

- Playwright spec:
  - `frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- Current assertions are sanity guards (node count, visible sections, non-zero throughput/samples) to keep the harness stable while collecting baseline data.
