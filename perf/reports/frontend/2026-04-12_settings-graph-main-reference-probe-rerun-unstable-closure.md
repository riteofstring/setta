# Settings graph main-reference probe rerun: unstable lane closure

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Use the fresh post-reduction canonical rerun to decide whether the next default
iteration should keep following the cross-worktree main-reference probe or
close that lane and return to worktree-side product attribution.

## Result

- Fresh rerun command:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-045/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-045/main-ai.log`
- Runtime facts resolved correctly for both worktree and read-only `main`:
  - worktree frontend/backend: `http://127.0.0.1:3075/` / `http://127.0.0.1:8075`
  - reference frontend/backend: `http://127.0.0.1:3087/` / `http://127.0.0.1:8087`
- The probe still failed before the canonical spec body in Playwright global
  setup:
  - `page.waitForURL(...)` timed out after bootstrap
  - observed navigation stopped at
    `http://127.0.0.1:3075/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8075`
  - the page never advanced to the expected post-bootstrap app route

## Reading

- This was the allowed fresh attribution rerun after the recent
  `interactionReactFlowStateSync` reductions, and it still did not produce a
  numeric canonical verdict.
- Per the current lane-budget and sequencing rules, this closes the
  cross-worktree probe lane as unstable for default iteration flow on the
  current runtime rather than justifying another setup-only pass.
- The next default frontier should return to worktree-side product attribution:
  either a worktree-only measurement path that does not depend on the unstable
  cross-worktree bootstrap/global-setup route, or the next measured mounted
  subscriber inside `interactionReactFlowStateSync`.
