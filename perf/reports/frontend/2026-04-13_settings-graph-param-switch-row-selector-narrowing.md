# Settings Graph ParamSwitch Row Selector Narrowing

Date: 2026-04-13
Worktree: `pixijs-graph`
Canonical lane: `rotaryParamCodeObjDefault`

## Change

- narrowed `ParamSwitch` row subscriptions to a shallow snapshot of
  `selectedParams.includes(paramInfoId)`, `coreNameEditable`, and nested-child
  ids instead of subscribing to the full section impl and full param impl
- narrowed `ParamContainer` tooltip/name subscriptions to shallow primitive
  outputs (`description`, resolved label text) instead of subscribing to the
  full param core and full param impl

## Verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamSwitch.test.tsx src/components/Params/GetParamSwitch.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Params/ParamSwitch.tsx src/components/Params/ParamContainer.tsx src/components/Params/ParamSwitch.test.tsx`
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-002/worktree-ai.log`

## Live readout

- direct-open phases:
  - `92ms app_router_loading`
  - `2267ms settings_loading`
  - `3394ms app_shell_without_surface`
  - `6195ms project_loading`
  - `18265ms surface_ready`
- dominant owner stayed `presentedSceneSectionSubtreeReactRender`
- immediate row lane owners on this run:
  - `presentedSceneSectionParamDndListRowsReactRender`: `519.2ms` total,
    `67.9ms` max
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`: `555.2ms`
    total, `69.4ms` max
  - `presentedSceneSectionParamDndListDuplicateIndexResolve`: `3.6ms` total,
    `0.6ms` max
- broader subtree owners on this run:
  - `presentedSceneSectionSubtreeReactRender`: `1124.2ms` total,
    `318.9ms` max
  - `presentedSceneSectionBodySubtreeReactRender`: `1100.8ms` total,
    `143.4ms` max

## Reading

- this was another non-winning product hypothesis on the canonical lane
- keep the selector narrowing because the row now ignores unrelated section and
  code-object commits under focused unit coverage
- close `ParamSwitch`/`ParamContainer` broad-selector narrowing as the current
  hotspot answer until fresh owner traces point back here
