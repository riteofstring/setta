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
  (`backend/setta/database/settings_file.py`). Share mode currently initializes
  settings on boot, which writes `setta-settings.json` and
  `setta-settings-project.json` into the deployment root; revisit this if share
  deployments must remain write-free.
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
Status: completed. Share runtime boots with a mode flag and deployment root, and skips IDE-only services.
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
- `backend/setta/server.py` constructs `SettaFastAPIState` with share mode.
- `backend/setta/server_state.py` branches share initialization, loads from the
  deployment root, and skips watchers/LSP boot.
- `backend/setta/server_state.py` initializes share settings, terminals only
  when `allowRun`, and share listener runtime + share websocket receivers.
- `backend/setta/server_state.py` initializes MCP + LLM only when allowed by
  policy (and wires share chat manager accordingly).

## 4) Share project manager + per-viewer overlays
Status: completed. ShareProjectManager + session store exist, share-mode mutation routes are wired to per-session overlays, and session validation/cleanup/artifact caching are in place.
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
- `ShareProjectManager` preloads per-session artifact caches from the snapshot
  and share artifact routes load from disk on cache misses.
- `ShareProjectManager` applies listener isolation defaults from `manifest.json`
  when present.
- `backend/setta/routers/dependencies.py` resolves share session ids from
  header/cookie/query and exposes session/overlay dependencies.
- Share session ids are validated/touched against the session store before
  creating overlays; missing/unknown ids return 400/404.
- `backend/setta/routers/project_manager.py` now binds a per-request share
  session context so share-mode mutations use session-scoped managers.
- `backend/setta/project_state/share_session_project_manager.py` provides a
  per-session BaseProjectManager wrapper with share-session broadcasts.
- `backend/setta/project_state/share_session_project_manager_switcher.py`
  wires share-mode project manager access to per-session managers.
- `backend/setta/share/session_store.py` provides `MemorySessionStore` and a
  `RedisSessionStore` stub.
- Share session TTL cleanup is scheduled at share boot and prunes session state
  and managers.
- `backend/setta/routers/share_deployments.py` provides share session creation
  and per-session state fetch endpoints.

## 5) Policy enforcement
Status: completed. Policy checks are wired, and share-mode mutations now route
through per-session managers.
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
- Policy helpers now resolve the active share session id from request context
  when one is not passed explicitly.

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
- Share websocket routes validate share session ids and close with 4400/4404
  when missing or unknown.

## 7) Listener runtime + isolation
Status: completed. Listener runtime, session scoping, and share-mode listener
websocket handling are implemented.
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
- Share session cleanup stops per-session listener runtimes when sessions expire.

## 8) Run flow changes
Status: completed. Run snapshot mode, share run roots, and per-viewer terminal
isolation are implemented.
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
- Terminal websocket connections validate share session ids and close with
  4400/4404 when missing or unknown.
- Run/terminal HTTP routes require share session ids in share mode.
- Added `RunSnapshotMode` to settings + share policy, and use it in IDE/share
  run command creation.
- Share run output writes to `setta_files/share_runs/<deployment>/<session>/<timestamp>`
  and uses per-session snapshots or canonical files based on snapshot mode.
- Share run output cleanup runs in the background for ephemeral snapshots.
- Terminals are keyed by share session + section id to prevent PTY collisions
  across viewers; run/delete/kill routes and terminal websockets use the
  session-scoped ids.

## 9) LLM + MCP gating
Status: completed. Share boot gates MCP/LLM by policy, and per-viewer chat state
is isolated in memory.
- Add share policy flags `allowLLM` and `allowMCP` (default false).
- In share mode initialization, skip `SettaFastMCP`, `MultiMCPClient`, and
  `LLMChatManager` unless enabled.
- Add an in-memory chat store keyed by share session id so chats are not written
  to `setta_files/chats`.
- Block `/llm/config` and `/llm/apiKeys` updates in share mode.
Implemented:
- Share state only initializes MCP/LLM when policy allows, and loads LLM config
  only when `allowLLM` or `allowMCP` is true.
- `backend/setta/llm/chat_store.py` introduces `ChatStore` plus `DBEChatStore`
  and `MemoryChatStore` so share sessions can avoid disk writes.
- `backend/setta/share/chat_manager.py` provides a per-session `ShareChatManager`
  that uses `MemoryChatStore` and session-scoped project summaries.
- `backend/setta/mcp/noop_client.py` provides a no-op MCP client for LLM-only
  share sessions.
- LLM routes in `backend/setta/routers/ai.py` and `backend/setta/routers/llm.py`
  require a share session id in share mode, and are blocked when `allowLLM` is
  false or share LLM is not initialized.
- `/llm/config` and `/llm/apiKeys` updates are blocked in share mode.
- Share session cleanup prunes per-session chat manager state.

## 10) Share access + auth model
Status: completed. Share mode is public by default and skips auth checks.
Implemented:
- `backend/setta/server.py` skips `AuthMiddleware` when `SETTA_SHARE_MODE` is true.
- Websocket auth checks are bypassed in share mode so share frontend and listener
  websockets follow the same public access policy.

