# Settings Graph Main-Reference Post-Bootstrap Setup Phases

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Slice

Added explicit probe phases around the canonical perf test setup immediately
after `bootstrapReferenceSettingsPage(referencePage)` returns so the probe can
name whether it stalls in project-config lookup, project-state fetch, target
section resolution, or pane-state capture before motion playback starts.

## Files

- `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`

## Verification

- `pnpm -C frontend exec prettier --write tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - formatted the updated spec
- `pnpm -C frontend exec prettier --check tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed after formatting
- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-011/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-011/main-ai.log`
  - progressed through:
    - `reference: bootstrap page`
    - `reference: open settings`
    - `worktree: resolve project config id`
    - `reference: resolve project config id`
    - `worktree: fetch latest project state`
    - `reference: fetch latest project state`
    - view-mode id resolution, target-section id resolution, pane-state capture
    - full reference and worktree motion-capture subphases through
      `capture motion perf: stop capture`
  - produced numeric perf output on both sides instead of stalling after
    bootstrap
  - failed on the existing perf assertion with:
    - reference average frame duration `324.43ms`
    - worktree average frame duration `51.14ms`
    - worktree dominant motion owner `pixiDrawableModelResolve`

## Reading

- The post-bootstrap setup boundary is no longer the active blocker on this
  runtime.
- This closes the current "which synchronous call stalls after bootstrap?"
  investigation lane: the probe now proves those setup steps complete and the
  test reaches numeric output.
- The next bounded frontier should be product-side perf work on the canary
  path, starting from the measured worktree motion owner
  `pixiDrawableModelResolve`, rather than another setup-phase logging pass.
