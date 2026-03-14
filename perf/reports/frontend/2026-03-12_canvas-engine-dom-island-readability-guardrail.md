# Canvas Engine DOM-Island Readability Guardrail

Date: `2026-03-12`
Branch: `frontend-performance-10`

## Goal

Verify that replacing the hard DOM-island zoom cutoff with a screen-space readability rule does not increase large-canvas DOM mounting pressure.

## Commands

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/CanvasEngineHost.test.tsx
./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-host.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-view-modes.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-dom-island-virtualization.perf.spec.ts
```

## New Coverage

- Host Vitest:
  - low-zoom mixed-size scenario mounts a large readable section and skips a default-sized section
- Playwright:
  - isolated project low-zoom mixed-size scenario
  - Settings route `All Settings` canvas-host visibility check

## Large-Canvas Guardrail Result

- Playwright status: `passed`
- Runtime: `45.4s`

```json
{
  "sectionCount": 300,
  "retentionCap": 96,
  "retentionMs": 280,
  "initialMetrics": {
    "rectCount": 301,
    "mountedDomIslands": 10,
    "retainedDomIslands": 0,
    "visibleDomIslands": 10,
    "hiddenDomIslands": 0,
    "canvasDomNodeCount": 717,
    "totalDomNodeCount": 1985
  },
  "postPanMetrics": {
    "rectCount": 301,
    "mountedDomIslands": 10,
    "retainedDomIslands": 0,
    "visibleDomIslands": 10,
    "hiddenDomIslands": 0,
    "canvasDomNodeCount": 717,
    "totalDomNodeCount": 1985
  },
  "postRetentionMetrics": {
    "rectCount": 301,
    "mountedDomIslands": 10,
    "retainedDomIslands": 0,
    "visibleDomIslands": 10,
    "hiddenDomIslands": 0,
    "canvasDomNodeCount": 717,
    "totalDomNodeCount": 1985
  }
}
```

## Live Settings Check

- Route: `/settings`
- View mode: `All Settings`
- Experimental host stats:
  - `rectCount: 43`
  - `visibleRectCount: 6`
  - `mountedDomIslands: 6`
  - `visibleIslands: 6`
  - `zoom: 0.758`

## Conclusion

The readability-based mount rule improves low-zoom visible-content parity without increasing the large-canvas DOM-island baseline measured by the existing stress guardrail.
