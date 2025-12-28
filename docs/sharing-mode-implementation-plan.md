# Sharing Mode Implementation Plan

This document translates `docs/sharing-mode-plan.md` into concrete implementation
steps based on the current code layout.

## Notes on current codebase constraints
- Auth is enforced on all HTTP routes (`backend/setta/middleware/auth.py`) and
  websockets (`backend/setta/routers/websocket.py`). Share endpoints will need
  explicit exemptions or a separate share app if public-by-default sharing is
  desired.
- `ProjectManager.save()` strips JSON source values and writes them into
  JSON source files (`backend/setta/project_state/project_manager.py`,
  `backend/setta/project_state/jsonSource/save.py`). A deployment export must
  include those JSON source files (and rebase their paths) or values will be
  missing from the snapshot.
- Code file bindings point at canonical paths (`backend/setta/project_state/project_code.py`,
  `backend/setta/project_state/code_files.py`). If share deployments need to be
  self-contained, export code files and rebase bindings.
- `SettingsFile.load_settings()` creates default files when missing
  (`backend/setta/database/settings_file.py`). Share mode should avoid writing
  settings, or include a settings snapshot in the deployment.
- Artifact caches are populated by file watchers; `get_cached_*` does not read
  from disk (`backend/setta/project_state/artifacts.py`). If share mode disables
  watchers, add a one-time load path or a separate cache strategy.
- The doc currently calls out both `backend/setta/types/share_deployment.py` and
  `backend/setta/types/share_policy.py` for `SharePolicy`. Prefer a single source
  of truth to avoid divergence.

## 1) Share deployment data model + constants
Status: completed. Implemented in `backend/setta/types/share_deployment.py`, added
`C.SHARE_DEPLOYMENTS_FOLDER`/`C.SHARE_RUNS_FOLDER`, and registered share routes
in `backend/setta/types/routes.py`.
- Create Pydantic models in `backend/setta/types/share_deployment.py` for:
  - `ShareDeploymentManifest` (version, projectConfigId, createdAt, listener config).
  - `SharePolicy` (allowParamChanges, allowVariantChanges, allowLayoutChanges, allowRun, allowLLM, allowMCP, runSnapshotMode, listenerIsolation, allowedSections).
  - `ShareDeploymentMetadata` (deployment id, path, policy path).
  - `ShareDeploymentSessionResponse` (deployment id, session id, config id, policy, manifest).
- Add constants in `backend/setta/utils/constants.py`:
  - `SHARE_DEPLOYMENTS_FOLDER = C.SETTA_FILES_FOLDER / "share_deployments"`.
  - `SHARE_RUNS_FOLDER = C.SETTA_FILES_FOLDER / "share_runs"`.
- Add route entries in `backend/setta/types/routes.py` for share APIs and websockets
  (for example `/share/deployments`, `/share/deployments/{deploymentId}/session`,
  `/share/deployments/{deploymentId}/state`, `/share/frontend`).

## 2) Publish share deployment (IDE mode)
Status: completed. Implemented in `backend/setta/routers/share_deployments.py`.
- Add a new router in `backend/setta/routers/share_deployments.py` with endpoints:
  - `route_publish_share_deployment` (inputs: projectConfigId, policy overrides).
  - `route_list_share_deployments` / `route_get_share_deployment` as needed.
- Implementation details:
  - Use `ProjectManager` from `backend/setta/project_state/project_manager.py` to
    flush code (`_flush_code_files_for_all_configs`) before exporting.
  - Read project state from `DBE.read_project()` in `backend/setta/database/db_objs.py`.
  - Copy referenced artifacts from `setta_files/artifacts` into the deployment
    root under `artifacts/`, and rebase artifact paths in the exported
    `project.json` if necessary.
  - Copy JSON source files into `json_sources/` and rebase `variant.name` paths.
  - Copy code files into `code/` and rebase `CodeFileBinding.canonical_path`.
  - Copy listener entrypoint (if present) into `listener/` inside the deployment.
  - Write `project.json`, `manifest.json`, and `share_policy.json`.
  - Avoid any writes back to the developer workspace state.

## 3) Share runtime server/state
Status: in progress. Share runtime boots with a mode flag and deployment root, and skips IDE-only services.
- Introduce a share mode flag (env or CLI) and branch in
  `backend/setta/server_state.py` or add a `backend/setta/share_server.py`.
