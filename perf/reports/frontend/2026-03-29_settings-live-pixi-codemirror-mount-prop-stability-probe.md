# Settings Live Pixi CodeMirror Mount Prop-Stability Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Probe whether stabilizing the first-click `TextInputCodeMirror` mount path
  reduces the shared live Pixi value-row handoff cost on the
  `defaultZoomLevel` canary.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible generic value-row handoff on `defaultZoomLevel`.
  3. Capture a short DevTools performance trace around the click/open
     interaction.

## Change Under Test

- Experimental local-only probe, reverted after measurement:
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
    - memoize the core CodeMirror view/extension builder path
    - keep the CodeMirror root `className` stable while the initialization
      shell flips visibility
  - `frontend/src/components/Utils/CodeMirror/useCodeMirrorTooltipParent.ts`
    - resolve the tooltip parent synchronously instead of through a
      post-mount state update

## Probe

- Fresh-context Chrome DevTools MCP visual/perf check on the live worktree
  runtime after applying the experimental patch.
- The page stayed authenticated, `All Settings` loaded successfully, and the
  `defaultZoomLevel` handoff still opened the editor overlay while the Pixi
  canary stayed mounted and visually sane.

## Observations

- Follow-up interaction summary from the experimental patch:
  - `INP`: `56 ms`
  - input delay: `6 ms`
  - processing: `16 ms`
  - presentation delay: `34 ms`
- Relative to the recent accepted follow-up from
  `2026-03-29_settings-live-pixi-project-chat-pointer-cache-probe.md`:
  - accepted baseline: `INP 48 ms`, presentation `30.6 ms`
  - this probe regressed overall latency to `56 ms`
  - presentation also moved slightly the wrong way to `34 ms`
- The CodeMirror activation path still appeared in the hot samples:
  - `@uiw/react-codemirror`
  - `dispatch`
  - `requestMeasure`
  - `applyTransaction`

## Verdict

- Reject this prop-stability micro-optimization as a keep candidate.
- The change did not materially improve the measured live Pixi handoff path,
  and the overall trace was mixed to slightly worse than the latest accepted
  baseline.
- Revert the experimental code and keep only this report plus the rewrite-log
  entry.
- The next retained-scene hotspot slice should target a different CodeMirror
  activation lever or the handoff-layer DOM/presentation cost rather than this
  particular memoization/class-stability tweak.

## Verification Notes

- Vitest on the experimental patch:
  - `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - result: passed (`8 passed`)
- Playwright canary on the experimental patch:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay|CodeMirror-backed value row"`
  - result: passed (`2 passed`)
- Chrome DevTools MCP visual/perf check on the experimental patch:
  - result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
  - visual result: sane
  - perf result: `INP 56 ms` (`input 6 ms`, `processing 16 ms`, `presentation 34 ms`)
