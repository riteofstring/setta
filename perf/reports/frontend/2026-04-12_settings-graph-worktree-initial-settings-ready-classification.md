# Settings Graph Worktree Initial Settings Ready Classification

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Status: classified blocker

## Why

The live worktree-only motion probe was still failing before the lane action at
`waitForInitialSettingsGraphReady(...)`, but the old helper was mixing real
graph readiness with stale fullscreen-button test ids that no longer exist.

## Change

- updated
  `frontend/tests/e2e/settings/settings-view-modes.spec.ts:waitForInitialSettingsGraphReady(...)`
  to stop polling the removed fullscreen-button test ids
- the helper now waits for the authenticated app shell plus either:
  - a mounted graph surface (`.react-flow__pane` or
    `[data-testid="graph-substrate-canary"]`)
  - a mounted settings content article

## Verification

- `pnpm -C frontend exec prettier --check tests/e2e/settings/settings-view-modes.spec.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-050/worktree-ai.log`
  - still failed before the motion lane
  - the failure now means the page never reached either a mounted graph surface
    or mounted settings article within `30000ms`
- fresh-context headless CDP check on
  `http://127.0.0.1:3075/settings?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8075`
  - current URL settled to `http://127.0.0.1:3075/settings`
  - `.react-flow__pane`: absent
  - `[data-testid="graph-substrate-canary"]`: absent
  - `article`: absent
  - visible state: blank settings shell with only a `Home` link

## Reading

- the old readiness wait was genuinely stale, so removing it was necessary
- the remaining blocker is not that stale wait; the live direct `/settings`
  page can settle without mounting any settings graph surface or settings
  article at all
- next frontier is to inspect why the direct authenticated `/settings`
  navigation can land on that blank shell, not to reopen the same wait helper
