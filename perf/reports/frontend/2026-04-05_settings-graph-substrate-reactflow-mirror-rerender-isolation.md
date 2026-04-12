# Settings Graph Substrate React Flow Mirror Rerender Isolation

Date: 2026-04-05
Area: frontend
Branch: `pixijs-graph`
Related baseline: `perf/reports/frontend/2026-04-05_settings-graph-substrate-normal-zoom-baseline.md`
Related prior slice: `perf/reports/frontend/2026-04-05_settings-graph-substrate-section-layer-rerender-isolation.md`

## Goal

Stop the canary from subscribing in render to the same React Flow transform it mirrors out during local pan/zoom, so viewport ticks no longer add a second root rerender path on top of the local viewport-owner update.

## Code Paths

- `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`

## Scenario

- Entry point:
  - worktree canary: `http://127.0.0.1:3076/settings`
  - read-only legacy reference: `http://127.0.0.1:3087/settings`
- Project/view: `settings`, `All Settings`
- Named target section: `rotaryParamCodeObjDefault`
- Browser + OS: Playwright Chromium headless, macOS
- Probe:
  - reused the existing normalized performance lane `settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary`
  - both surfaces clear viewport state, run the shared `fitView(...)` path, and execute the same deterministic wheel pan/zoom sequence

## Change

- Removed the canary component's render-time `useReactFlow(state.transform)` subscription.
- Moved React Flow transform seeding/following into the viewport runtime so:
  - the runtime still restores an existing non-fallback store viewport on mount
  - shared/backend-owned viewport updates still flow through
  - local viewport ownership ignores mirrored React Flow transform writes instead of rerendering the canary root for them
- Added focused jsdom coverage for:
  - restoring the initial React Flow viewport when no shared backend viewport exists
  - ignoring mirrored React Flow transform updates while the local viewport owner is active

## Before

- Worktree canary after section-layer isolation from `2026-04-05_settings-graph-substrate-section-layer-rerender-isolation.md`:
  - average frame duration: `16.62ms`
  - max frame duration: `33.3ms`
  - long tasks: `0`
  - root DOM nodes: `9515`
  - section DOM nodes: `132`

## After

- Legacy `main` rerun on the same lane:
  - average frame duration: `17.01ms`
  - max frame duration: `50.0ms`
  - long tasks: `1` (`56ms`)
  - root DOM nodes: `8907`
  - section DOM nodes: `132`
- Worktree canary after removing the mirrored transform rerender path:
  - average frame duration: `16.63ms`
  - max frame duration: `33.3ms`
  - long tasks: `0`
  - root DOM nodes: `9515`
  - section DOM nodes: `132`
- Shared post-probe transform:
  - `x: -258.735`
  - `y: -8992.72`
  - `zoom: 1.18577`

## Conclusion

- What improved:
  - the canary no longer listens in render to its own mirrored React Flow transform updates
  - the new guard test locks that duplicate-rerender path down so later viewport work does not accidentally reintroduce it
  - the normalized live lane stayed healthy: `0` canary long tasks and the same attached post-state as the prior measured slice
- What did not materially change:
  - the coarse lane metrics stayed effectively flat versus the prior worktree run (`16.62ms` to `16.63ms` average, same `33.3ms` max)
  - DOM footprint is unchanged, so this slice only removes redundant viewport-owner rerender work; it does not shrink the rendered surface
- Visual confirmation:
  - pending the required fresh-context Chrome DevTools MCP compare after the worktree lifecycle restart

## Follow-up

- The next measured hotspot should stay on the same `rotaryParamCodeObjDefault` lane and target the remaining viewport/root presentation path only if a fresh trace or probe reopens it.
- Otherwise, return to the plan's geometry-authority/module-deepening frontier and keep this lane as regression coverage.
