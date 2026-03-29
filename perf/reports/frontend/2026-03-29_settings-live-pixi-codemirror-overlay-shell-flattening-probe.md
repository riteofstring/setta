# Settings Live Pixi CodeMirror Overlay Shell Flattening Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-measure the live Pixi generic value-row handoff after flattening the
  active single-row overlay shell so the browser does less layout/paint work
  while the CodeMirror editor reveals.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible generic value-row handoff on `defaultZoomLevel`.
  3. Capture a short DevTools performance trace around the click/open
     interaction.

## Change Under Test

- `frontend/src/components/Params/LiveDictAreaPixiValueRowOverlay.tsx`
  - remove the extra single-row grid shell
  - add `contain: layout paint` on the active overlay root
- `frontend/src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.tsx`
  - flatten the overlay row so the article becomes the row root instead of
    sitting under another wrapper div
- `frontend/src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx`
  - cover the contained/lightweight overlay shell
- `frontend/src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx`
  - cover the flattened article-root row surface

## Probe

- Fresh-context Chrome DevTools MCP baseline and follow-up checks on the live
  worktree runtime.
- In both checks, the page stayed visually sane and the live Pixi `All
  Settings` canary opened the inline CodeMirror overlay on `defaultZoomLevel`
  without blanking, clipping, or major overlap.

## Observations

- Baseline before the change:
  - `INP`: `57 ms`
  - input delay: `5 ms`
  - processing: `14 ms`
  - presentation delay: `38 ms`
- Follow-up after flattening the active overlay shell:
  - `INP`: `56 ms`
  - input delay: `4 ms`
  - processing: `14 ms`
  - presentation delay: `37 ms`
- Relative to the fresh pre-change baseline from this iteration:
  - `INP` improved slightly from `57 ms` to `56 ms`
  - presentation delay improved slightly from `38 ms` to `37 ms`
  - the trace remained presentation-heavy overall, but the lighter overlay shell
    did not introduce any visible regressions on the checked canary

## Verdict

- Keep the overlay-shell flattening change.
- The measured win is small, but it is directionally correct and comes from a
  simpler hot-path DOM structure rather than another forwarding-only seam lift.
- The next retained-scene hotspot slice should continue from another bounded
  presentation/layout lever on this same live Pixi CodeMirror handoff path
  instead of reopening this overlay-shell shape change.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx`
  - result: passed (`5 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Params/LiveDictAreaPixiValueRowOverlay.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.tsx src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx`
  - result: passed
- Playwright:
  - attempted:
    - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay|CodeMirror-backed value row"`
    - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 SETTA_BOOTSTRAP_TOKEN=<current worktree token> SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay|CodeMirror-backed value row" --reporter=line`
  - result: blocked by Playwright global setup bootstrap `401`, not by a product assertion failure
- Chrome DevTools MCP visual/perf checks:
  - baseline result: passed
  - post-change result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
