# Settings Graph Substrate Section-Layer Rerender Isolation

Date: 2026-04-05
Area: frontend
Branch: `pixijs-graph`
Related baseline: `perf/reports/frontend/2026-04-05_settings-graph-substrate-normal-zoom-baseline.md`

## Goal

Reduce canary-side presentation work on the normalized `rotaryParamCodeObjDefault` `All Settings` lane by preventing viewport-only pan/zoom updates from remapping the entire section-wrapper subtree on every tick.

## Code Paths

- `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx`

## Scenario

- Entry point:
  - worktree canary: `http://127.0.0.1:3076/settings`
  - read-only legacy reference: `http://127.0.0.1:3087/settings`
- Project/view: `settings`, `All Settings`
- Named target section: `rotaryParamCodeObjDefault`
- Browser + OS: Playwright Chromium headless, macOS
- Probe:
  - reused the existing normalized performance lane `settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary`
  - both surfaces clear viewport state, run the shared `fitView(...)` path, and then execute the same deterministic wheel pan/zoom sequence

## Change

- Extracted the canary section-wrapper render tree into `SettingsGraphSubstrateCanarySectionsLayer`.
- Memoized that layer so viewport-only rerenders now update the parent viewport transform without remapping every section wrapper.
- Added a focused jsdom test that proves parent viewport-only rerenders do not re-execute the section-wrapper subtree while drag-state changes still do.

## Before

- Worktree canary baseline from `2026-04-05_settings-graph-substrate-normal-zoom-baseline.md`:
  - average frame duration: `17.00ms`
  - max frame duration: `50.1ms`
  - long tasks: `1` (`60ms`)
  - root DOM nodes: `9515`
  - section DOM nodes: `132`

## After

- Legacy `main` rerun on the same lane:
  - average frame duration: `16.66ms`
  - max frame duration: `33.2ms`
  - long tasks: `0`
  - root DOM nodes: `8907`
  - section DOM nodes: `132`
- Worktree canary after section-layer isolation:
  - average frame duration: `16.62ms`
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
  - the canary-side `60ms` long task disappeared on the same deterministic lane
  - the canary max frame cost dropped from `50.1ms` to `33.3ms`
  - the canary average frame duration improved slightly from `17.00ms` to `16.62ms`, narrowly edging under the simultaneous legacy rerun (`16.66ms`)
- What did not change:
  - DOM footprint is still higher than legacy by `608` root nodes, so this slice reduced rerender work rather than shrinking the rendered surface
  - the canary still shows one frame above `33.3ms`, so there is still room to inspect the remaining viewport/presentation path if later probes regress
- Visual confirmation:
  - a fresh-context CDP check compared worktree `3076/settings` against read-only main `3087/settings` on the same normalized `rotaryParamCodeObjDefault` lane
  - no gross graph-surface drift was observed after the change; only minor viewport/canvas placement noise remained

## Follow-up

- If the next perf pass still points at presentation/layout cost, inspect whether the remaining viewport transform path should move behind a deeper layer so pan/zoom updates stop rerendering the canary root itself.
- Otherwise, resume the plan's geometry-authority/module-deepening work and keep this perf lane as the regression gate.
