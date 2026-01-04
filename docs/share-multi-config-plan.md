# Share Mode Multi-Config Plan

Status: proposed plan only (not implemented).

This plan would extend share mode to support multiple project configs per
deployment with per-session isolation. It keeps a single share policy for all
configs and allows listeners to run per session for every config.

## Goals
- Share mode supports switching between project configs like IDE mode.
- Each share session has isolated state for every config in the deployment.
- Share listeners run per session per config.
- Share policy remains global (one policy for all configs).

## Approach Summary
- Store a full ProjectStateBackend copy per share session.
- Route project-config lookups through the session backend in share mode.
- Add share endpoints for loading a specific project config and for loading
  share-side project metadata (names, default config).
- Update frontend share flow to load the default config and allow switching
  configs using existing UI (Home + Overview pane).

## Defaults / Assumptions
- The deployment and selected config are both represented in the share URL.
- Proposed routing scheme:
  - `/share/<deploymentName>/vN/<projectConfigName>` loads a specific config.
  - `/share/<deploymentName>/vN` loads the default config.
  - `/share/<deploymentName>/<projectConfigName>` resolves latest deployment.
- `deploymentName` is still `manifest.projectConfigName` from the published
  deployment.
- The default project config in share mode is `manifest.projectConfigId`.
- Share policy remains a single file at the deployment root and applies to all
  configs.
- Share session id continues to be provided by `x-share-session-id`, the
  `shareSessionId` cookie, or a `shareSessionId` query param. Frontend uses the
  cookie for HTTP and the query param for websockets.

## Planned Data Model Changes
- Share session response would include:
  - defaultProjectConfigId
  - projectMetadata (same shape as AllProjectMetadata.projectMetadata)
- Share session state would store a full ProjectStateBackend snapshot per session:
  - session_id -> ProjectStateBackend
  - session_id -> Artifacts
- ShareRuntimeState would expose helpers:
  - get_session_backend(session_id)
  - get_session_state(session_id, project_config_id)
  - update_session_state(session_id, project_config_id, project_state)

## Planned Backend Changes

## Planned API / Endpoint Sketch
- Add a new route constant in `backend/setta/types/routes.py`:
  `Route.SHARE_DEPLOYMENT_PROJECT_CONFIG =
  "/share/deployments/{projectConfigName}/{version}/project_config"`
- `POST /share/deployments/{projectConfigName}/{version}/session`
  - Response extends `ShareDeploymentSessionResponse` with:
    - `defaultProjectConfigId`
    - `projectMetadata` (list of `ProjectConfig`)
- `POST /share/deployments/{projectConfigName}/{version}/project_config`
  - Request body: `{ projectConfigId: ID }`
  - Requires share session id (header/cookie/query).
  - Response: `ProjectStateSingleConfigWithCompletedOpIds`.
  - Validates `projectConfigId` exists in the share deployment backend for the
    session.
 - Share URL routing changes (frontend + backend router params):
   - `/share/<deploymentName>/vN/<projectConfigName>` should load the specified
     config.
   - `/share/<deploymentName>/vN` should load the default config for that
     deployment.
   - `/share/<deploymentName>/<projectConfigName>` should resolve the latest
     deployment and then load the specified config.

### ShareRuntimeState (backend/setta/project_state/share_runtime_state.py)
- Replace single-config state with per-session ProjectStateBackend storage.
- Keep a base backend snapshot in memory, and deep-copy it per session.
- Add helpers:
  - get_session_backend(session_id)
  - get_session_state(session_id, project_config_id)
  - update_session_state(session_id, project_config_id, project_state)
  - has_project_config(project_config_id)
- Update create_run_command to accept project_config_id.
- Ensure genCodeBinding fallback applies per config when needed.
  - If missing, create a fallback binding for the specific project config and
    store it in the session backend.

### SessionProjectManager (backend/setta/project_state/session_project_manager.py)
- load_initial_state would return the session backend (not a single-config backend).
- update() would write back to the session backend for the specific config.
- create_run_command would accept projectConfigId and delegate to
  ShareRuntimeState.create_run_command(share_session_id, project_config_id,...).
