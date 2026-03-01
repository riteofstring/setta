# WebGL/WebGPU Scene-Graph Phase 0 Benchmark Suite Rebaseline

Date: 2026-03-04
Area: frontend
Branch/Commit: webgpu-scene-graph-impl (local)
Related PR: n/a

## Goal

Rebaseline phase-0 scene-graph measurements using a benchmark suite that is not settings-only:
- `Settings -> All Settings` stress benchmark,
- synthetic non-settings mixed-section large project benchmark.

## Code Paths Touched

- `frontend/tests/e2e/settings/scene-graph-benchmark-suite.spec.ts`
- `docs/plans/webgl-webgpu-scene-graph-plan.md`

## Scenario

- Browser/OS: Playwright Chromium on macOS (local run via `./scripts/run-playwright-e2e.sh`)
- Backends measured per scenario:
  - `dom` mode (`setta.sceneGraphRenderer.enabled=0`)
  - `auto` mode (`setta.sceneGraphRenderer.enabled=1`, `backend=auto`)
- Probe/capability labels during run:
  - `webgpuAvailable=false` (`adapter_unavailable`)
  - `webgl2Available=true`
  - `softwareFallbackDetected=true` (`webgl2_major_performance_caveat`)
  - `auto` therefore resolved to `webgl` for this environment.

## Measurement Method

- Playwright benchmark harness (`scene-graph-benchmark-suite.spec.ts`):
  - captures runtime perf labels (`readSceneGraphRendererPerfLabels`),
  - captures layer/root compatibility counters,
  - runs deterministic viewport sweeps with `/setViewport` pan/zoom updates,
  - reports per-step latency arrays + p50/p95.
- Synthetic benchmark project:
  - 64 generated sections (mixed impls: `Chart`, `Spreadsheet`, `TaskBoard`, `Browser`, `Image`, `Social`, `Draw`, `Chat`).

## Results

### Settings -> All Settings

- `dom` mode:
  - `resolvedBackend=dom`
  - `domNodeCount=9716`
  - `reactFlowNodeCount=42`
  - pan latency: `p50=32ms`, `p95=32ms`
  - zoom latency: `p50=31ms`, `p95=31ms`
- `auto` mode:
  - `resolvedBackend=webgl`
  - `domNodeCount=477`
  - `reactFlowNodeCount=0`
  - `sceneCompatibleSectionCount=42`, `forcedDomSectionCount=0`
  - pan latency: `p50=30ms`, `p95=30ms`
  - zoom latency: `p50=30ms`, `p95=32ms`

### Synthetic Mixed-Section (Non-Settings)

- `dom` mode:
  - `resolvedBackend=dom`
  - `domNodeCount=4715`
  - `reactFlowNodeCount=65`
  - pan latency: `p50=29ms`, `p95=30ms`
  - zoom latency: `p50=31ms`, `p95=31ms`
- `auto` mode:
  - `resolvedBackend=webgl`
  - `domNodeCount=1136`
  - `reactFlowNodeCount=8`
  - `sceneCompatibleSectionCount=57`, `domOnlySectionCount=8`, `forcedDomSectionCount=8`
  - pan latency: `p50=31ms`, `p95=31ms`
  - zoom latency: `p50=30ms`, `p95=30ms`
  - scene-only promotion parity check passed (click target promoted into DOM node).

## Conclusion

- The benchmark suite now includes both settings and non-settings large-project coverage.
- In this environment, `auto` consistently selected `webgl` and significantly reduced DOM node counts on both benchmark classes.
- Sweep latency medians were in the same range between modes, with no parity failures in automated checks.
- This is a benchmark-suite rebaseline step, not a default-on decision.

## Automated Perf Tests

- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/scene-graph-benchmark-suite.spec.ts`
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/rollout.test.ts`
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/runtime.test.ts src/sceneGraphRenderer/capabilities.test.ts src/sceneGraphRenderer/flags.test.ts`
