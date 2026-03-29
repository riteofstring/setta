# Settings Live Pixi CodeMirror Value-Only Connected-State Split (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Reduce the live Pixi `defaultZoomLevel` CodeMirror handoff work on the
  already-landed value-only overlay path by removing the full-row connected
  search/theme/display-name state pipeline from the normal CodeMirror happy
  path.

## Change

- Narrowed the active overlay shell in:
  - `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.tsx`
- Split the overlay renderer in:
  - `frontend/src/components/Params/LiveDictAreaPixiValueRowOverlay.tsx`
  - `frontend/src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.tsx`
- The live canary now:
  - keeps the shell-side CodeMirror gate limited to `coreNameEditable` plus the
    current joined error message
  - mounts the normal CodeMirror row directly on the existing `value-only`
    `ParamInput` surface
  - leaves the heavier connected full-row search/theme/display-name path behind
    a separate full-row-only boundary for errored and special rows

## Verification Snapshot

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx`
  - result: passed (`8 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Params/LiveDictAreaPixiOverlayShell.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.tsx src/components/Params/LiveDictAreaPixiValueRowOverlay.tsx src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx`
  - result: passed
- Playwright:
  - `SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BOOTSTRAP_TOKEN="<current bootstrap token>" SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "CodeMirror-backed value row"`
  - result: passed (`1 passed`)
- Chrome DevTools MCP:
  - headed Chrome check on `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
  - result: passed

## Headed Chrome Snapshot

- Active row: `defaultZoomLevel`
- Overlay surface: `value-only`
- Overlay geometry: about `308 x 20 px`
- `.cm-editor` geometry: about `29 x 16 px`
- Representative measures from the headed CDP check:
  - overlay latency: `13.5 ms`
  - ready latency: `30.5 ms`
  - presented latency: `40.5 ms`
  - presentation tail latency: `10.0 ms`

## Notes

- The required visual gate stayed green on the checked canary:
  - `[data-live-dict-area-editor-overlay='active']` appeared for the active
    `defaultZoomLevel` row
  - the overlay remained readable and did not clip in the headed Chrome bounds
    check
- This slice intentionally focused on removing unnecessary connected-state work
  from the normal CodeMirror happy path.
- A fresh apples-to-apples headless timing rerun is still needed before drawing
  a direct latency comparison against the earlier value-only overlay baseline.
