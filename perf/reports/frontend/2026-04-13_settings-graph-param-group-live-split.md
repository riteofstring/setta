# Settings graph ParamGroupContainer live split

Date: 2026-04-13
Canonical lane: `settings` -> `All Settings` -> `rotaryParamCodeObjDefault`
Command:

```bash
env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 \
  ./scripts/run-settings-graph-worktree-probe.sh \
  --worktree . \
  --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-011/worktree-ai.log
```

## Goal

Use the existing `ParamGroupContainer` attribution split on the live canonical
 lane to identify whether the remaining Dict-path cost sits in pinned params,
 unpinned params, or fixed chrome around them.

## Result

- Probe status: passed (`1` Playwright test, `1.3m`)
- Canonical target stayed `rotaryParamCodeObjDefault`
- Surface kind: `canary`
- Direct-open phases:
  `45ms app_router_loading` -> `2330ms settings_loading` ->
  `3872ms app_shell_without_surface` -> `7701ms project_loading` ->
  `18813ms surface_ready`
- Motion window: `1930.7ms`
- Average frame duration: `43.56ms`
- Max frame duration: `466.6ms`
- Long tasks: `5`, total `1279ms`, max `459ms`
- Dominant owner still remained `presentedSceneSectionSubtreeReactRender`
  (`989.3ms total`, `257.3ms max`)

## ParamGroupContainer live split

- `presentedSceneSectionParamGroupContainerReactRender`:
  `24` count / `579.3ms` total / `91.0ms` max
- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`:
  `24` count / `517.1ms` total / `88.8ms` max
- `presentedSceneSectionParamDndListRowsReactRender`:
  `24` count / `485.9ms` total / `85.5ms` max
- `presentedSceneSectionParamInputReactRender`:
  `82` count / `254.9ms` total / `10.4ms` max
- `presentedSceneSectionParamGroupPinnedParamsReactRender`:
  `16` count / `1.1ms` total / `0.3ms` max
- `presentedSceneSectionParamGroupEdgesStripReactRender`:
  `16` count / `2.3ms` total / `0.3ms` max

## Reading

- The remaining Dict-path motion cost is overwhelmingly in the unpinned params
  subtree, not in pinned params or the edge-strip chrome.
- The live owner shape now points at the unpinned `ParamDndList` / row path as
  the next meaningful product frontier.
- Pinned-param and edge-strip work are too small on this lane to justify a
  default optimization pass without fresh contrary evidence.
