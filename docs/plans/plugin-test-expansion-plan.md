# Plugin Test Expansion Plan

Coverage is already strong, and the items in `docs/plans/plugin-test-expansion-plan.md` appear to be implemented now.

1. `[Unit]` Add `init_plugin_template` coverage for `template="backend"` and `template="content"` (`backend/setta/plugins/manager.py:3207`). Current tests only hit `frontend`/`full`.
2. `[Unit]` Verify uninstall/unlink clears persisted plugin config (`backend/setta/plugins/manager.py:4466`) after a prior `write_plugin_config` (`backend/setta/plugins/manager.py:2889`).
3. `[Unit]` Assert MCP tool metadata propagation from `annotations.accessType` (`backend/setta/plugins/manager.py:1930`) using `get_tool_access` (`backend/setta/mcp/tool_metadata.py:149`).
4. `[Unit]` Add concurrency test for per-plugin worker request locking (`backend/setta/plugins/manager.py:910`) to ensure same-plugin parallel requests serialize safely.
5. `[Integration]` Add route-proxy tests for non-JSON request bodies and `HEAD`/`OPTIONS` semantics (`backend/setta/plugins/manager.py:1572`, `backend/setta/plugins/manager.py:1592`).
6. `[Integration]` Add `update_plugin(to=...)` persistence test to verify retargeted source is reflected in install metadata and status (`backend/setta/plugins/manager.py:2915`).
7. `[Integration]` Add precedence test for package-manager discovered plugins vs filesystem plugins across scopes (`backend/setta/plugins/manager.py:88`, `backend/setta/plugins/manager.py:3534`).
8. `[Playwright]` Add deployment-mode `apiFetch` test validating `X-Share-Session-Id` forwarding in-browser (`frontend/src/plugins/runtime.ts:635`).
9. `[Playwright]` Add style lifecycle check to verify plugin `<link>` elements are removed on disable/unlink/rescan (`frontend/src/plugins/runtime.ts:993`, `frontend/src/plugins/runtime.ts:1042`).
10. `[Playwright]` Extend config editor E2E to verify config persists across reload and plugin re-enable (`frontend/tests/e2e/overview/plugin-config-editor.spec.ts`).
