# Plugin Test Expansion Plan

## Findings

1. High: `backend/setta/agentic/external_adapters/plugin_process.py:153`, `backend/setta/agentic/external_adapters/plugin_process.py:193`, `backend/setta/agentic/external_adapters/plugin_process.py:204`, `backend/setta/agentic/external_adapters/plugin_process.py:214`, and `backend/setta/agentic/external_adapters/plugin_process.py:228` have important untested paths (plain-text stream fallback, stderr cap, cancel timeout/kill, approval/tool response writes, missing-stdin errors). Add unit tests plus one runner integration test for approval/tool-response flow.

2. High: force-overwrite backup history is effectively untested at `backend/setta/plugins/manager.py:4360` and `backend/setta/plugins/manager.py:4383`. Add an integration test that installs/links a plugin twice with `force=True`, asserts snapshot history is created, then rollback restores the prior snapshot.

3. High: worker JSON-RPC serialization fallback isn’t covered at `backend/setta/plugins/worker.py:777`. Add a worker test that forces a non-JSON-serializable response payload and asserts the deterministic `PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR` response body.

4. Medium: route exception mapping coverage is incomplete for several mutation endpoints at `backend/setta/routers/plugins.py:162`, `backend/setta/routers/plugins.py:173`, `backend/setta/routers/plugins.py:184`, `backend/setta/routers/plugins.py:195`, `backend/setta/routers/plugins.py:208`, `backend/setta/routers/plugins.py:242`, and `backend/setta/routers/plugins.py:253`. Add table-driven route tests that inject `PluginManagerError` for link/unlink/enable/disable/config/lock-write/lock-apply.

5. Medium: CLI plugin-validate error path is missing around `backend/setta/start.py:2220` and `backend/setta/start.py:2223`. Add a test that validates an invalid plugin folder and asserts click error mapping/output.

6. Medium (Playwright): header restart banner only has the accepted-programmatic path; add rejected/error/manual-mode coverage for `frontend/src/components/AppHeader/PluginRestartBanner.tsx:45` and `frontend/src/components/AppHeader/PluginRestartBanner.tsx:54`.

7. Medium (Playwright): fallback card actions are unit-tested but not E2E; add browser tests for `frontend/src/components/Section/Layouts/PluginArea.tsx:175`, `frontend/src/components/Section/Layouts/PluginArea.tsx:194`, and `frontend/src/components/Section/Layouts/PluginArea.tsx:216`.

8. Medium (Playwright): lifecycle failure UX in plugins pane isn’t covered; add failing-endpoint scenarios for `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx:135` and restart rejection messaging at `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx:217`.

I validated this by running the plugin-focused backend suite under trace (`216 passed`), then checking unexecuted paths in plugin modules.
