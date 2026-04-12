## 2026-04-12

- Slice: Playwright global-setup fallback for bootstrap flows that briefly land
  on frontend root and then settle on `/home`.
- Why:
  - the canonical `rotaryParamCodeObjDefault` main-reference probe was failing
    in Playwright global setup before the spec body on the current runtime
  - a direct headless bootstrap trace showed the worktree app briefly visiting
    `/?__setta_backend_origin=...` before stabilizing on `/home`
  - the existing matcher accepted the initial root landing but not the stable
    `/home` landing, so `page.waitForURL(...)` could miss the transient `/`
    state and time out even though the authenticated shell became ready
- Changed:
  - updated `frontend/tests/e2e/global-setup.ts` so the default bootstrap case
    also treats `/home` on the expected frontend origin as a valid ready URL
  - explicit non-root project-path runs remain strict
- Verification:
  - `pnpm -C frontend exec prettier --check tests/e2e/global-setup.ts`
    - passed
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-039/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-039/main-ai.log`
    - passed Playwright global setup
    - reached the canonical perf spec body
    - reference bootstrap, `open settings`, and the reference motion capture
      completed
    - current blocker remained
      `Timed out after 30000ms during settings graph probe phase: worktree: normalize compare pane state.`
- Notes:
  - no CDP check was required for this slice because it only changed the
    Playwright bootstrap matcher, not production UI behavior
