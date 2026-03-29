# Settings Live Pixi Value-Row Presented-Tail Marks (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Extend the deterministic live Pixi `defaultZoomLevel` handoff timing marks so
  the next performance slice can measure the post-ready presentation tail
  directly instead of inferring it from a broad trace window.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible CodeMirror-backed Pixi value-row handoff on
     `defaultZoomLevel`.
  3. Read the latest `performance` entries for the explicit handoff
     mark/measure names.

## Instrumentation

- Added new deterministic timeline entries on the production handoff path:
  - `setta.liveDictAreaPixi.valueRowHandoff.presented`
  - `setta.liveDictAreaPixi.valueRowHandoff.presentedLatency`
  - `setta.liveDictAreaPixi.valueRowHandoff.presentationTailLatency`
- The presented marker is emitted after the ready path and two
  `requestAnimationFrame` hops so the measurement includes the immediate
  post-ready presentation tail that has still been dominating recent canary
  checks.

## Live Verification Snapshot

- Verified via fresh-context Chrome DevTools MCP on the live worktree runtime.
- Activated handoff row:
  - label: `defaultZoomLevel`
  - editor kind: `codemirror`
- Retrieved durations:
  - overlay latency: about `5.9 ms` to `6.1 ms`
  - ready latency: about `18.1 ms`
  - presented latency: about `83.2 ms`
  - presentation tail latency: about `65.1 ms`
- Representative successful requests during the check:
  - `GET /settings?liveDictAreaRenderer=pixi-node-body` `200`
  - `POST /api/loadSettings` `200`
  - `POST /api/loadProjectConfig` `200`
  - `POST /api/getLatestLspDiagnostics` `200`
  - `POST /api/getAIFollowSnapshot` `200`
  - `POST /api/getFileBrowserRoot` `200`

## Visual Result

- The required CDP visual gate failed on this runtime.
- Two fresh-context CDP checks reproduced the same issue:
  - the inline CodeMirror editor mounted as a tiny, clipped stack instead of a
    sane readable overlay row
- Because the live canary itself was visibly wrong in the checked viewport, the
  new timing marks are useful for the next performance slice, but this path
  cannot be treated as visually acceptable yet.

## Verdict

- The live canary now exposes deterministic click-to-overlay, click-to-ready,
  click-to-presented, and ready-to-presented timings for the real production
  handoff path.
- Those timings show the remaining cost is still concentrated after editor
  readiness, in the immediate presentation tail.
- The next iteration should use these marks while investigating the reproducible
  clipped/tiny inline editor regression before claiming any further live Pixi
  value-row progress.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Params/liveDictAreaPixiValueRowPerf.test.ts`
  - result: passed (`3 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Params/liveDictAreaPixiValueRowPerf.ts src/components/Params/liveDictAreaPixiValueRowPerf.test.ts tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts`
  - result: passed
- Playwright:
  - `SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BOOTSTRAP_TOKEN="<token>" SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "CodeMirror-backed value row"`
  - result: passed (`1 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: failed visual gate
  - deterministic timing entries were present and readable
  - the inline CodeMirror editor was tiny/clipped in the checked viewport
