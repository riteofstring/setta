# Plugins Pane Runtime Summary + Capability Sort

Date: 2026-02-17
Area: frontend
Branch/Commit: working tree (uncommitted)
Related PR: N/A

## Goal

Reduce avoidable Plugins pane render-path work:
- remove UI coupling to internal runtime `loadGeneration`
- stop sorting capability arrays on every render of `CapabilityRow`

Code paths touched:
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/components/Panes/Overview/Overview.test.tsx`
- `frontend/tests/e2e/overview/plugins-pane.spec.ts`

## Scenario

- Entry point (URL/route/screen): project page -> `Overview > Plugins`
- Steps to reproduce (deterministic):
  - Open Plugins pane.
  - Read runtime summary row.
  - Exercise synthetic capability-sort loop in DevTools console.
- Data set / project used: local project created via UI; fixture plugins linked.
- Browser + OS: Chrome via CDP MCP on macOS.
- Notes:
  - The capability-sort metric uses a deterministic microbenchmark in page context to compare old vs new algorithm paths directly.

## Before (baseline)

- Measurement method (DevTools panels used, settings): DevTools console microbenchmark executed through CDP `evaluate_script`.
- Key metrics:
  - Benchmark shape: `entryCount=400`, `iterations=6000`
  - Before (sort every render equivalent): `107.6ms`
- Observations:
  - Repeated sorting dominates this hot loop even with moderate list size.

## After

- Key metrics:
  - Benchmark shape: `entryCount=400`, `iterations=6000`
  - After (memoized one-time sort equivalent): `0.1ms`
  - Relative speedup in this loop: `1076x`
- Observations:
  - Memoizing sorted capabilities removes almost all repeated sort cost in steady-state renders.
  - Plugins runtime summary now shows `mode` + `status` without exposing internal `generation` counter.

## Conclusion

- What improved:
  - Lower render-path CPU work for capability badges.
  - Cleaner runtime UI with less noisy internal metadata.
- What regressed (if any) + why it is acceptable:
  - None observed.
- Follow-ups:
  - If needed, capture deeper trace-based render metrics during very large plugin catalogs and frequent refresh loops.

## Raw Artifacts (local-only)

- `perf/artifacts/2026-02-17_plugins-pane_cdp.png`

## Automated Perf Tests

- Playwright spec(s): `frontend/tests/e2e/overview/plugins-pane.spec.ts`
- Vitest test(s) / bench(es): existing plugin runtime and overview tests updated/validated.
- Budgets/assertions added:
  - Functional assertion added that Plugins runtime UI does not include `generation=` text.

## Rerun (CDP Trace)

- Trace artifact: `perf/artifacts/2026-02-17_plugins-pane_trace.json`
- Captured interaction: clicked `Rescan` on Plugins pane runtime card.
- Reported metric (DevTools insight summary):
  - INP: `51ms`
  - CLS: `0.00`
- Observation:
  - Plugins pane interaction remained responsive after the runtime-summary + capability-sort changes.
