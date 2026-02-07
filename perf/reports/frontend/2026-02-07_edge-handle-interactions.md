# Edge Handle Interactions (Hover + Minimize)

Date: 2026-02-07
Area: frontend
Branch/Commit: style-updates-13-nodes @ 761eb2a1af6fac7f904f0b533ed9216e9ad0f1e9 (local changes)

## Goal

- Keep agentic edge handles lightweight during hover-in/hover-out and avoid \"stuck\" intermediate opacity states.
- Ensure minimizing a callable section with data-edge ports does not scale poorly with number of ports (avoid repeated layout reads).

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3060/zebra_skating`
- Steps to reproduce:
  1. Hover a section to show agentic edge handles, then leave hover quickly.
  2. Click a callable section minimize button (collapse) then click again (expand).
- Data set / project used: `zebra_skating`
- Browser + OS: Chrome (DevTools MCP), macOS (local machine)
- Notes: no throttling

## Before (baseline)

- Measurement method: DevTools Performance trace via `chrome-devtools-mcp` (`performance_start_trace` / `performance_stop_trace`)
- Observations:
  - Forced reflow insight reported total reflow time: 849 ms.
- Raw artifact:
  - `perf/artifacts/2026-02-07_minimize-edge-handles.trace.json.gz`

## After

- Observations:
  - Forced reflow insight reported total reflow time: 515 ms (same scenario + method).
- Raw artifact:
  - `perf/artifacts/2026-02-07_minimize-edge-handles_batch.trace.json.gz`

## Conclusion

- The minimized data-edge handle implementation now batches edge-handle registration per side, so a minimized callable with many ports does not perform `getBoundingClientRect()` once per port.
- Agentic handles gate hit-testing (`pointer-events`) behind hover/connected visibility, reducing the chance of hover-out leaving handles in a stale intermediate state.

## Code Paths Touched

- `frontend/src/forks/xyflow/core/styles/style.css`
- `frontend/src/state/actions/edgeHandles.ts`
- `frontend/src/components/Section/Container/MinimizedDataEdgeHandles.tsx`

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/sections/agentic-edge-handle-hover-fade.spec.ts`

## Rerun (After Further Batching)

- Observations:
  - Forced reflow insight reported total reflow time: 429 ms.
- Raw artifact:
  - `perf/artifacts/2026-02-07_minimize-edge-handles_batch2.trace.json.gz`
