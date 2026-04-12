# Settings Graph Substrate Measured Size Precedence

Date: 2026-04-05
Area: frontend
Branch: `pixijs-graph`
Related prior slice: `perf/reports/frontend/2026-04-05_settings-graph-substrate-reactflow-mirror-rerender-isolation.md`

## Goal

Make the canary scene snapshot treat the shared live section-size registry as the authoritative visible size when it exists, with stored layout width and height only as fallback geometry.

## Code Paths

- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneSnapshot.ts`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneSnapshot.test.ts`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryBounds.test.ts`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryNodeSync.test.ts`

## Scenario

- Entry point:
  - worktree canary: `http://127.0.0.1:3076/settings`
  - read-only legacy reference: `http://127.0.0.1:3087/settings`
- Project/view: `settings`, `All Settings`
- Named target section: `rotaryParamCodeObjDefault`
- Browser + OS: Playwright Chromium headless, macOS
- Probe:
  - reused the existing normalized performance lane `settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary`
  - both surfaces cleared viewport state, ran the shared `fitView(...)` path, and executed the same deterministic wheel pan/zoom sequence

## Change

- Updated scene-size resolution so the shared measured size wins when the visible section registry already has a positive width and height.
- Kept persisted layout size as the fallback when no live measured size is available yet.
- Updated focused geometry tests so bounds and shared node internals now lock to the same measured scene snapshot.

## Before

- Worktree canary after React Flow mirror rerender isolation:
  - average frame duration: `16.63ms`
  - max frame duration: `33.3ms`
  - long tasks: `0`
  - root DOM nodes: `9515`
  - section DOM nodes: `132`

## After

- Legacy `main` rerun on the same lane:
  - average frame duration: `16.68ms`
  - max frame duration: `35.0ms`
  - long tasks: `0`
  - root DOM nodes: `8907`
  - section DOM nodes: `132`
- Worktree canary after preferring shared measured section size:
  - average frame duration: `16.24ms`
  - max frame duration: `18.7ms`
  - long tasks: `0`
  - root DOM nodes: `9515`
  - section DOM nodes: `132`
- Shared post-probe transform:
  - `x: -258.735`
  - `y: -8992.72`
  - `zoom: 1.18577`

## Conclusion

- What improved:
  - the canary scene snapshot, fit bounds, and node-internals sync now all resolve visible section size from the same live registry when it is available
  - the normalized live lane stayed healthy and slightly improved versus the prior canary rerun
- What did not change:
  - DOM footprint is unchanged, so this slice tightened geometry authority rather than reducing rendered surface area
- Visual confirmation:
  - Chrome DevTools MCP reused the existing worktree `3076/settings` and reference `3087/settings` tabs, verified `All Settings`, and found no gross graph-surface drift around `rotaryParamCodeObjDefault`

## Follow-up

- Continue the plan's geometry-authority/module-deepening frontier instead of reopening more viewport-only perf probes.
- Keep this same normalized `rotaryParamCodeObjDefault` lane as the regression gate for the next product slice.