- Create a share-specific state that:
  - Loads from a deployment root (not `C.SETTA_FILES_FOLDER`).
  - Skips `SpecificFileWatcher`, LSP startup, MCP, and LLM watchers unless allowed.
  - Initializes a share session store and share project manager.
- Ensure share routers are included in `backend/setta/server.py` so endpoint
  generation in `frontend/generation/convert_endpoints.py` can see them.
Implemented:
- Share mode flag + deployment root resolution via `SETTA_SHARE_MODE`,
  `SETTA_SHARE_DEPLOYMENT_ROOT`, and `SETTA_SHARE_DEPLOYMENT_ID` in
  `backend/setta/utils/constants.py`.
- `backend/setta/server.py` now constructs `SettaFastAPIState` with share mode.
- `backend/setta/server_state.py` branches share initialization, loads from the
  deployment root, and skips watchers/LSP/MCP/LLM boot.
- `backend/setta/server_state.py` initializes `WMHFrontendReceiver` in share mode
  for share websocket traffic.
- `backend/setta/server_state.py` wires `ShareListenerRuntime` and a share-mode
  `WMHPythonScriptReceiver` for listener websocket traffic.

## 4) Share project manager + per-viewer overlays
Status: completed. Per-viewer overlays, manifest selection, session dependencies, and share run root overrides are implemented.
- Implement `ShareProjectManager` in `backend/setta/project_state/share_project_manager.py`:
  - `load_initial_state` reads `project.json` from the deployment root.
  - `save` is a no-op (share mode is read-only for persistence).
  - `watch_json_source_files`, `watch_artifact_files`, `watch_code_files` are no-ops.
  - Override `update` to avoid writing canonical files or touching LSPs.
  - Override `create_run_command` to use a share run root (see step 8).
- Add `ShareSessionStore` in `backend/setta/share/session_store.py`:
  - Methods: `create_session`, `get_session`, `update_session`, `touch_session`,
    `delete_session`, and TTL cleanup.
  - Implement `MemorySessionStore` (default) and a `RedisSessionStore` stub.
- Add a dependency in `backend/setta/routers/dependencies.py` to resolve the
  share session id from header/cookie/query and to load the per-viewer overlay.
- Keep explicit KeyError checks for missing sessions/ids (no `.get` side effects).
Implemented:
- `backend/setta/project_state/share_project_manager.py` loads `project.json`,
  consumes optional `manifest.json`, selects the share project config, and
  manages per-viewer overlay state in memory.
- `ShareProjectManager` keeps persistence/watchers as no-ops and only validates
  state on updates.
- `ShareProjectManager` tracks per-session artifacts and applies listener emits,
  broadcasting project state/artifact updates to the correct session(s).
- `ShareProjectManager` applies listener isolation defaults from `manifest.json`
  when present.
- `backend/setta/routers/dependencies.py` resolves share session ids from
  header/cookie/query and exposes session/overlay dependencies.
- `backend/setta/share/session_store.py` provides `MemorySessionStore` and a
  `RedisSessionStore` stub.
- `backend/setta/routers/share_deployments.py` provides share session creation
  and per-session state fetch endpoints.

## 5) Policy enforcement
Status: completed. Share policy is loaded from `share_policy.json` and enforced
across share mode mutations.
- Use `SharePolicy` from `backend/setta/types/share_deployment.py`.
- Load the share policy in `backend/setta/project_state/share_project_manager.py`
  and in the enforcement helpers (`backend/setta/share/policy.py`).
- Enforce policy in share routes and listeners:
  - Params: `route_change_param_impl`, `route_update_param_impl_config`,
    `route_set_param_entered_value` in `backend/setta/routers/project_manager.py`.
  - Variants/view modes: create/delete/toggle variants + view mode edits in
    `backend/setta/routers/project_manager.py`.
  - Layout: move/resize/viewport/column widths and layout/view toggles in
    `backend/setta/routers/project_manager.py`.
  - Run/terminals: `route_run_code`, `route_kill_subprocesses`,
    `route_delete_terminals`, and terminal websocket in
    `backend/setta/routers/terminals.py`.
  - Listener emits: `apply_listener_emit_updates` in
    `backend/setta/project_state/base_project_manager.py`.
  - LLM routes: `backend/setta/routers/ai.py` + `backend/setta/routers/llm.py`.
  - `allowedSections` is enforced for section-scoped mutations.
- Return 403 with a clear message; emit a UI log event via
  `backend/setta/websockets/msg_handlers/frontend_sender.py`.
Implemented:
- Policy violations broadcast to the active share session (or all share
  sessions if the request is not session-scoped).
