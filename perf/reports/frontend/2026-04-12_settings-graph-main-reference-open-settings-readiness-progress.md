# Settings Graph Main-Reference Open-Settings Readiness Progress

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Slice

Replace the opaque read-only `main` `reference: open settings` readiness poll
with an explicit progress tracker that records milestone timing and emits the
last snapshot on timeout.

## Files

- `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`

## Verification

- `pnpm -C frontend exec prettier --check tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-008/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-008/main-ai.log`
  - progressed past `reference: open settings`
  - logged readiness transitions:
    - `91ms`: pathname `/settings`, titlebar attached, graph surface absent,
      settings content absent, `projectIsLoading=false`
    - `1644ms`: graph surface absent, settings content absent,
      `projectIsLoading=true`
    - `25028ms`: graph surface mounted, settings content mounted,
      `projectIsLoading=false`, `legacyPaneCount=1`, `visibleArticleCount=323`
  - later failed on the existing perf assertions:
    - reference average frame duration `40.37ms` (`< 40ms` threshold)
    - worktree average frame duration `48.11ms` (`< 40ms` threshold)

## Reading

- The current reference blocker is no longer an opaque readiness timeout.
- On this runtime, read-only `main` reaches mounted `All Settings` in about
  `25s`, so the canonical lane is back to a measurable perf-threshold failure.
- The next bounded product slice should target the actual measured perf owners
  rather than add another reference-startup probe pass.
