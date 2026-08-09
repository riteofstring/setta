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

## Update (Safe Hover Bridge + Colors)

- Goal:
  - Make agentic handles easy to "catch" when they render outside the section by
    providing a trapezoidal safe hover bridge that keeps them visible while the
    cursor moves from the node to the handle.
  - Improve light/dark contrast of the handle blue while keeping Tailwind
    palette alignment (light: `blue-600`, dark: `blue-500`).
- Measurement method: DevTools Performance trace via `chrome-devtools-mcp`
  (`performance_start_trace` / `performance_stop_trace`)
- Scenario:
  1. Hover a section long enough to enter the exit-animation path.
  2. Move cursor towards the left/right handle area and back (safe-zone should
     keep handles visible, without thrashing).
- Observations:
  - Forced reflow insight total reflow time: 137 ms (trace includes the broader
    app; this interaction did not introduce additional obvious layout thrash).
- Raw artifact:
  - `perf/artifacts/2026-02-07_agentic-handle-hover-safe-zone.trace.json.gz`

## Update (Bigger Dots + Extra Gap)

- Change:
  - Agentic handle size: 14px -> 16px (output dot: 10px -> 12px)
  - Gap from section edge: 6px -> 8px
  - Safe-zone overhang: 12px -> 16px (safe zone now fully covers the left handle)
- Measurement method: DevTools Performance trace via `chrome-devtools-mcp`
  (`performance_start_trace` / `performance_stop_trace`)
- Scenario:
  1. Hover multiple sections in quick succession (skim hover + exit).
  2. Move cursor from node body towards left/right handles (safe-zone path).
- Observations:
  - No DevTools insight warnings were emitted for this trace (NO_NAVIGATION set).
- Raw artifact:
  - `perf/artifacts/2026-02-07_agentic-handle-hover-safe-zone-v3.trace.json.gz`
- Visual snapshots:
  - `perf/artifacts/2026-02-07_agentic-handles-hover-light-v3.png`
  - `perf/artifacts/2026-02-07_agentic-handles-hover-dark-v3.png`

## Update (Extra Gap +2)

- Change:
  - Gap from section edge: 8px -> 10px
- Measurement method: DevTools Performance trace via `chrome-devtools-mcp`
  (`performance_start_trace` / `performance_stop_trace`)
- Scenario:
  1. Hover multiple sections in quick succession (skim hover + exit).
  2. Toggle agentic connectors/wires off/on, then args connectors/wires off/on.
- Observations:
  - Forced reflow insight total reflow time: 167 ms (trace includes broader app
    work; this interaction did not introduce additional obvious layout thrash).
- Raw artifact:
  - `perf/artifacts/2026-02-07_agentic-handle-hover-safe-zone-v4.trace.json.gz`

## Update (Handle Size 18 + Gap 12)

- Change:
  - Agentic handle size: 16px -> 18px (output dot: 12px -> 14px)
  - Gap from section edge: 10px -> 12px
  - Safe-zone overhang now scales with handle size (covers the handle even after size changes)
- Measurement method: DevTools Performance trace via `chrome-devtools-mcp`
  (`performance_start_trace` / `performance_stop_trace`)
- Scenario:
  1. Hover multiple sections in quick succession (skim hover + exit).
  2. Toggle agentic connectors/wires off/on, then args connectors/wires off/on.
- Observations:
  - Forced reflow insight total reflow time: 35 ms (no top-level forced reflow
    functions identified in this trace).
- Raw artifact:
  - `perf/artifacts/2026-02-07_agentic-handle-hover-safe-zone-v6.trace.json.gz`
- Visual snapshots:
  - `perf/artifacts/2026-02-07_agentic-handles-hover-light-v5.png`
  - `perf/artifacts/2026-02-07_agentic-handles-hover-dark-v5.png`
