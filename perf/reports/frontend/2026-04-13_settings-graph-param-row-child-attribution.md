# Settings Graph Param Row Child Attribution

Date: 2026-04-13
Worktree: `pixijs-graph`
Canonical lane: `rotaryParamCodeObjDefault`

## Change

- added three row-child canary attribution owners so the canonical lane can
  distinguish row cost inside `ParamTextLabel`, `ParamNameInput`, and
  `ParamInput`
- wrapped the label/name-input path in `ParamSwitch` and the value-input path
  in `ParamContainer` with profiler-backed attribution hooks
- extended focused unit coverage plus the shared Playwright allowlists so the
  new owners are tracked consistently by the existing canary probe

## Verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamSwitch.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
- `pnpm -C frontend exec prettier --check src/components/Params/ParamSwitch.tsx src/components/Params/ParamContainer.tsx src/components/Params/ParamSwitch.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts tests/e2e/settings/settings-view-modes.spec.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts`

## Live readout

- first worktree probe attempt on the existing runtime failed before the lane
  compare began:
  - `Worktree unhealthy: page already closed before writing normalized compare pane state`
- allowed bounded recovery:
  - restarted the current worktree with
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - refreshed runtime info to session `38a12e` on `3075` / `8075` / debug
    port `9297`
- second worktree probe attempt reached `surface_ready` again, then failed in
  compare preflight:
  - direct-open phases:
    - `90ms app_router_loading`
    - `2397ms settings_loading`
    - `3034ms app_shell_without_surface`
    - `6509ms project_loading`
    - `12262ms surface_ready`
  - failure:
    - `page.evaluate: Test timeout of 180000ms exceeded`
    - stack at `readSettingsGraphSurfacePresenceSnapshot(...)` during
      `runSettingsGraphComparePreflight(...)`
- fresh-context headless CDP smoke check: not run
  - the required Chrome DevTools MCP sub-agent reported the browser tools were
    not reachable in this session

## Reading

- the row-child attribution seam is landed and unit-covered, but this
  iteration did not produce a trustworthy live owner ranking because the
  canonical worktree probe stayed `worktree_unhealthy` after the one allowed
  lifecycle recovery
- next iteration should start from a fresh outer-loop bootstrap, rerun the
  same canonical lane, and use the newly added child owners only after the
  preflight stops timing out
