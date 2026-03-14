# Canvas Engine DOM-Island Virtualization Guardrail

Date: `2026-03-12`
Branch: `frontend-performance-10`

## Goal

Record the first large-canvas guardrail run for the experimental canvas-engine host after the top-level interaction parity slices.

## Command

```bash
./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/canvas-engine-dom-island-virtualization.perf.spec.ts
```

## Scenario

- Experimental canvas-engine host enabled via `useCanvasEngineV1`
- Isolated project
- Seed `300` new top-level sections in a deterministic grid
- Verify that DOM-island mount/retention counts remain bounded during initial view, after a long pan, and after the retention window expires

## Result

- Playwright status: `passed`
- Runtime: `44.5s`

## Metrics

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

## Notes

- `rectCount` was `301` because the isolated project already had one top-level rect before the stress grid was added.
- The important structural result is that the canvas subtree stayed at `10` mounted DOM islands instead of scaling toward the full rect count.
- This run is a guardrail baseline for future canvas-engine slices, especially nested/general project coverage work.