- Run and LLM routes also block when share runtime services are not initialized.

## 6) Websocket scoping + realtime events
Status: completed. Share websocket sessions are scoped end-to-end.
- Extend `backend/setta/types/websocket.py` to include optional `shareSessionId`
  on `WebsocketConnectionInfo`.
- Update `backend/setta/websockets/websocket_manager.py`:
  - Store session id on connect.
  - Add a `broadcast_to_session` helper for share mode.
- Update `WMHFrontendSender` to use session-scoped broadcasts in share mode.
- Update `WMHFrontendReceiver` to require a share session handshake and to pass
  the session id through realtime events.
- Update `backend/setta/websockets/realtime_event_hub.py` to key sequences by
  `(project_config_id, share_session_id)`.
Implemented:
- `backend/setta/types/websocket.py` adds `shareSessionId` to
  `WebsocketConnectionInfo`.
- `backend/setta/websockets/websocket_manager.py` stores the session id on
  connect, exposes `broadcast_to_session`, and includes session ids in
  `WebsocketMsgAllConnections`.
- `backend/setta/websockets/msg_handlers/frontend_sender.py` sends session-scoped
  broadcasts in share mode.
- `backend/setta/websockets/msg_handlers/frontend_receiver.py` requires a share
  session id in share mode and forwards it to realtime events.
- `backend/setta/websockets/realtime_event_hub.py` keys sequences by
  `(project_config_id, share_session_id)` and passes session ids through.
- `backend/setta/routers/websocket.py` passes share session ids on connect and
  adds the `/share/frontend` websocket route.

## 7) Listener runtime + isolation
Status: in progress. Listener runtime, session scoping, and share-mode listener
websocket handling are implemented; remaining work is frontend UX.
- Add `backend/setta/share/listener_runtime.py` to load and run
  `listener/app.py` from the deployment root.
- Implement isolation modes:
  - `per_viewer`: one listener instance per share session.
  - `shared`: one listener instance per deployment.
- Extend `backend/setta/websockets/listener_registry.py` to index registrations
  by session id; filter emits in `WMHPythonScriptSender` and updates in
  `WMHPythonScriptReceiver`.
- Ensure listener emits update the correct per-viewer overlay via
  `BaseProjectManager.apply_listener_emit_updates`.
Implemented:
- `backend/setta/share/listener_runtime.py` loads the share listener entrypoint
  and runs `SettaListener` instances per session or shared, depending on
  `SharePolicy.listenerIsolation`.
- `backend/setta/api/listener.py` appends `shareSessionId` to listener websocket
  URLs when provided.
- `backend/setta/routers/websocket.py` ensures share session state exists and
  starts the share listener runtime on frontend connections; listener websockets
  accept optional share session ids and enforce `per_viewer` requirements.
- `backend/setta/routers/listener.py` scopes listener coverage snapshots to the
  share session in share mode.
- `backend/setta/websockets/listener_registry.py` stores share session ids per
  websocket and filters project registrations/sockets by session.
- `backend/setta/websockets/msg_handlers/python_script_receiver.py` handles
  share-mode listener init/register/emit flows, uses share session state and
  artifacts, and broadcasts listener coverage snapshots per session.
- Shared-mode listener emits resolve dependency updates per session before
  applying to all overlays.
- `backend/setta/websockets/msg_handlers/python_script_sender.py` filters listener
  notifications by share session and resets realtime sequences per session.
- `backend/setta/share/listener_runtime.py` drops per-session modules on stop to
  avoid accumulating `sys.modules` entries.

## 8) Run flow changes
Status: completed. Run snapshot mode, share run roots, and TTL cleanup are implemented.
- Add run snapshot mode (`always`/`ephemeral`/`never`) to
  `backend/setta/types/settings_state.py` or the share policy.
- Override `create_run_command` in share mode to write into
  `setta_files/share_runs/<deployment>/<session>/<timestamp>`.
- Add TTL cleanup (background task) for share run output.
- Gate run and terminal endpoints in `backend/setta/routers/terminals.py`
  against `SharePolicy.allowRun`.
Implemented:
- Run/terminal HTTP routes + terminal websocket are blocked when
  `allowRun` is false.
- Run/terminal routes also block if the share runtime did not initialize
  terminal services.
- Added `RunSnapshotMode` to settings + share policy, and use it in IDE/share
  run command creation.
- Share run output writes to `setta_files/share_runs/<deployment>/<session>/<timestamp>`
  and uses per-session snapshots or canonical files based on snapshot mode.
