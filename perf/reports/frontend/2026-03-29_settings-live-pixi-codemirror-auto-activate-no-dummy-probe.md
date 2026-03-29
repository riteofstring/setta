# Settings Live Pixi CodeMirror Auto-Activate No-Dummy Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-measure the live Pixi generic value-row handoff after removing the extra
  dummy CodeMirror first frame from guaranteed auto-activate mounts.

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
  - seed the initial activation state for guaranteed auto-activate mounts so
    the real CodeMirror mounts immediately
  - skip the dummy shell while that guaranteed auto-activate mount is already
    activating the real editor
- `frontend/src/components/Utils/CodeMirror/textInputCodeMirrorView.ts`
  - add pure helpers for the initial activation and dummy-shell gating rules
- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`
  - extend the pure helper coverage for the new mount gating
- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - add jsdom coverage that proves the auto-activate path mounts the real
    editor without the dummy first frame

## Probe

- Fresh-context Chrome DevTools MCP visual/perf checks on the live worktree
  runtime before and after the change.
- In both checks, the live Settings route stayed visually sane and the
  `defaultZoomLevel` handoff still opened the DOM editor overlay while the
  Pixi canary remained mounted underneath.

## Observations

- Baseline before the change:
  - `INP`: `139 ms`
  - input delay: `7 ms`
  - processing: `17 ms`
  - presentation delay: `115 ms`
- Follow-up after the change:
  - `INP`: `123 ms`
  - input delay: `4 ms`
  - processing: `14 ms`
  - presentation delay: `105 ms`
- Relative to the fresh pre-change baseline from this iteration:
  - `INP` improved from `139 ms` to `123 ms`
  - presentation delay improved from `115 ms` to `105 ms`
  - the interaction is still presentation-heavy overall, and DevTools only
    surfaced the generic `INPBreakdown` insight rather than a new named code
    hotspot

## Verdict

- Keep the no-dummy auto-activate mount change.
- The win is modest, but it is directionally correct on the exact live Pixi
  CodeMirror handoff path this slice targeted.
- The next retained-scene hotspot slice should continue from the remaining
  presentation/layout floor instead of reopening this mount-frame optimization.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - result: passed (`13 passed`)
- Prettier:
  - `pnpm -C frontend exec prettier --check src/components/Utils/CodeMirror/TextInputCodeMirror.tsx src/components/Utils/CodeMirror/textInputCodeMirrorView.ts src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts src/components/Utils/CodeMirror/TextInputCodeMirror.render.test.tsx`
  - result: passed
- Playwright:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay|CodeMirror-backed value row"`
  - result: passed (`2 passed`)
- Chrome DevTools MCP visual/perf checks:
  - baseline result: passed
  - post-change result: passed
  - baseline auth: bootstrap URL worked and reused the authenticated tab
  - post-change auth: reused the authenticated live Settings tab
