# Plugin Test Expansion Plan

Coverage is already strong, but these additions are still worth adding.

1. `[Unit]` Add `response id mismatch` coverage for worker RPC replies in `backend/setta/plugins/manager.py:993`. You already test nearby contracts in `tests/plugins/test_plugin_manager.py:3979`, but not this mismatch branch.
2. `[Unit]` Expand transport-read failure coverage in `backend/setta/plugins/manager.py:1150` and `backend/setta/plugins/manager.py:1165` for `stdout=None`, timeout, and EOF with stderr detail. Current tests around `tests/plugins/test_plugin_manager.py:3917` only cover invalid JSON/non-object payloads.
3. `[Unit]` Add normalization cases for route prefixes in `backend/setta/plugins/manager.py:1874` (`None`, `""`, `"/"`, `"foo"`, `"/foo"`). I don’t see direct tests for this helper.
4. `[Unit]` Add frontend runtime error-path tests for missing section variant/impl in `frontend/src/plugins/runtime.ts:585` and `frontend/src/plugins/runtime.ts:599`. Existing update tests in `frontend/src/plugins/runtime.test.ts:1051` and `frontend/src/plugins/runtime.test.ts:1085` cover non-plugin + happy path, but not missing-state branches.
5. `[Integration]` Add backend route-proxy error mapping tests for `backend/setta/plugins/manager.py:1572` branches: worker unavailable `503`, worker exception `502`, non-object response `502`, and non-int `statusCode` fallback to `200`.
6. `[Integration]` Add MCP lifecycle scope-alias coverage for `scope="environment"` in `backend/setta/mcp/tools/plugins.py:24` (install/update/rollback/uninstall). Current MCP tests in `tests/mcp/test_plugin_tools.py:221` are workspace-only.
7. `[Playwright]` Add a real plugin-host `apiFetch` roundtrip test for `frontend/src/plugins/runtime.ts:635` (path normalization + request headers). Today this behavior is unit-tested with mocked `fetch` in `frontend/src/plugins/runtime.test.ts:841`, but not verified in-browser end-to-end.
8. `[Playwright]` Add a plugin backend route payload test (query params + JSON body passthrough) to validate manager proxy serialization in `backend/setta/plugins/manager.py:1589` and `backend/setta/plugins/manager.py:1607` through the actual UI/runtime path.
