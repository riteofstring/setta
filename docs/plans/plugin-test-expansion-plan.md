# Plugin Test Expansion Plan

Coverage is strong, but there are still meaningful gaps.

## Unit tests to add

1. Worker RPC error matrix in `tests/plugins/test_plugin_worker.py` for route/mcp failures currently untested: `backend/setta/plugins/worker.py:460`, `backend/setta/plugins/worker.py:524`, `backend/setta/plugins/worker.py:35`.
2. Lockfile failure paths in `tests/plugins/test_plugin_manager.py`: missing file, invalid JSON, and missing `sourceSpec` entry in `backend/setta/plugins/manager.py:3066`.
3. Corrupt state-file handling in `tests/plugins/test_plugin_manager.py` for `PLUGIN_STATE_INVALID`, `PLUGIN_GLOBAL_STATE_INVALID`, `PLUGIN_INSTALL_METADATA_INVALID` from `backend/setta/plugins/manager.py:4525`.
4. Source/target/path safety tests in `tests/plugins/test_plugin_manager.py` for `PLUGIN_SOURCE_INVALID`, `PLUGIN_TARGET_PATH_TRAVERSAL`, `PLUGIN_TARGET_EXISTS`, `PLUGIN_SOURCE_NOT_FOUND`, and asset traversal/not-found via `backend/setta/plugins/manager.py:2575` and `backend/setta/plugins/manager.py:4615`.
5. Manifest/schema/version validation negatives in `tests/plugins/test_plugin_manager.py` for `PLUGIN_MANIFEST_PATH_NOT_FOUND`, `PLUGIN_MANIFEST_INVALID`, `PLUGIN_MANIFEST_VERSION_INCOMPATIBLE`, `PLUGIN_HOST_VERSION_INVALID` from `backend/setta/plugins/manager.py:3888`.

## Integration tests to add

1. Route coverage expansion in `tests/routers/test_plugin_routes.py` for `/plugins/config`, `/plugins/update`, `/plugins/rollback`, `/plugins/lock/write`, `/plugins/lock/apply`, plus asset 404/path-traversal mapping in `backend/setta/routers/plugins.py:199`.
2. CLI coverage expansion in `tests/start/test_start_plugins.py` for `plugins init/validate/list/install/uninstall/enable/disable/link/unlink/rescan/update/pin/rollback/restart`; currently only restart-required + lock are covered at `tests/start/test_start_plugins.py:100`.
3. MCP happy-path lifecycle coverage in `tests/mcp/test_plugin_tools.py` for successful install/update/rollback (today mostly error/deployment checks).

## Frontend unit/integration tests to add

1. Runtime refresh + network failure + status precedence tests in `frontend/src/plugins/runtime.test.ts` for `loadPluginRuntime`/`mapPrimaryStatusByPluginId` logic at `frontend/src/plugins/runtime.ts:263` and `frontend/src/plugins/runtime.ts:1043`.
2. Host API tests (`apiFetch`, path normalization, share-session header) and style lifecycle/cache-bust tests (`ensurePluginStyleLoaded`, `removeInactivePluginStyles`) at `frontend/src/plugins/runtime.ts:615` and `frontend/src/plugins/runtime.ts:973`.
3. Fallback-reason behavior test for the “healthy” path in `getPluginSectionFallbackReason` (`frontend/src/plugins/runtime.ts:1190`), since it currently always returns `frontend_load_failed` in the final branch.

## Playwright tests to add

1. Full update/rollback/uninstall flow from Plugins pane, verifying version + digest changes and restart banner behavior (`frontend/tests/e2e/overview/plugins-pane.spec.ts`).
2. Programmatic restart UX path (not just manual) using restart capability/action in UI.
3. Asset digest cache-busting validation after plugin update/relink (aligns with planned future work in `docs/plans/plugin-test-expansion-plan.md:238`).
