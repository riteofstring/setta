# Settings graph worktree pane-state read diagnostics

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Replace the opaque `worktree: capture initial pane state` 30s timeout with a
faster, explicit diagnostic so the canonical main-reference probe can tell the
difference between a pane-state read hang and a broader worktree-health issue.

## Change

- extracted persisted pane-state parsing and diagnostic formatting into
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.ts`
- updated `getLocalPaneState(...)` in
  `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts` to:
  - keep the persisted `localStorage` fast path
  - bound the in-page store import fallback to `2000ms`
  - throw explicit diagnostics with URL, ready-state, shell/surface/content
    visibility, and persisted-state presence/parseability when the fallback
    times out or throws

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  - passed (`1` file, `4` tests)
- `pnpm -C frontend exec prettier --check tests/e2e/settings/graphSubstrateParityProbe.ts src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.ts src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-041/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-041/main-ai.log`
  - failed before the spec body in Playwright global setup
  - blocker on this runtime was `page.waitForURL(...)` after bootstrap, not the
    pane-state read helper
- direct headless Playwright bootstrap + `/settings` check against the live
  worktree runtime
  - succeeded in reading pane state:
    `{"overviewVisible":true,"overviewTrueWidth":335,"snapToGrid":true,"uiEditorVisible":false,"uiEditorTrueWidth":40}`
- fresh-context headless CDP smoke
  - bootstrap consume returned `401 Unauthorized`
  - UI stayed on the bootstrap screen with `Token rejected. Request a new token and try again.`

## Reading

- this iteration did not reproduce the original `capture initial pane state`
  hang on the direct worktree page; the helper path is viable on the current
  runtime
- the canonical lane is still unstable for default sequencing because the
  runtime currently splits across:
  - Playwright global-setup routing failure on the canonical script
  - CDP bootstrap token rejection
- per lane budget, the next default iteration should return to product-side
  attribution work rather than spend a third pass on this probe/setup family
