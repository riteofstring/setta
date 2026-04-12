# Settings Graph Mounted Body Content Memo Boundary

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section body content

## Goal

Keep mounted section body content out of parent shell rerenders when the body
props stay stable, instead of re-running the body branch just because the
section shell re-rendered during motion.

## Change

- updated
  `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  so:
  - `AreaSwitch` is memoized
  - `CanvasSectionBody` is memoized
- updated
  `frontend/src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  with a regression proving a parent-only rerender (`hasSectionStyleTheme`
  change with stable body props) does not re-render the mounted `CodeArea`
  body

## Why This Slice

- the active handoff named `presentedSceneSectionBodyContentReactRender` as the
  next inner owner after the header/body split
- this stays inside the mounted body-content branch instead of reopening header
  cleanup or another probe-only iteration
- the slice removes one broad parent-to-body rerender path without changing
  body behavior or ownership

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  - passed (`4` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-051/worktree-ai.log`
  - first run failed with `Worktree unhealthy: page already closed before writing normalized compare pane state`
  - recovered once with
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    and refreshed runtime info with
    `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-051/worktree-ai.log`
  - rerun passed (`1` Playwright test, `1.8m`)

## Readout

- direct-open phase sequence on the recovered worktree:
  - `72ms app_router_loading`
  - `2328ms settings_loading`
  - `3368ms app_shell_without_surface`
  - `6667ms project_loading`
  - `12594ms surface_ready`
- canonical target stayed `rotaryParamCodeObjDefault`
- worktree canary reached `surfaceKind: "canary"`
- dominant outer owner remained
  `presentedSceneSectionSubtreeReactRender`
  - `939.1ms` total, `297.9ms` max, `30` commits
- mounted body-content split after this change:
  - `presentedSceneSectionBodyContentReactRender`
    - `583.0ms` total, `85.0ms` max, `24` commits
  - `presentedSceneSectionHeaderReactRender`
    - `216.1ms` total, `34.2ms` max, `24` commits
  - `presentedSceneSectionBodySubtreeReactRender`
    - `920.8ms` total, `115.0ms` max, `32` commits

## Reading

- this is a real mounted body-content production cut, not a harness-only pass
- the focused regression proves the memo boundary works for parent-only
  rerenders with stable body props
- the live canonical probe did not move the dominant owner family and the
  measured body-content totals were slightly worse than the prior split run, so
  this should be treated as a bounded non-winning hypothesis on the body
  content lane
- the next pass should add one more inner attribution seam inside the mounted
  code/body-content branch before taking another production hypothesis