## 11) Frontend share mode UX
Status: completed. Share session bootstrap, websocket scoping, UI gating, and
IDE-side publish/redeploy UX are in place.
Implemented:
- Added `/share/:deploymentId` routing with share wrapper/container components.
- Added share session bootstrap (`route_create_share_session` + state fetch) and
  share session store + hooks.
- Websocket connections include `shareSessionId` and use `/share/frontend` in
  share mode.
- UI controls are gated by policy (run, param edits, variant/view edits, layout
  moves/resizes, and lock-position edits).
- Header shows a "Sharing Mode" indicator and share search behavior.
 - Publish/redeploy UI: IDE entry point (File menu) and modal with policy toggles
   (allowParamChanges, allowVariantChanges, allowLayoutChanges, allowRun,
   allowLLM, allowMCP).
 - Publish/redeploy UI: listener inputs (entrypoint path, enabled flag, isolation)
   and run snapshot mode.
 - Publish/redeploy UI: calls `route_publish_share_deployment`, surfaces errors,
   and shows deployment id + share URL with copy/open actions + recent list.
 - Publish/redeploy UI: shows share-backend startup instructions.

## 12) Generated endpoints + types
Status: completed. Share router registered in `backend/setta/server.py`, and
frontend bindings include share session/state endpoints.
- Register share routes in `backend/setta/types/routes.py` and include share
  routers in `backend/setta/server.py`.
- Regenerate frontend bindings after route changes:
  - `source activate.sh && cd frontend && pnpm generate`
- Do not manually edit anything under `backend/setta/types/generated`.

## 13) Tests + verification
Status: completed. Added publish deployment tests, share runtime boot tests,
policy enforcement tests, share session/state tests, share run snapshot tests,
cleanup tests, and share websocket scoping tests.
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
  guardrails, settings file creation, and policy-gated services.
- `tests/project_state/test_share_project_manager.py` covers manifest selection,
  session isolation, and missing session errors.
- `tests/project_state/test_share_project_manager.py` covers listener emit
  updates for per-session project state and artifact broadcasts.
- `tests/project_state/test_share_project_manager.py` covers listener emit sync
  with per-session managers.
- `tests/project_state/test_share_project_manager.py` covers share run snapshot
  creation for `ephemeral` and canonical runs for `never`.
- `tests/routers/test_share_dependencies.py` covers share session id extraction
  precedence for HTTP and websocket requests plus share session context setup
  and touch behavior.
- `tests/project_state/test_share_session_project_manager_switcher.py` covers
  per-session share manager routing and session context requirements.
- `tests/share/test_policy.py` covers policy guard helpers.
- `tests/routers/test_share_policy_routes.py` covers policy enforcement in LLM
  and run/terminal routes.
- `tests/routers/test_share_policy_routes.py` covers allowed-section gating for
  run routes.
- `tests/routers/test_share_policy_routes.py` covers share-mode LLM config/API
  key update blocking.
- `tests/routers/test_share_terminals.py` covers session-scoped terminal deletes.
- `tests/routers/test_share_sessions.py` covers share session creation and
  session-scoped state fetch behavior.
- `tests/share/test_run_cleanup.py` covers cleanup of expired share run output.
- `tests/share/test_session_cleanup.py` covers listener/chat cleanup on session
  expiry.
- `tests/terminals/test_terminals_session_filter.py` covers session filtering for
  terminal listings.
- `tests/websockets/test_websocket_manager_sessions.py` covers session-scoped
  websocket broadcasts and connection listings.
- `tests/websockets/test_realtime_event_hub_sessions.py` covers per-session
  realtime sequencing.
- `tests/websockets/test_frontend_receiver_share_mode.py` covers share websocket
  session enforcement and realtime forwarding.
- `tests/routers/test_share_websocket_requirements.py` covers share frontend and
  terminal websocket session requirements (4400/4404).
- `tests/websockets/test_python_script_sender_share_sessions.py` covers
  listener realtime/force refresh filtering by share session id.
- `tests/websockets/test_python_script_receiver_share_mode.py` covers share-mode
  listener errors and listener coverage fan-out.
- `tests/share/test_listener_runtime.py` covers listener runtime lifecycle
  behavior in shared and per-viewer modes.
- `tests/api/test_listener_websocket_endpoint.py` covers listener websocket URL
  query handling for share sessions.
- `tests/share/test_chat_manager.py` covers share session chat isolation.
- `tests/llm/test_chat_store.py` covers `MemoryChatStore` persistence behavior.

## Open questions
- Should OSS share mode be open-by-default or require auth/bootstrap tokens?
- What is the default share policy for new deployments?
- Should terminals/run remain disabled by default in share mode?
- Do we want an IDE-side "record run" toggle for run snapshot mode?
- Should share deployments remain strictly write-free (settings files are
  currently written on share boot)?
- How should we simplify dev-mode share testing (single `pnpm start`)?
- Should we add a `setta share` CLI entrypoint for end users?

## Next improvements
- Dev mode: run share backend alongside IDE backend (single `pnpm start`),
  and route `/share/*` traffic + websockets to the share backend.
- CLI: add `setta share --deployment <id> --port <port>` to avoid raw env vars.
