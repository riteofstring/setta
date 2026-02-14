# Plugin Test Expansion Plan

Coverage is already strong; net-new gaps to add are:

## Unit tests

1. `tests/plugins/test_plugin_manager.py`: exercise `apply_lockfile` “digest reconcile” path (same version, different `sourceDigestSha256`) in both `check=True` and apply mode (`backend/setta/plugins/manager.py`).
2. `tests/plugins/test_plugin_manager.py`: package-manager discovery failure branches for environment distributions with multiple `setta.plugin.json` files and invalid manifests (`backend/setta/plugins/manager.py`).
3. `tests/plugins/test_plugin_worker.py`: worker host-RPC error payload edge cases (error payload with non-string code/message) and non-JSON-serializable payload rejection paths (`backend/setta/plugins/worker.py`).
4. `tests/plugins/test_plugin_worker.py`: async `register(plugin)` rejection and invalid `handshake.override.json` payload shapes (`backend/setta/plugins/worker.py`).
5. `frontend/src/plugins/runtime.test.ts`: positive `updateSection` path for plugin sections (data/kind/schemaVersion updates + clone behavior), not just rejection path.

## Integration tests

1. `tests/plugins/test_plugin_manager.py`: backend plugin `update_plugin(...)` should always mark `pending_restart`; frontend-only update should not.
2. `tests/routers/test_plugin_routes.py`: asset route for unknown plugin id (`PLUGIN_NOT_FOUND`) and restart route when programmatic callback rejects.
3. `tests/start/test_start_plugins.py`: CLI scope-flag conflict errors (`--scope` + shortcut flags, or multiple shortcut flags) via `_plugin_scope_choice_to_value` behavior in real CLI commands.

## Playwright tests

1. `frontend/tests/e2e/overview/plugins-pane.spec.ts`: real (non-mocked) update + rollback lifecycle using local fixture artifacts (current update/rollback UI test is mocked).
2. `frontend/tests/e2e/overview/plugin-external-agent.spec.ts`: real backend registration flow (no `/api/plugins/status` interception), then select adapter in AI settings.
3. `frontend/tests/e2e/overview/plugin-codegen-target.spec.ts`: real plugin codegen target registration end-to-end (no synthetic status injection).
4. `frontend/tests/e2e/overview/plugin-sections-large-dom.spec.ts`: add lightweight perf guardrails for large DOM updates (e.g., bounded re-render/fanout indicators, not fragile timing thresholds).
