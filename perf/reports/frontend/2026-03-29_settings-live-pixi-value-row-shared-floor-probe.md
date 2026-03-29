# Settings Live Pixi Generic Value-Row Shared-Floor Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Probe the remaining shared interaction floor on the live Pixi value-row
  handoff canary after the combobox-specific hotspot probe stopped pointing at
  `downshift`.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click a visible generic value-row handoff.
  3. Capture a short DevTools performance trace around the click/open
     interaction.

## Probe

- Fresh-context Chrome DevTools MCP profile on the live worktree runtime.
- Visible handoff row used:
  - `defaultZoomLevel`
- Overlay result:
  - the value-row handoff opened correctly
  - focus landed in a CodeMirror textbox with value `1.0`
  - the Pixi / React Flow surface stayed mounted throughout the interaction
  - observed scene continuity:
    - `canvasCount` stayed `46`
    - `.react-flow__renderer` remained present

## Observations

- Interaction summary:
  - `INP`: `73 ms`
  - input delay: `8 ms`
  - processing: `16 ms`
  - presentation delay: `49 ms`
  - `EventDispatch(click)` was about `13.7 ms`
- The slowest portion of the interaction was presentation/compositor work, not
  widget-specific click handler CPU.
- Top sampled functions and signals in the trace:
  - Pixi interaction / hit-testing:
    - `hitTest`
    - `hitTestRecursive`
    - `get eventMode`
    - `_interactivePrune`
    - `_isInteractive`
  - shared pointer floor:
    - `handlePointerDown` in `src/components/Pages/Project/UiPage.tsx`
  - shared state/update path:
    - `checkIfSnapshotChanged`
    - `src/components/Params/groupContainerLiveDictAreaSectionStoreBoundary.ts`
  - React commit work:
    - `commitMutationEffectsOnFiber`
    - `commitPassiveMountOnFiber`
    - `recursivelyTraversePassiveMountEffects`
  - background render cadence:
    - Pixi RAF `_tick`

## Verdict

- Treat the remaining cost here as a shared interaction floor, not a
  combobox/color-picker/widget-specific editor hotspot.
- The next retained-scene performance slice should target:
  - shared Pixi hit-testing / interaction routing
  - shared pointer handling in `UiPage.tsx`
  - the live dict-area section store boundary and resulting React commit /
    presentation work
- Do not spend the next iteration on more widget-specific overlay-shell cleanup
  unless a new trace shows a concrete widget-owned regression.

## Verification Notes

- Targeted Playwright canary:
  - `SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BOOTSTRAP_TOKEN=<current bootstrap token> SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay"`
  - result: passed (`1 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
