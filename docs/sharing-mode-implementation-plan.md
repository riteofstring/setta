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
- Create Pydantic models in `backend/setta/types/share_deployment.py` for:
  - `ShareDeploymentManifest` (version, projectConfigId, createdAt, listener config).
  - `SharePolicy` (allowParamChanges, allowVariantChanges, allowLayoutChanges, allowRun, allowLLM, allowMCP, listenerIsolation, allowedSections).
  - `ShareDeploymentMetadata` (deployment id, path, policy path).
- Add constants in `backend/setta/utils/constants.py`:
  - `SHARE_DEPLOYMENTS_FOLDER = C.SETTA_FILES_FOLDER / "share_deployments"`.
  - `SHARE_RUNS_FOLDER = C.SETTA_FILES_FOLDER / "share_runs"`.
- Add route entries in `backend/setta/types/routes.py` for share APIs and websockets
  (for example `/share/deployments`, `/share/deployments/{deploymentId}/session`,
  `/share/deployments/{deploymentId}/state`, `/share/frontend`).

## 2) Publish share deployment (IDE mode)
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
  - Copy listener entrypoint (if present) into `listener/` inside the deployment.
  - Write `project.json`, `manifest.json`, and `share_policy.json`.
  - Avoid any writes back to the developer workspace state.

## 3) Share runtime server/state
- Introduce a share mode flag (env or CLI) and branch in
  `backend/setta/server_state.py` or add a `backend/setta/share_server.py`.
- Create a share-specific state that:
  - Loads from a deployment root (not `C.SETTA_FILES_FOLDER`).
  - Skips `SpecificFileWatcher`, LSP startup, MCP, and LLM watchers unless allowed.
  - Initializes a share session store and share project manager.
- Ensure share routers are included in `backend/setta/server.py` so endpoint
  generation in `frontend/generation/convert_endpoints.py` can see them.

## 4) Share project manager + per-viewer overlays
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

## 5) Policy enforcement
- Add `SharePolicy` in `backend/setta/types/share_policy.py` (no Pydantic alias use).
- Enforce policy in share routes and/or inside `ShareProjectManager`:
  - Params: `set_param_entered_value`, `update_param_impl_config`,
    `set_param_name_and_value`.
  - Variants/view modes: create/delete/toggle variant, view mode edits.
  - Layout: move/resize/viewport/column widths.
  - Run/terminals: `route_run_code`, terminal websocket endpoints.
  - Listener emits: `apply_listener_emit_updates`.
  - LLM/MCP routes.
- Return 403 with a clear message; broadcast a notification via
  `backend/setta/websockets/msg_handlers/frontend_sender.py`.

## 6) Websocket scoping + realtime events
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

## 7) Listener runtime + isolation
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

## 8) Run flow changes
- Add run snapshot mode (`always`/`ephemeral`/`never`) to
  `backend/setta/types/settings_state.py` or the share policy.
- Override `create_run_command` in share mode to write into
  `setta_files/share_runs/<deployment>/<session>/<timestamp>`.
- Add TTL cleanup (background task) for share run output.
- Gate run and terminal endpoints in `backend/setta/routers/terminals.py`
  against `SharePolicy.allowRun`.

## 9) LLM + MCP gating
- Add share policy flags `allowLLM` and `allowMCP` (default false).
- In share mode initialization, skip `SettaFastMCP`, `MultiMCPClient`, and
  `LLMChatManager` unless enabled.
- Add an in-memory chat store keyed by share session id so chats are not written
  to `setta_files/chats`.
- Block `/llm/config` and `/llm/apiKeys` updates in share mode.

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
- Register share routes in `backend/setta/types/routes.py` and include share
  routers in `backend/setta/server.py`.
- Regenerate frontend bindings after route changes:
  - `source activate.sh && cd frontend && pnpm generate`
- Do not manually edit anything under `backend/setta/types/generated`.

## 12) Tests + verification
- Add backend tests under `tests/` for:
  - Session isolation (changes in session A never affect session B).
  - Policy enforcement (mutations blocked, reads allowed).
  - Run output routing (no writes to `setta_files/project.json`).
  - Websocket scoping (messages only reach matching session).
- Manual checks:
  - Publish a deployment, open two share sessions, and verify isolation.
  - Verify UI controls match `share_policy.json` settings.
