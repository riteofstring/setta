# Settings Graph Param Input Stable ParamUI Props

Date: 2026-04-13
Worktree: `pixijs-graph`
Canonical lane: `rotaryParamCodeObjDefault`

## Change

- stabilized the `ParamInput` callback props passed into `ParamUI`
  (`onChange`, `onRevealPassword`, `onDropzoneStateless`) so parent churn does
  not force new handler identities through the hot input subtree
- wrapped `ParamUI` in `React.memo(...)` and stabilized its `onEscape`
  callback so unchanged value-input props can bail out before rebuilding the
  selected control path
- added a focused jsdom regression proving the code/text input subtree stays
  out of parent rerenders when its effective props are unchanged, while still
  rerendering when the value changes

## Verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamUIs/ParamUI.test.tsx src/components/Params/ParamSwitch.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Params/ParamItems/ParamInput.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.test.tsx`

## Live readout

- pre-change canonical baseline from the fresh outer-loop bootstrap:
  - `presentedSceneSectionParamInputReactRender`
    `244.1ms` total / `8.3ms` max / `82` renders
  - dominant owner remained `presentedSceneSectionSubtreeReactRender`
    at `929.5ms` total / `246.3ms` max
- post-change probe attempts did not yield a trustworthy comparison:
  - first worktree probe attempt on the existing runtime timed out with
    `Worktree unhealthy: page already closed before writing normalized compare pane state`
  - allowed bounded recovery:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    restarted the worktree to session `fdaf7d` on `3075` / `8075`
  - second worktree probe attempt on the refreshed runtime reached
    `surface_ready` (`11636ms`) and then timed out in
    `readSettingsGraphSurfacePresenceSnapshot(...)` during
    `runSettingsGraphComparePreflight(...)`

## Reading

- the production cut is landed and unit-covered, but the canonical
  post-change measurement is still blocked by unstable worktree preflight on
  the live compare helper
- next iteration should resolve the repeated
  `readSettingsGraphSurfacePresenceSnapshot(...)` / page-close probe-health
  failure before making another row-child product guess on this lane
