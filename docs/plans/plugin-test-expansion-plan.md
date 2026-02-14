# Plugin Test Expansion Plan

Coverage is already strong (the earlier plugin-gap plan is mostly implemented), but there are still good additions.

1. High: add unit tests for backend worker transport edge paths in `backend/setta/plugins/manager.py:1106` and `backend/setta/plugins/manager.py:1141`. `stdin`/`stdout` missing, non-JSON payload, non-object payload, invalid `error` payload, missing `result`, and write `OSError` are important untested failure branches.

2. High: add unit tests for malformed worker host registration payloads in `backend/setta/plugins/manager.py:1515`, `backend/setta/plugins/manager.py:1711`, and `backend/setta/plugins/manager.py:1738`. Current tests cover happy-path backend registration well, but not bad `routes`/`urlPrefix`/`toolName` payloads from workers.

3. High: add direct unit tests for `ExternalAgentAdapterRegistry` invariants in `backend/setta/agentic/external_adapters/registry.py:21`. Missing plugin adapter id, duplicate plugin adapter id, wrong tool type, lookup without plugin id, unsupported run mode.

4. Medium: add unit tests for plugin process `start_run` contract in `backend/setta/agentic/external_adapters/plugin_process.py:51` and `backend/setta/agentic/external_adapters/plugin_process.py:243`. Validate emitted start envelope fields and command override precedence (`context.config.commandPath` vs adapter command).

5. Medium: expand deployment-mode route gating coverage. `tests/routers/test_plugin_routes.py:304` checks one mutation route; all mutation routes are gated in `backend/setta/routers/plugins.py:122` through `backend/setta/routers/plugins.py:253`. A parameterized 403 test for all mutation endpoints would prevent accidental dependency removal.

6. Medium: add integration test for restart callback exceptions. `backend/setta/routers/plugins.py:116` + `backend/setta/plugins/manager.py:716` has no explicit mapping if callback raises. A test would lock desired behavior (500 vs mapped error).

7. Medium: add frontend unit coverage for untested runtime exports in `frontend/src/plugins/runtime.ts:244`, `frontend/src/plugins/runtime.ts:1095`, and `frontend/src/plugins/runtime.ts:1206`. `usePluginRuntimeBootstrap`, `usePluginSectionKind`/`usePluginSectionKinds`, and `usePluginStatusEntries` don’t appear directly asserted today.

8. Medium: add Playwright cleanup/regression tests for plugin UI teardown. Current top-nav test is positive-only in `frontend/tests/e2e/overview/plugin-topnav.spec.ts:1`; add disable/unlink + rescan assertions that top-nav items and pane buttons disappear and don’t leave stale UI.

9. Medium: add a Playwright large-list plugins-pane performance guardrail for `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx:71`. Mock 200–500 plugin entries and assert render/interactions remain responsive (structural metric or stable timing bound).
