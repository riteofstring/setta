## Summary

Land one bounded Playwright bootstrap fix so the canonical
`rotaryParamCodeObjDefault` main-reference probe reaches the actual motion lane
instead of failing in global setup after bootstrap already lands on the
frontend root.

## What changed

- Updated `frontend/tests/e2e/global-setup.ts` to treat the post-bootstrap URL
  as already ready when the page is already on the expected frontend
  origin+pathname.
- Kept the existing `.setta-titlebar-offset` readiness gate after the URL check,
  so global setup still waits for the React shell rather than accepting a raw
  redirect alone.

## Verification

- `pnpm -C frontend exec prettier --check tests/e2e/global-setup.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-038/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-038/main-ai.log`
  - the probe now passed global setup and reached the spec body
  - reference bootstrap and `open settings` both completed
  - the next blocker moved to the live worktree probe phase:
    `Timed out after 30000ms during settings graph probe phase: worktree: normalize compare pane state.`

## Reading

- This iteration intentionally stops after clearing the bootstrap gate because
  the next blocker is a different lane: live worktree compare-pane
  normalization after the spec has already started.
- The next bounded pass should inspect the worktree-side compare-pane
  normalization path directly rather than reopening Playwright auth/bootstrap.
