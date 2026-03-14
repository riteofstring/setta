# Canvas Engine Always-Live DOM Benchmark Plan

## Goal

Measure the current custom canvas engine with live top-level section contents
mounted at all times instead of the sparse DOM-island policy.

## Problem

- The current experimental engine keeps only a sparse set of top-level DOM
  islands mounted.
- That is the core optimization under discussion.
- To test whether the custom engine still helps when section contents stay live
  all the time, we need a direct experiment on the same branch.

## Scope

1. Add an explicit local-storage experiment flag for always-live engine DOM.
2. When enabled:
   - mount all top-level section DOM islands all the time
   - leave the current default sparse policy untouched
3. Add focused host/unit coverage for the mount override and persisted
   local-storage merge behavior.
4. Record before/after pan/zoom measurements on Settings `All Settings`.

## Verification

- Vitest:
  - `CanvasEngineHost.test.tsx`
  - `localStorage.test.ts`
- DevTools/browser-side pan/zoom measurement on live Settings
- Append results under `perf/reports/frontend/`

## Non-goals

- Changing the default canvas-engine behavior
- Replacing the sparse DOM-island policy
- Treating this experiment as a production recommendation before measurement
