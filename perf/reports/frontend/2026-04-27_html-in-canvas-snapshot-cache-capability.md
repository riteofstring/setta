# HTML-in-Canvas Snapshot Cache Capability Probe

Date: 2026-04-27
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow working tree
Related PR: n/a

## Goal

Check whether the current Playwright browser can measure a real `ElementImage` snapshot-cache path for CanvasFlow nodes.

## Method

- Browser: Playwright Chrome, `HeadlessChrome/147.0.0.0`.
- Flags tested:
  - `--enable-blink-features=CanvasDrawElement`
  - `--enable-blink-features=CanvasDrawElement --enable-experimental-web-platform-features`
- DOM probe: `<canvas layoutsubtree><div>hi</div></canvas>`.
- App harness probe: `SETTA_CANVASFLOW_PERF_VARIANTS=default,snapshot-cache` against Settings project All Settings view.

## Result

| Probe | Result |
| :--- | :--- |
| `CanvasRenderingContext2D.drawElementImage` | `function` |
| `HTMLCanvasElement.requestPaint` | `function` |
| `HTMLCanvasElement.captureElementImage` | `undefined` |
| `HTMLCanvasElement.prototype.captureElementImage` | `undefined` |
| `WebGLRenderingContext.texElementImage2D` | `function` |

The explicit `snapshot-cache` app-harness run failed at the support assertion because `captureElementImage` was unavailable. Adding `--enable-experimental-web-platform-features` did not expose it.

## Decision

- Keep `snapshot-cache` as an explicit perf variant only; do not include it in the default isolation matrix.
- The 2D `ElementImage` cache path is unit-tested and wired behind the perf flag, but cannot be measured with this browser build.
- The next measurable cache-like path is WebGL texture upload through `texElementImage2D`, not `captureElementImage`.

## Verification

- Focused unit test: `pnpm -C frontend exec vitest run src/canvasflow/canvasFlowPaint.test.ts`.
- Failed app-harness proof: `SETTA_CANVASFLOW_PERF=1 SETTA_CANVASFLOW_PERF_TARGET=settings-all SETTA_CANVASFLOW_PERF_VARIANTS=default,snapshot-cache SETTA_CANVASFLOW_PERF_STEPS=36 SETTA_CANVASFLOW_PERF_START_ZOOM=0.1 ./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts`.

