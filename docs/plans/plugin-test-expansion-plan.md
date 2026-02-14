# Plugin Test Expansion Plan

Coverage is strong, but there are still high-value additions.

1. High: add a regression test for GitHub `@ref` retargeting in `backend/setta/plugins/manager.py:5015`.
Current behavior turns `github:acme/plugin@main` + `to=v2` into `github:acme/plugin@main#v2`; test should require replacing the ref, not appending.

2. High: expand manager codegen failure-path tests in `backend/setta/plugins/manager.py:649` and `backend/setta/plugins/manager.py:2451`.
You currently cover success + unknown target; add malformed generation payload cases (`files` missing, traversal/absolute paths, duplicate paths, non-string content, empty files).

3. High: add manager rollback edge tests in `backend/setta/plugins/manager.py:2962`.
Missing coverage for `no history`, `missing snapshot path`, and restart-required behavior when rolling back backend plugins.

4. Medium: add lockfile uninstall-branch tests in `backend/setta/plugins/manager.py:3115`.
`apply_lockfile` has uninstall planning/execution paths that are not deeply asserted today.

5. Medium: expand worker transport/parser tests for `backend/setta/plugins/worker.py:795`.
Missing direct tests for invalid JSON input, non-object JSON-RPC payload, non-string method, and startup arg validation (`missing plugin id/version`, missing entrypoint).

6. Medium: expand worker registration contract tests in `backend/setta/plugins/worker.py:192`, `backend/setta/plugins/worker.py:257`, `backend/setta/plugins/worker.py:327`, `backend/setta/plugins/worker.py:758`.
Add invalid router type, invalid MCP annotations payload, duplicate/invalid codegen target definitions, and `register_startup_task`/`register_shutdown_task` unsupported paths.

7. Medium: add frontend runtime host-API behavior tests in `frontend/src/plugins/runtime.ts:558`, `frontend/src/plugins/runtime.ts:578`, `frontend/src/plugins/runtime.ts:603`.
`registerContextMenu`, `openArtifact`, `createArtifact`, `readSection`, `updateSection`, and `subscribeProjectContext` are mostly untested.

8. Medium: add selector/sort tests for plugin runtime views in `frontend/src/plugins/runtime.ts:1096`, `frontend/src/plugins/runtime.ts:1128`, `frontend/src/plugins/runtime.ts:1149`.
`usePluginPaneTabs`, `usePluginCommands`, `usePluginTopNavBarItems`, `usePluginListEntries` ordering/tie-breaks are not directly covered.

9. Playwright: add a real (non-intercepted) update/rollback lifecycle flow for plugins.
`frontend/tests/e2e/overview/plugins-pane.spec.ts:468` covers mocked update/rollback; only enable/disable/uninstall currently hit real backend.

10. Playwright: add multi-scope shadowing UI flow (workspace vs environment/global) in `frontend/tests/e2e/overview/plugins-pane.spec.ts`.
Validate status table visibility for shadowed copies and scope-specific uninstall behavior.
