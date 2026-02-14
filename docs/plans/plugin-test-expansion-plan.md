# Plugin Test Expansion Plan

Coverage is already strong, but there are still meaningful additions.

1. Add a cross-layer source-spec contract test for `github:owner/repo@ref` vs `#ref` (`frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx:1961`, `backend/setta/plugins/manager.py:4615`).
2. Expand worker RPC transport tests for host-response failures (EOF, invalid JSON, id mismatch, missing `result`) in `tests/plugins/test_plugin_worker.py` against `backend/setta/plugins/worker.py:35`.
3. Add worker MCP invoke matrix tests (success, async success, `args` non-list, `kwargs` non-dict, missing toolName) for `backend/setta/plugins/worker.py:524`.
4. Add worker route async/body-mapping tests (async handler success/failure, required param from `jsonBody`) for `backend/setta/plugins/worker.py:460`.
5. Add manager unit tests for worker-route normalization helpers (`backend/setta/plugins/manager.py:1654`, `backend/setta/plugins/manager.py:1667`).
6. Add manager unit tests for source retarget/env mapping helpers (`backend/setta/plugins/manager.py:4998`, `backend/setta/plugins/manager.py:4304`).
7. Route integration coverage is missing for several endpoints; add success/error tests for install/uninstall/unlink/enable/rescan in `tests/routers/test_plugin_routes.py`.
8. MCP integration: deployment-mode blocking currently only checks uninstall; add install/update/rollback parity tests in `tests/mcp/test_plugin_tools.py:169`.
9. Frontend runtime unit tests should cover command/section/top-nav validation and capability-denied paths in `frontend/src/plugins/runtime.ts:467`.
10. Frontend runtime should test concurrent `refreshPluginRuntime()` dedupe and stale style cleanup (`frontend/src/plugins/runtime.ts:253`, `frontend/src/plugins/runtime.ts:1022`).
11. Playwright: add non-mocked lifecycle flow (real install/update/rollback/uninstall) instead of only intercepted responses in `frontend/tests/e2e/overview/plugins-pane.spec.ts`.
12. Playwright: add asset cache-busting regression test verifying `?v=<digest>` changes after update/relink (`backend/setta/plugins/manager.py:4913`, `frontend/src/plugins/runtime.ts:1009`).
