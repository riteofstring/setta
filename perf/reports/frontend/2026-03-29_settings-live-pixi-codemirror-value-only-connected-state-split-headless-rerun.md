# Settings Live Pixi CodeMirror Value-Only Connected-State Split Headless Rerun (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-run the exact headless `defaultZoomLevel` live Pixi handoff probe on the
  landed connected-state-split baseline from item `253` so the next latency
  slice can compare it directly against the earlier value-only overlay probe.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Bootstrap the current worktree runtime.
  2. Force live Pixi mode through session storage.
  3. Open `All Settings`.
  4. Click the visible CodeMirror-backed `defaultZoomLevel` handoff.
  5. Read the latest explicit handoff `performance` measures plus overlay
     geometry from the active DOM overlay.

## Headless Probe Snapshot

- Direct Playwright probe on the current `3044/8044` runtime returned:
  - overlay latency: `3.8 ms`
  - ready latency: `18.3 ms`
  - presented latency: `27.5 ms`
  - presentation tail latency: `9.2 ms`
- Overlay state from the same probe:
  - row id: `16ea748d-0872-40a2-b31e-c9a8c977faad`
  - overlay row surface: `value-only`
  - overlay geometry: about `308 x 20 px`
  - `.cm-editor` geometry: about `29 x 16 px`
  - rendered value: `1.0`

## Comparison To The Earlier Value-Only Overlay Baseline

- Prior value-only overlay probe
  (`2026-03-29_settings-live-pixi-codemirror-value-only-overlay-probe.md`):
  - overlay latency: `3.7 ms`
  - ready latency: `18.2 ms`
  - presented latency: `27.5 ms`
  - presentation tail latency: `9.3 ms`
- Current connected-state-split rerun:
  - overlay latency is effectively flat at `3.8 ms`
  - ready latency is effectively flat at `18.3 ms`
  - presented latency is unchanged at `27.5 ms`
  - presentation tail is effectively flat at `9.2 ms`

## Visual Result

- Fresh-context Chrome DevTools MCP verification still passed on the same
  canary:
  - clicking the visible `defaultZoomLevel` handoff produced the active
    `[data-live-dict-area-editor-overlay='active']` overlay
  - overlay geometry was about `308 x 20 px`
  - text remained readable as `1.0`
  - `clientWidth/clientHeight` matched `scrollWidth/scrollHeight`, so the
    headed check did not find clipping or the earlier tiny-stack regression
- Representative successful requests during the headed check:
  - `POST /api/loadSettings` `200`
  - `GET /api/backendInitStatus` `200`
  - `POST /api/loadProjectConfig` `200`
  - `POST /api/setViewport` `200`
  - `POST /api/getFileBrowserRoot` `200`
- Notable negative:
  - the provided bootstrap URL rejected the token in the verifier session
    before the direct settings check, but the canary page itself still loaded
    and verified correctly

## Verification Notes

- Direct timing probe:
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 SETTA_BOOTSTRAP_TOKEN="<token>" pnpm -C frontend exec node -e '...'`
  - result: passed; captured the latest overlay/ready/presented/presentation-tail
    measures and active overlay geometry from `performance`
- Playwright:
  - direct run with the provided token:
    - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 SETTA_BOOTSTRAP_TOKEN="<token>" SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "CodeMirror-backed value row"`
  - helper rerun with a freshly minted token:
    - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "CodeMirror-backed value row"`
  - result: both blocked in `frontend/tests/e2e/global-setup.ts` by bootstrap
    `401` before product assertions
- Chrome DevTools MCP visual check:
  - result: passed

## Verdict

- The connected-state split remains visually acceptable on the checked live Pixi
  canary, but this apples-to-apples headless rerun shows no meaningful latency
  improvement versus the earlier value-only overlay baseline.
- Treat the connected-state split as a structural cleanup that did not move the
  measured handoff floor on this exact canary.
- The next latency slice should pivot to a different measured lever on the same
  handoff path instead of continuing the same connected-state reduction pattern.
