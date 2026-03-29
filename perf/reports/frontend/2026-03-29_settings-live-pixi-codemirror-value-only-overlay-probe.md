# Settings Live Pixi CodeMirror Value-Only Overlay Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Reduce the live Pixi `defaultZoomLevel` CodeMirror handoff cost by letting the
  retained scene keep the static row chrome while the DOM overlay mounts only
  the active value editor surface for the normal CodeMirror canary row.

## Change

- Narrowed the active CodeMirror overlay row in:
  - `frontend/src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.tsx`
- The live canary now keeps the existing full-row overlay path for error and
  special rows, but the normal CodeMirror value-row handoff skips duplicate:
  - label/name cell DOM
  - resize-handle DOM
  - floating tooltip wrapper chrome

## Scenario

- Fresh restarted worktree runtime:
  - frontend: `http://127.0.0.1:3046`
  - backend: `http://127.0.0.1:8046`
- Interaction:
  1. Bootstrap a fresh auth session.
  2. Force live Pixi mode.
  3. Open `All Settings`.
  4. Click the visible CodeMirror-backed `defaultZoomLevel` handoff.
  5. Read the deterministic handoff measures from `performance`.

## Headless Probe Snapshot

- Direct Playwright probe on the fresh runtime returned:
  - overlay latency: `3.7 ms`
  - ready latency: `18.2 ms`
  - presented latency: `27.5 ms`
  - presentation tail latency: `9.3 ms`
- Overlay state from the same probe:
  - overlay row surface: `value-only`
  - overlay geometry: about `308 x 20 px`
  - rendered value: `1.0`

## Comparison To The Prior Fixed-Overlay Baseline

- Prior post-fix rerun (`2026-03-29_settings-live-pixi-value-row-presented-tail-post-fix-rerun.md`):
  - overlay latency: `3.9 ms`
  - ready latency: `20.8 ms`
  - presented latency: `31.5 ms`
  - presentation tail latency: `10.7 ms`
- Current value-only probe:
  - overlay latency improved to `3.7 ms`
  - ready latency improved to `18.2 ms`
  - presented latency improved to `27.5 ms`
  - presentation tail improved to `9.3 ms`

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx`
  - result: passed (`5 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
  - result: passed
- Playwright:
  - `SETTA_BACKEND_ORIGIN=http://127.0.0.1:8046 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3046 SETTA_BOOTSTRAP_TOKEN="<fresh token>" SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay|CodeMirror-backed value row"`
  - result: passed (`2 passed`)
- Direct timing probe:
  - fresh token minted from `setta_files_dev/runtime/sessions`
  - headless probe returned the timing snapshot listed above

## CDP Visual Result

- Fresh-context headed Chrome DevTools checks on the same restarted runtime did
  not pass the required visual gate.
- Two independent CDP verifiers on `http://127.0.0.1:3046/settings` reported:
  - clicking the visible `defaultZoomLevel` handoff did not produce a visible
    `[data-live-dict-area-editor-overlay='active']` element in headed Chrome
  - because the overlay did not clearly materialize, readability could not be
    confirmed
- Representative successful requests during the failing visual check included:
  - `POST /api/loadSettings` `200`
  - `POST /api/loadProjectConfig` `200`
  - `GET /api/authRefreshStatus` `200`
  - `GET /api/backendInitStatus` `200`
  - `POST /api/getFileBrowserRoot` `200`

## Verdict

- The value-only overlay change shows a positive headless timing signal on the
  exact live Pixi `defaultZoomLevel` canary.
- This probe is not an accepted progress point yet because the required headed
  Chrome DevTools visual gate still fails to surface the active overlay.
- The next iteration should investigate the headed Chrome event/activation
  mismatch on the fresh `3046/8046` runtime before treating this path as
  visually acceptable.
