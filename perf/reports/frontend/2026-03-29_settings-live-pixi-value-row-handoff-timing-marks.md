# Settings Live Pixi Value-Row Handoff Timing Marks (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Stop relying on broad, bootstrap-noisy DevTools traces alone for the live
  Pixi `defaultZoomLevel` handoff path by adding deterministic in-page timing
  marks for:
  - click -> overlay mount
  - click -> CodeMirror ready

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible CodeMirror-backed value-row handoff on
     `defaultZoomLevel`.
  3. Read the latest `performance` timeline entries for the explicit handoff
     mark/measure names.

## Instrumentation

- Added explicit performance timeline entries on the live Pixi value-row path:
  - `setta.liveDictAreaPixi.valueRowHandoff.start`
  - `setta.liveDictAreaPixi.valueRowHandoff.overlayMounted`
  - `setta.liveDictAreaPixi.valueRowHandoff.overlayLatency`
  - `setta.liveDictAreaPixi.valueRowHandoff.editorReady`
  - `setta.liveDictAreaPixi.valueRowHandoff.readyLatency`
- The marks are emitted from the real production handoff path:
  - click/handoff start in `LiveDictAreaPixiOverlayShell`
  - overlay mount in `LiveDictAreaPixiValueRowOverlay`
  - CodeMirror ready in the auto-activated overlay editor path

## Live Verification Snapshot

- Verified via fresh-context Chrome DevTools MCP on the live worktree runtime.
- Activated handoff:
  - label: `defaultZoomLevel`
  - row id detail: `94dbd722-d397-4dd3-a855-37c0dd1c059d`
  - editor kind detail: `codemirror`
- Retrieved entries:
  - start mark timestamp: `9681 ms`
  - overlay latency: `6.100000023841858 ms` and `6.5 ms`
  - editor-ready mark timestamp: `9696.700000047684 ms`
  - ready latency: `15.700000047683716 ms`

## Verdict

- The live canary now exposes deterministic timing boundaries for the exact
  handoff path the recent iterations have been optimizing.
- The next iteration can compare future changes against these explicit
  click-to-overlay and click-to-ready measures instead of depending on a broad
  INP trace that may capture bootstrap/navigation noise.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/liveDictAreaPixiValueRowPerf.test.ts src/components/Params/LiveDictAreaPixiOverlayShell.test.tsx src/components/Params/LiveDictAreaPixiValueRowOverlay.test.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - result: passed (`20 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Params/liveDictAreaPixiValueRowPerf.ts src/components/Params/liveDictAreaPixiValueRowPerf.test.ts src/components/Params/LiveDictAreaPixiOverlayShell.tsx src/components/Params/LiveDictAreaPixiValueRowOverlay.tsx src/components/Params/LiveDictAreaPixiValueOverlaySceneRow.tsx src/components/Params/ParamItems/ParamInput.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
  - result: passed
- Playwright:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "CodeMirror-backed value row"`
  - result: passed (`1 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: passed
  - the inline CodeMirror editor appeared cleanly with no obvious blanking,
    clipping, or major overlap around the activated row
