# Go Frontend Binding Generation Plan

## Purpose

Execute the selected follow-on from `CURRENT.md`: move frontend-facing Go
HTTP/websocket contracts onto a Go-owned source of truth using a real
Go-to-TypeScript conversion pipeline, not handwritten TypeScript emitters, and
sever frontend ties to Python-generated backend bindings.

## Why This Slice Is Open Now

- The broad-coverage checklist still marks frontend backend-contract binding
  generation as Python-owned even for Go-owned transports.
- The repo already has a proven Python pattern for this problem:
  `frontend/generation/convert_pydantic_to_js.py` and
  `frontend/generation/convert_endpoints.py`.
- The rewrite needs the Go equivalent of that pattern, not a growing pile of
  route-by-route TS string assembly.

## Working Decision

Use explicit Go contract types plus explicit endpoint specs, then convert those
Go definitions into TypeScript in a reusable generator pipeline.

The transition goal is not a long-lived mixed Go/Python frontend binding
state. During the rewrite, prefer cutting over frontend imports and generated
artifacts to Go ownership even if the overall app is temporarily not in a
working state.

This follow-on does not permit:

- handwritten TS wrappers added one route at a time
- handwritten TS request/response type definitions added one route at a time
- per-route string-builder emission as the primary generator architecture
- preserving Python-generated frontend contract outputs as a parallel steady
  state just to keep partial coexistence working

If a Go runtime type is not suitable for stable frontend generation, introduce
a dedicated Go contract type for the frontend boundary and convert that type.

## Generator Shape

The Go-side generator should mirror the roles of the current Python generators:

- route constants generation
  - source of truth: Go route constants under `internal/httpapi` and
    `internal/wsapi`
- endpoint wrapper generation
  - source of truth: explicit Go endpoint specs including method, route, and
    request/response types
- type generation
  - source of truth: explicit Go contract types converted into TypeScript

Expected outputs:

- canonical frontend generated contract files
  - `frontend/src/utils/generatedRoutes.ts` where applicable
  - `frontend/src/utils/generatedTypes.ts`
  - `frontend/src/utils/generatedEndpoints.ts`

Temporary bootstrap outputs such as `generatedGo*` are allowed only while
proving the converter or landing a bounded cutover slice. They are not the
target architecture and should be deleted as soon as the canonical generated
files are Go-owned.

## Initial Slice

Start by proving the converter pipeline on a small but real Go-owned surface:

- current Go websocket route constants
- current Go status/meta route constants
- the status/meta endpoint cluster and its request/response contract types

This is intentionally small enough to validate the generator architecture
before widening it across more caller-backed Go routes.

Current landed wedge:

- `frontend/src/utils/generatedRoutes.ts`
  - current websocket route constants
  - current status/meta route constants
  - current workspace-launch route constants
  - current launcher-home route constants
  - current launcher-management route constants
- `frontend/src/utils/generatedTypes.ts`
  - current status/meta request/response contract types
  - explicit workspace-launch boundary contract types
    - `LaunchRequestInput`
    - `CreateWorkspaceLaunchIntentRequestInput`
    - `CreateWorkspaceLaunchIntentResponse`
    - `LaunchResponse`
    - these are dedicated frontend contract types, not a direct reflection of
      `internal/workspacelaunch.Request`, because the runtime request type also
      carries field-presence semantics for intent storage/validation
  - launcher-home contract types
    - recent-workspace query/mutation payloads
    - filesystem-root and directory-listing payloads
    - `LauncherOpenWorkspaceRequestInput`
    - `LauncherOpenWorkspaceResponse`
    - the open-workspace request stays a dedicated frontend contract type
      rather than reflecting the internal launcher request that tracks
      `settaFilesLocation` presence for runtime behavior
  - launcher-management contract types
    - launcher status and update payloads
    - setup/update request payloads
    - launcher status-query and request-base payloads
    - launcher state enums used by the frontend
  - app-config pane contract types
    - `AppCatalogResponse` and the catalog component/action/prop payloads
    - `AppDefinition`, `AppRoute`, and the app-definition read/mutation
      payloads
    - validation result payloads for `validateAppDefinition`
    - these are dedicated frontend contract types rather than a direct dump of
      `projectstate.AppDefinition`, because the runtime metadata uses
      `json.RawMessage` while the frontend boundary needs structured JSON
      values
