# Settings Live Pixi Value-Row Presented-Tail Post-Fix Rerun (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-measure the deterministic live Pixi `defaultZoomLevel` value-row handoff
  after the zoomed-out CodeMirror overlay fix so the presented-tail numbers are
  tied to a visually acceptable canary instead of the earlier tiny/clipped
  failure state.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible CodeMirror-backed Pixi value-row handoff for
     `defaultZoomLevel`.
  3. Read the latest `performance` entries for the explicit handoff
     mark/measure names.

## Live Verification Snapshot

- Verified on the live worktree runtime after the zoom-out counter-scale fix.
- Activated handoff:
  - label: `defaultZoomLevel`
  - row id detail: `3a5e4e74-b722-44eb-9741-2455ebdb6228`
  - editor kind detail: `codemirror`
- Active outer overlay geometry:
  - rect: about `308 x 20 px`
  - style: `transform: matrix(10, 0, 0, 10, 0, 0)` /
    `scale(10)` counter-transform at viewport zoom `0.1`
  - rendered value: `1.0`
- Retrieved timings:
  - overlay latency: `3.9 ms`
  - ready latency: `20.8 ms`
  - presented latency: `31.5 ms`
  - presentation tail latency: `10.7 ms`

## Comparison To The Pre-Fix Presented-Tail Report

- Prior failing visual check (`2026-03-29_settings-live-pixi-value-row-presented-tail-marks.md`):
  - overlay latency: about `5.9 ms` to `6.1 ms`
  - ready latency: about `18.1 ms`
  - presented latency: about `83.2 ms`
  - presentation tail latency: about `65.1 ms`
- Current post-fix rerun:
  - overlay latency improved to `3.9 ms`
  - ready latency stayed in the same range at `20.8 ms`
  - presented latency dropped to `31.5 ms`
  - presentation tail latency dropped to `10.7 ms`

## Visual Result

- Fresh-context Chrome DevTools MCP verification passed when judged on the
  correct outer overlay shell:
  - the active value-row overlay was readable and not tiny, clipped, or
    collapsed in the checked viewport
  - the outer overlay shell, not the inner flow-space editable node, is the
    right visual gate for this handoff path
- Representative successful requests during the check:
  - `POST /api/setSectionParamFilter` `200`
  - `POST /api/setTopLevelSectionLayout` `200`
  - `POST /api/getFileBrowserRoot` `200`
  - `POST /api/getFolderContents` `200`

## Verdict

- The live Pixi `defaultZoomLevel` handoff now has deterministic presented-tail
  timings on a visually acceptable overlay path.
- The earlier post-ready cost is materially lower on the fixed canary:
  - presented latency fell from about `83.2 ms` to `31.5 ms`
  - presentation tail fell from about `65.1 ms` to `10.7 ms`
- The next iteration should profile the remaining `~31.5 ms` total presented
  latency on this corrected visual baseline rather than returning to more seam
  lifting.

## Verification Notes

- Playwright:
  - `SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BOOTSTRAP_TOKEN="<token>" SETTA_AUTH_COOKIE_NAME=setta_auth_setta.pixijs-rewrite pnpm -C frontend exec playwright test tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "CodeMirror-backed value row"`
  - result: passed (`1 passed`)
- Direct timing probe:
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8044 SETTA_BOOTSTRAP_TOKEN="<token>" pnpm -C frontend exec node <<'EOF' ... EOF`
  - result: passed; captured the `defaultZoomLevel` overlay geometry plus the latest overlay/ready/presented/presentation-tail measures from `performance`
- Chrome DevTools MCP visual check:
  - result: passed
  - verified the active outer overlay shell is readable on the fixed live Pixi
    canary
