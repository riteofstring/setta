# GPU Flow Content Projection Runtime Refactor - After

Date: 2026-05-18
Area: frontend

## Goal

Restore browser-derived retained text-like visuals without putting viewport
pan, zoom, or retained section scroll back on the full retained content commit
path.

## Scenario

- Route: `/settings`, All Settings.
- Viewport: `1200x672`.
- Browser: local Chrome for Testing Canary through `./scripts/run-playwright-e2e.sh`.
- Scene: `46` nodes, `45` retained surfaces, `476` retained rows, with
  `color-picker`, `dropdown`, `nested`, `switch`, and `text-like` retained
  controls.
- Raw sample: `perf/reports/gpu-flow-content-projection-runtime-after-20260518.jsonl`.

## Before

The fail-first coverage reproduced the two observed regressions:

- Passive retained text-like rows were canvas-drawn approximations and failed
  CodeMirror visual parity.
- Viewport and retained-scroll projection frames performed retained/content
  work, including retained page frame and display transaction work.

## After

Large scene retained compositor sample:

| Gesture                         | Lane      |    p50 |     p95 |     p99 |     max | long task max | slow ratio |
| ------------------------------- | --------- | -----: | ------: | ------: | ------: | ------------: | ---------: |
| pan                             | ci-capped | 8.3 ms |  9.9 ms | 10.3 ms | 34.6 ms |          0 ms |      0.008 |
| zoom                            | ci-capped | 8.3 ms |  9.2 ms | 10.1 ms | 10.2 ms |          0 ms |          0 |
| retained-hover zoom             | ci-capped | 8.3 ms |  8.9 ms | 10.3 ms | 16.7 ms |          0 ms |          0 |
| retained scroll                 | ci-capped | 8.3 ms | 16.6 ms | 24.9 ms | 24.9 ms |          0 ms |      0.026 |
| scroll then retained-hover zoom | ci-capped | 8.3 ms | 16.6 ms | 33.3 ms | 33.4 ms |          0 ms |      0.037 |

The control RAF sample was 60 Hz-class for this run (`p50=16.6 ms`,
`p95=16.8 ms`), so these are not claimed as strict 120 Hz hardware results.
The strict lane remains selected only when both the control RAF cadence and the
delivered gesture cadence prove a high-refresh measurement path.

Visual continuity stayed clean across the large-scene captures:

- `highConfidencePlaceholder=false` for before, pan, zoom, retained-hover zoom,
  retained-scroll, and mixed captures.
- nonblank ratios stayed between `0.9769` and `0.9835`.
- no long tasks above `50 ms` were observed in any measured gesture.

All Settings transition/content-publish guardrail:

- row count reached `476`;
- no long tasks were recorded;
- final transition screenshot `highConfidencePlaceholder=false`;
- nonblank ratio `0.7076`.

Projection-frame guardrail:

- `34` pure `viewport` or `retained-scroll` projection frames sampled;
- `0` violating frames;
- sampled projection frames reported `frameMode="projection"` and `0 ms` for
  committed content publish, retained runtime frame, retained page frame,
  retained display transaction, retained maintenance, and passive upload work.

## Conclusion

Readable passive text-like values are browser DOM actors again, while
viewport/retained-scroll frames draw over committed content instead of creating
new retained content frames. The capped local runner still shows 60 Hz delivery
for native retained scroll, but the implementation now rejects 50 ms frame gaps
and long tasks and records enough phase diagnostics to distinguish projection
cost from content publish and maintenance work.

## Automated Perf Tests

- `frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts`
- `frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`
- `frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
- `frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts`
- `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`
- Full retained/GPU Settings shard: `55 passed`, `1` manual Chrome trace skipped.

## 2026-05-18 Contract Addendum

The committed text actor contract was tightened after the initial after report:

- text actor coverage proof is now a typed union covering `exact-live-dom`,
  `exact-snapshot`, `compatible-previous`, `blocked-awaiting-browser-visual`,
  and `true-hole`;
- text actor visual generation now includes the browser-rendered snapshot cache
  key revision, so value changes cannot keep a stale visual generation id;
- snapshot cache keys carry value, placeholder, disabled/error state,
  line/wrap/editor policy, CSS size, DPR, zoom bucket, theme/style/font/syntax
  generation fields, and measured layout mode;
- passive DOM-control actors declare visual-only accessibility, focus,
  pointer, and selection semantics;
- excess visible passive text actors are now classified into a bounded
  browser-rendered snapshot lane. Snapshot sources mount `DummyCodeMirror` DOM,
  use the canonical snapshot cache-key revision as the HTML texture content
  key, and publish committed text actors as `exact-snapshot` coverage instead
  of live DOM or canvas-drawn text;
- projection-only frames now assert that viewport/retained-scroll reasons do
  not perform upload, eviction, missing-source registration, or dirty-resource
  work.

Focused verification after this addendum:

- `pnpm -C frontend exec vitest run src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/GpuFlow/retainedDomControlSources.test.ts src/gpuFlow/GpuFlow/domControlPlane.test.ts`
  passed (`18` tests).
- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/retainedDomControlSources.test.ts src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx`
  passed (`57` tests).
- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts`
  passed (`2` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-dom-control-observed-regressions.spec.ts frontend/tests/e2e/settings/settings-retained-committed-surface-actor-regressions.spec.ts frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts`
  passed (`8` tests).
- `pnpm -C frontend exec vitest run src/gpuFlow` passed (`123` files, `802`
  tests).
- `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface`
  passed (`27` files, `163` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-params.spec.ts`
  passed (`2` tests), covering retained callable text editor activation outside
  the Settings surface.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow` passed (`6`
  tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings` passed (`55`
  tests, `1` manual Chrome trace skipped).
- `./scripts/quality/check.sh` passed after splitting the DOM-control viewport
  helpers out of the main plane file.
- CDP visual check passed for retained text-like DOM-control/snapshot
  projection on `/settings` at `1600x1400`: `exactCoverage=39`,
  `exactSnapshot=7`, `blocked=223`, `domControlHosts=32`, snapshot capture
  hosts behind canvas content with `z-index=-1`. Screenshot:
  `tmp/gpu-flow-retained-dom-control-snapshot-cdp-after.png`.