- Share run output cleanup runs in the background for ephemeral snapshots.

## 9) LLM + MCP gating
Status: in progress. Share boot skips MCP/LLM; LLM policy gating is done; per-viewer chat store and MCP gating remain.
- Add share policy flags `allowLLM` and `allowMCP` (default false).
- In share mode initialization, skip `SettaFastMCP`, `MultiMCPClient`, and
  `LLMChatManager` unless enabled.
- Add an in-memory chat store keyed by share session id so chats are not written
  to `setta_files/chats`.
- Block `/llm/config` and `/llm/apiKeys` updates in share mode.
Implemented:
- LLM routes in `backend/setta/routers/ai.py` and `backend/setta/routers/llm.py`
  are blocked when `allowLLM` is false.
- LLM routes also block when share runtime services are not initialized.

## 10) Frontend share mode UX
- Add a share route in `frontend/src/components/Pages/router.tsx` (for example
  `/share/:deploymentId`).
- Add share bootstrap logic (create session, fetch policy, load project state)
  in `frontend/src/state/actions`.
- Add share session/policy stores in `frontend/src/state/definitions.ts`.
- Update `frontend/src/state/actions/websocketReceive.ts` to include the share
  session id in the websocket connection and in realtime events.
- Disable or hide controls based on `SharePolicy` (run buttons, view mode edits,
  param edits, layout moves).
- Add a visible "Sharing Mode" indicator in the header.

## 11) Generated endpoints + types
Status: completed. Share router registered in `backend/setta/server.py`, and
frontend bindings include share session/state endpoints.
- Register share routes in `backend/setta/types/routes.py` and include share
  routers in `backend/setta/server.py`.
- Regenerate frontend bindings after route changes:
  - `source activate.sh && cd frontend && pnpm generate`
- Do not manually edit anything under `backend/setta/types/generated`.

## 12) Tests + verification
Status: partially complete. Added publish deployment tests, share runtime boot tests, policy enforcement tests, share session/state tests, share run snapshot tests, cleanup tests, and share websocket scoping tests.
- Add backend tests under `tests/` for:
  - Session isolation (changes in session A never affect session B).
  - Policy enforcement (mutations blocked, reads allowed).
  - Run output routing (no writes to `setta_files/project.json`).
  - Websocket scoping (messages only reach matching session).
- Manual checks:
  - Publish a deployment, open two share sessions, and verify isolation.
  - Verify UI controls match `share_policy.json` settings.
Implemented:
- `tests/routers/test_share_deployments.py` covers deployment publishing.
- `tests/server_state/test_share_state.py` covers share boot, missing deployment
  guardrails, and no settings/LLM seed writes.
- `tests/project_state/test_share_project_manager.py` covers manifest selection,
  session isolation, and missing session errors.
- `tests/project_state/test_share_project_manager.py` covers listener emit
  updates for per-session project state and artifact broadcasts.
- `tests/project_state/test_share_project_manager.py` covers share run snapshot
  creation for `ephemeral` and canonical runs for `never`.
- `tests/routers/test_share_dependencies.py` covers share session id extraction
  precedence for HTTP and websocket requests.
- `tests/share/test_policy.py` covers policy guard helpers.
- `tests/routers/test_share_policy_routes.py` covers policy enforcement in LLM
  and run/terminal routes.
- `tests/routers/test_share_policy_routes.py` covers allowed-section gating for
  run routes.
- `tests/routers/test_share_sessions.py` covers share session creation and
  session-scoped state fetch behavior.
- `tests/share/test_run_cleanup.py` covers cleanup of expired share run output.
- `tests/websockets/test_websocket_manager_sessions.py` covers session-scoped
  websocket broadcasts and connection listings.
- `tests/websockets/test_realtime_event_hub_sessions.py` covers per-session
  realtime sequencing.
- `tests/websockets/test_frontend_receiver_share_mode.py` covers share websocket
  session enforcement and realtime forwarding.
- `tests/websockets/test_python_script_sender_share_sessions.py` covers
  listener realtime/force refresh filtering by share session id.
- `tests/websockets/test_python_script_receiver_share_mode.py` covers share-mode
  listener errors and listener coverage fan-out.
- `tests/share/test_listener_runtime.py` covers listener runtime lifecycle
  behavior in shared and per-viewer modes.
- `tests/api/test_listener_websocket_endpoint.py` covers listener websocket URL
  query handling for share sessions.