- apply_listener_emit_updates would validate that the config exists in the session
  backend instead of matching a single id.
- ensure_gen_code_ready would target the requested projectConfigId.

### ProjectManagerSwitcher (backend/setta/project_state/project_manager_switcher.py)
- get(...) would allow any projectConfigId in the share deployment backend.
- get_config_id_by_name would resolve against the share deployment backend.
- get_for_session would continue to return a session-scoped manager, but no longer
  enforce a single config id.

### Share Session and Deployment Routes (backend/setta/routers/share_deployments.py)
- route_create_share_session would return:
  - defaultProjectConfigId
  - projectMetadata
- Add a new endpoint for share-mode load of a project config:
  - route_load_share_project_config(projectConfigName, version, projectConfigId)
  - Returns ProjectStateSingleConfigWithCompletedOpIds for that config.
- Keep `route_get_share_deployment_state` for compatibility or narrow it to the
  default config only. No backward compatibility work is required for this plan.

### Runtime Context (backend/setta/runtime/context.py)
- get_project_manager(project_config_id) would use the session manager but
  allow any config id present in the session backend.

### Listener Runtime (backend/setta/share/listener_runtime.py)
- Add per-session per-config listeners.
- Keep a map keyed by (session_id, project_config_id) to listener handles.
- Ensure listener creation uses the provided project_config_id.
- Share session cleanup should stop all listeners for that session.
  - Cleanup should iterate the map and drop any entries for the expired session.

### Share Session Store (backend/setta/share/session_store.py)
- No changes planned. Session id remains the primary key.

### Websockets
- No routing changes needed if projectConfigId is included in messages.
- Server-side handlers would validate the config exists in the session backend.
  - Frontend websocket handshake continues to pass shareSessionId as a query
    param (`RouteEnum.WEBSOCKET_SHARE_FRONTEND`).

## Planned Frontend Changes

### Share initialization (frontend/src/state/actions/share.ts)
- Store projectMetadata and defaultProjectConfigId from the share session
  response into useAllProjectMetadata and useShareSession.
- Load the default project config state using the new share load endpoint.
  - Sequence:
    1) call `route_create_share_session`
    2) store session + metadata + default id
    3) call `route_load_share_project_config` with default id
    4) `loadProjectState` on the response

### Share config switching
- Add a share-specific load action (state/actions/share.ts) to request a
  different projectConfigId for the current session.
- Update the Overview pane ProjectConfigs list to use the share load action
  when in share mode (no route change required).
  - Avoid URL changes for config switches; keep the share URL pointing at the
    deployment version.

### Share session state (frontend/src/state/definitions.ts)
- Add defaultProjectConfigId to share session state, or reuse
  useAllProjectMetadata.defaultProjectConfigId for the active config.

### Share routing
- No changes required. Share URL continues to identify the deployment only.

## Planned Tests

### Backend tests to add or update
- tests/project_state/test_share_session_project_manager.py
  - Session backend stores multiple configs.
  - Switching projectConfigId loads the correct single-config state.
- tests/project_state/test_share_project_manager.py
  - update_session_state applies changes to the correct config only.
- tests/routers/test_share_deployments.py
  - Session response includes project metadata and default id.
- tests/routers/test_share_sessions.py
  - Multiple configs can be loaded in the same session.
- tests/routers/test_share_policy_routes.py
  - Policy enforcement remains global across configs.
- tests/share/test_listener_runtime.py
  - Per-session per-config listener handles are created and cleaned up.

### Frontend tests
- None planned yet (no existing frontend test suite).

## Compatibility / Migration
- No backward compatibility work is required.
- No migration is needed. Share deployments already contain a full
  ProjectStateBackend, and the share policy remains a single file at the
  deployment root.

## LSP / Run / Listener Notes
- Run commands should accept `projectConfigId` explicitly and resolve code
  bindings in the session backend for that config.
- LSP initialization should remain global, but `ensure_gen_code_ready` must
  target the active config before LSP use.
- Listener runtime should create and manage a listener per
  `(share_session_id, project_config_id)` pair so each config runs in isolation.

## Open Questions
- None identified. This plan assumes that memory is acceptable for storing a
  full ProjectStateBackend per session.