- `frontend/src/utils/generatedEndpoints.ts`
  - current status/meta endpoint wrappers
  - workspace-launch endpoint wrappers
    - `route_create_workspace_launch_intent`
    - `route_launch`
  - launcher-home endpoint wrappers
    - `route_get_launcher_recent_workspaces`
    - `route_add_launcher_recent_workspace`
    - `route_remove_launcher_recent_workspace`
    - `route_pin_launcher_recent_workspace`
    - `route_get_launcher_filesystem_roots`
    - `route_list_launcher_directory`
    - `route_open_launcher_workspace`
  - launcher-management endpoint wrappers
    - `route_get_launcher_status`
    - `route_setup_launcher`
    - `route_repair_launcher`
    - `route_remove_launcher`
    - `route_update_launcher`
  - app-config pane endpoint wrappers
    - `route_get_app_catalog`
    - `route_get_app_definition`
    - `route_set_app_definition`
    - `route_validate_app_definition`
  - LSP diagnostics/admin endpoint wrappers
    - `route_get_latest_lsp_diagnostics`
    - `route_restart_language_server`
    - `route_set_type_error_ignore`
    - `route_type_check`
  - LSP diagnostics/admin contract types
    - `SettaLspDiagnostic`
    - `SettaLspDiagnosticRange`
    - `SettaLspDiagnosticPosition`
    - `SettaSectionTypeErrors`
    - `SettaProjectConfigDiagnostics`
    - `SettaLspDiagnosticsPayload`
  - project-level AI skills and MCP viewer endpoint wrappers
    - `route_get_app_gen_skills`
    - `route_get_app_gen_skill_content`
    - `route_upsert_app_gen_custom_skill`
    - `route_get_mcp_server_runtime_status`
  - project-level AI skills and MCP viewer contract types
    - `AppGenSkillEntry`
    - `AppGenSkillContent`
    - `GetAppGenSkillsResponse`
    - `UpsertAppGenCustomSkillResponse`
    - `MCPServerRuntimeStatus`
    - `MCPRuntimeStatusResponse`
- active caller adoption
  - `GlobalWrapper`, `WorktreeHint`, `initializeServerMode`,
    `websocketReceive`, and the `settaHomeInfo` read in
    `WorkspaceSwitcherModal` now consume the canonical Go-generated modules
    for this initial slice
  - `WorkspaceSwitcherModal`, `WorkspaceLaunchPage`,
    `workspaceSwitcherLaunch`, and `launchRequestDedupeKey` now consume the
    canonical Go-generated workspace-launch bindings
  - `LauncherHomePage` now consumes the canonical Go-generated launcher-home
    bindings
  - `DesktopLauncherSettingsSection` now consumes the canonical Go-generated
    launcher-management bindings
  - `AppConfigPane` now consumes the canonical Go-generated app-config
    bindings
  - `loadProjectConfig`, `processLspDiagnostics`, `requestTypeCheck`,
    `restartLanguageServer`, and `TypeErrorContextMenu` are now covered by
    canonical Go-generated LSP diagnostics/admin bindings
  - `ProjectChatSkillsMcpViewer` is now covered by canonical Go-generated
    app-gen-skill and MCP-runtime bindings

## Cutover Rule

- The steady state is a single frontend-generated contract surface, not
  parallel Python-owned and Go-owned modules.
- The canonical generated frontend files are now the active cutover target for
  the converted slice; do not reintroduce `generatedGo*` shadow outputs.
- Do not spend rewrite effort preserving Python-generated binding consumers
  that only exist to keep the app partially working during the transition.

## Rules

- Prefer explicit Go contract types over reflection on arbitrary runtime
  structs.
- Prefer converter rules and reusable rendering over ad hoc output assembly.
- Keep transport wrappers thin.
- Keep the generated surface deliberate and reviewable.
- When widening coverage, reuse the converter pipeline instead of adding
  one-off generator branches.

## Non-Goals

- replacing every `generatedTypes.ts` consumer in one pass
- recreating dormant Python-only helper surfaces without a caller
- reflecting arbitrary Go runtime internals directly into frontend types
- preserving Python route naming or wrapper shape when no current caller needs
  it
