# Settings Live Pixi CodeMirror Imperative Ready Reveal Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-measure the live Pixi generic value-row handoff after removing the extra
  React initialization-state rerender from guaranteed CodeMirror auto-activate
  mounts.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible generic value-row handoff on `defaultZoomLevel`.
  3. Capture a short DevTools performance trace around the click/open
     interaction.

## Change Under Test

- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - keep the legacy DOM path on the existing state-tracked initialization flow
  - switch the guaranteed Pixi auto-activate mount to an imperative
    ready-reveal path so it does not spend an extra React rerender just to drop
    the temporary hidden class
- `frontend/src/components/Utils/CodeMirror/getOnCreateEditor.ts`
  - generalize the editor-ready callback so the mount path can choose whether
    readiness is handled through state or an imperative reveal
- `frontend/src/components/Utils/CodeMirror/textInputCodeMirrorView.ts`
  - expose the pure gating rule for whether initialization should still be
    tracked in React state
- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`
  - cover the new pure initialization-tracking rule
- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - prove the auto-activated Pixi handoff mounts the real editor without a
    second initialization rerender

## Probe

- Fresh-context Chrome DevTools MCP visual/perf check on the live worktree
  runtime after the change.
- Used the already-authenticated live Settings tab on `3044`; the bootstrap
  token was not needed in that browser session.
- The checked viewport stayed visually sane while the `defaultZoomLevel`
  handoff opened the inline CodeMirror editor and the Pixi scene remained
  mounted underneath.

## Observations

- Latest accepted comparison point from
  `2026-03-29_settings-live-pixi-codemirror-auto-activate-no-dummy-probe.md`:
  - `INP`: `123 ms`
  - input delay: `4 ms`
  - processing: `14 ms`
  - presentation delay: `105 ms`
- Follow-up after the imperative ready-reveal change:
  - `INP`: `88 ms`
  - input delay: `2 ms`
  - processing: `11 ms`
  - presentation delay: `75 ms`
- Relative to the latest accepted comparison point:
  - `INP` improved from `123 ms` to `88 ms`
  - presentation delay improved from `105 ms` to `75 ms`
  - the interaction is still presentation-heavy overall, and DevTools did not
    report an explicit estimated-savings hotspot for the trace

## Verdict

- Keep the imperative ready-reveal change for guaranteed live Pixi CodeMirror
  auto-activate mounts.
- The exact live handoff path moved in the right direction again without
  widening the DOM overlay or reopening the rejected prop-stability lane.
- The next retained-scene hotspot slice should continue from the remaining
  presentation/layout floor on this handoff path rather than revisiting this
  initialization rerender.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - result: passed (`15 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Utils/CodeMirror/TextInputCodeMirror.tsx src/components/Utils/CodeMirror/textInputCodeMirrorView.ts src/components/Utils/CodeMirror/getOnCreateEditor.ts src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - result: passed
- Playwright:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay|CodeMirror-backed value row"`
  - result: passed (`2 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
  - visible requests noted during the check:
    - `POST http://127.0.0.1:8044/api/setViewport` `200`
    - `POST http://127.0.0.1:8044/api/getFolderContents` `200`
