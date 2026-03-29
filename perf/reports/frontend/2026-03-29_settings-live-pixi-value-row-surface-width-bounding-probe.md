# Settings Live Pixi Value-Row Surface Width Bounding Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-measure the live Pixi generic value-row handoff after constraining the
  active handoff surfaces to the explicit row packet width instead of
  stretching them to the container edge with `right: 0`.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible `defaultZoomLevel` value-row handoff.
  3. Verify the DOM editor overlay opens cleanly and capture a short trace.

## Change Under Test

- `frontend/src/components/Params/liveDictAreaPixiValueRowTargets.ts`
  - carry an explicit width for the value-row handoff surface using the row
    packet geometry
- `frontend/src/components/Params/LiveDictAreaPixiOverlayShell.tsx`
  - use the explicit width on the inactive value-row handoff button instead of
    stretching it with `right: 0`
- `frontend/src/components/Params/LiveDictAreaPixiValueRowOverlay.tsx`
  - use the explicit width on the active value-row overlay shell instead of
    stretching it with `right: 0`
- focused tests
  - cover the explicit width on the target builder, handoff button, and active
    overlay shell

## Probe

- Fresh-context Chrome DevTools MCP baseline and post-change checks on the live
  worktree runtime.
- The page stayed visually sane in both checks and `defaultZoomLevel` still
  opened an editable inline `1.0` field.

## Observations

- Fresh baseline before the change:
  - Chrome did not surface a clean isolated INP sample for the settings click
  - the closest signal was a forced-reflow cluster totaling about `1284 ms`
  - the largest named contributor in that capture was `getHandleCenter` at
    about `1173 ms`
- Post-change follow-up:
  - the trace reported `INP 88 ms`
  - input delay: `5 ms`
  - processing: `2 ms`
  - presentation delay: `81 ms`
- Comparison caveat:
  - the follow-up trace attached partly to bootstrap/navigation work instead of
    a perfectly isolated settings-only interaction
  - this is therefore directional evidence only, not a strict apples-to-apples
    before/after benchmark

## Verdict

- Keep the explicit width-bounding change.
- It makes the active handoff footprint match the scene row geometry more
  closely and passed the visual gate on the live canary.
- The perf evidence is not clean enough to claim a measured win, so the next
  iteration should keep targeting the same presentation/layout floor with a
  better-isolated trace instead of reopening this geometry slice.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/liveDictAreaPixiValueRowTargets.test.ts src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx`
  - result: passed (`6 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Params/liveDictAreaPixiValueRowTargets.ts src/components/Params/LiveDictAreaPixiValueRowOverlay.tsx src/components/Params/LiveDictAreaPixiOverlayShell.tsx src/components/Params/liveDictAreaPixiValueRowTargets.test.ts src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.test.tsx src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx`
  - result: passed
- Playwright:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay|CodeMirror-backed value row"`
  - result: passed (`2 passed`)
- Chrome DevTools MCP visual/perf checks:
  - baseline result: visual passed; no clean INP, closest signal was the forced
    reflow cluster noted above
  - post-change result: visual passed; `defaultZoomLevel` overlay opened
    cleanly and the short trace reported `INP 88 ms`
