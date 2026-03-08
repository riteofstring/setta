# Go Backend Feature Checklist

Snapshot date: 2026-03-10.

Primary agent entrypoint: `docs/plans/go-backend-rewrite/CURRENT.md`.

Audit/maintenance plan:
`docs/plans/go-backend-rewrite/backend-feature-checklist-audit-plan.md`.

This checklist is a rewrite-status inventory, not a promise of route-for-route
Python parity.

How to read the statuses:

- `Complete`: Go owns the active runtime and transport for the current
  clean-break scope.
- `Partial`: Go owns a bounded slice, but the repo still documents explicit
  limitations or deferred follow-up work.
- `Missing`: the current caller still depends on Python, or no Go-owned
  equivalent exists yet.

Checklist rule: internal Go capability does not count as `Complete` unless the
current caller actually reaches that Go-owned transport/runtime today.

Primary sources used for this checklist:

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `backend/setta/types/routes.py`
- `backend/setta/routers/*.py`
- `frontend/src/utils/generatedEndpoints.ts`
- non-test `frontend/src/**` caller sites, including direct websocket callers
- current Go transport/runtime packages under `internal/`

## 1. Server, auth, modes, and settings

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | HTTP app assembly and process runtime | `internal/app`, `internal/runtime`, and `internal/httpapi` are the current Go owners. |
| Complete | Bootstrap token exchange and auth-cookie session auth | Root bootstrap handling lives in `internal/httpapi/httpapi.go`; auth ownership is in `internal/auth`. |
| Complete | IDE/share/app/launcher mode policy and request context | `internal/modes` owns mode resolution, guards, and share-session requirements. |
| Complete | Status/meta reads | Go owns `backendInitStatus`, `authRefreshStatus`, `serverMode`, and `settaHomeInfo`. |
| Complete | Trusted launcher-origin handoff and session bootstrap support | Go ownership lives across `internal/auth`, `internal/frontendorigins`, and `internal/workspacelaunch`. |
| Complete | Live settings-state load/save and websocket updates | `internal/settingsstate` plus `internal/httpapi/settings_routes.go` own `loadSettings`, `saveSettings`, and `UpdateSettings`. |
| Partial | Settings-project sync/materialization | Go now overlays settings-project state into live settings, but full reverse settings-project transport/sync is still explicitly deferred. |

## 2. Launcher, workspace launch, deployments, and packaged command boundary

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | Launcher home surface | Go owns recent workspaces, filesystem roots, directory listing, and open-workspace flows through `internal/launcher` and `internal/httpapi/launcher_home_routes.go`. |
| Complete | Launcher management surface | Go owns launcher status, setup, repair, remove, and update through `internal/launcher` and `internal/httpapi/launcher_management_routes.go`. |
| Complete | Workspace launch intents and local launch orchestration | `internal/workspacelaunch` owns create-intent and launch flows. |
| Complete | SSH-backed launch plumbing used by workspace launch | The current Go service boundary is `internal/sshx`; the rewrite plan treats SSH launch transport as landed for the active surface. |
| Complete | Share deployment publish/list/latest/version reads | `internal/deployments`, `internal/httpapi/deployment_ide_routes.go`, and Phase 7/10 closeouts cover publish plus catalog reads. |
| Complete | App deployment publish/list/latest/version reads | Same Go ownership as share deployments, with app-specific publish validation in `internal/deployments/app_publish.go`. |
| Complete | Deployment current-session bootstrap, state reads, and project-config reads | Go owns `.../current/session`, `.../state`, and `.../project_config` in deployment mode. |
| Complete | Deployment session cleanup, overlay state, and run policy enforcement | Current deployment runtime ownership is in `internal/deployments`, `internal/runs`, and `internal/shareartifacts`. |
| Complete | Packaged Go CLI and server entrypoints | `cmd/setta` and `cmd/setta-server` are the active packaged entrypoints. |
| Complete | Packaged `python -m setta` fallback boundary | The active packaged fallback edge is routed into Go-owned command behavior; the broad Python fallback path is no longer live for the packaged flow. |
| Complete | Build/install/publish wrapper convergence and wheel-first installer boundary | Phases 25, 31, and 32 mark the active startup/distribution track as closed for the current scope. |

## 3. Realtime, websocket transport, listeners, and terminals

| Status | Feature | Notes |
| --- | --- | --- |
| Missing | Frontend websocket auth, identity, and connection inventory | Go owns `/ws/frontend`, frontend affinity tokens, and connection broadcasts under `internal/wsapi`/`internal/realtime`, but the current frontend still opens the Python-era `/api/frontend` and `/api/share/frontend` websocket routes. |
| Missing | Frontend realtime UI-change and dependency-event routing | Go owns the replacement `/ws/frontend` producer/broadcaster path, but current frontend realtime UI-change and dependency-event messages still ride the Python-era websocket route shapes. |
| Complete | Listener coverage reads | Go owns `getListenerCoverage` through `internal/realtime` and `internal/httpapi/listener_routes.go`. |
| Complete | Listener force-refresh transport | Go owns `forceRefreshListener`, and the current frontend listener actions call that Go HTTP route today. |
| Complete | Listener websocket dispatch for plugin listener endpoints | `internal/wsapi` plus Phase 15 listener endpoint work own websocket dispatch for plugin-registered listener endpoints. |
| Partial | Built-in listener endpoint parity beyond the active plugin caller surface | The plan still calls out built-in endpoint dispatch, listener temp-id negotiation, and related follow-ons as deferred. |
| Partial | Terminal PTY runtime | `internal/terminals` owns the replacement PTY runtime, but the current frontend terminal attach flow still targets the Python-era websocket path `/{projectConfigId}/{sectionId}/{id}` rather than Go's `/ws/terminals/{projectID}/{sectionID}`. |
| Missing | Terminal websocket attach/history replay/resize behavior | The Go terminal websocket surface is `/ws/terminals/{projectID}/{sectionID}`, but the current frontend still opens the Python-era `/api/{projectConfigId}/{sectionId}/{id}` websocket path. |
| Complete | Terminal delete and interrupt HTTP routes | Go owns `deleteTerminals` and `interruptTerminalProcesses`. |
| Partial | `runCode` execution path | Go owns the current IDE/share/app `runCode` surface, but `cliId` output transport is still explicitly unsupported and the current terminal attach caller still uses the Python-era websocket path. |
| Missing | Detached-run transport | `runDetached`, `getRunStatus`, and `cancelRun` are still outside the current Go-owned scope. |
| Missing | Legacy CLI and `pythonScript` websocket transports | Python-era `/cli`, `/cli/{id}`, and `/pythonScript/{id}` websocket routes do not have Go equivalents. |

## 4. Project state, project shell, code editing, LSP, and watch-code

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | Project-state runtime and persistence | The main Go owners are `internal/projectstate`, `internal/projectview`, and `internal/app`. |
| Complete | Project shell reads | Go owns `loadAllProjectMetadata` and `loadProjectConfig`. |
| Complete | Project lifecycle mutations | Go owns `saveProject`, `createProjectConfig`, `saveAsNewProjectConfig`, `deleteProjectConfigs`, and `setProjectConfigName`. |
| Complete | Notification reads and deletes | `internal/notifications` plus `internal/httpapi/project_shell_routes.go` own `getNotifications` and `deleteNotification`. |
| Complete | Latest project-state hydration | Go owns `getLatestProjectState` and frontend-op completion/pending tracking. |
| Complete | Top-level section creation and view-mode lifecycle | Go owns `createTopLevelSection`, `createViewMode`, `setActiveViewMode`, `toggleIsEditingViewMode`, `toggleViewModeUserFacing`, `toggleViewModeTab`, `setViewModeName`, `setViewModeSortOrder`, and `deleteViewMode`. |
| Complete | Layout/presentation mutations | Go owns `toggleSectionVisibility`, `setTopLevelSectionLayout`, `autoLayoutTopLevelSections`, `togglePositionLocks`, `toggleMinimized`, `setShowParamDisplayNames`, `setSectionTagColor`, `setSectionStyleColor`, `setActiveIds`, and `setViewport`. |
| Complete | Rename-refactor flow | Go owns `setSectionName`, `acceptRenameRefactor`, and `declineRenameRefactor`. |
| Complete | Code editing and formatting | Go owns `setCode` and `formatCode`. |
| Complete | Callable and section presentation toggles used by the current frontend | Go owns `setCallable`, `setCallableHideParams`, `setSectionHideUnpinnedParams`, and `setSectionPinnedParams`. |
| Complete | Chat-section persistence and stale-chat cleanup | Go owns `setChatSectionSettings`, `setChatSectionState`, `getChatSectionChatId`, and `setChatSectionChatId` over `internal/chatsections`. |
| Complete | Codegen target configuration | Go owns `setProjectConfigCodegenTargets`. |
| Complete | Watch-code runtime and transport | `internal/watchcode` owns the current watch-code runtime plus `setWatchCodeEnabled` and `setWatchCodeInputs`. |
| Complete | LSP diagnostics and completion surface | Go owns text-field, output-accessor, code-area, prefix/suffix completion, diagnostics reads, and diagnostics mute/suppression routes. |
| Complete | Plugin-defined code-language routing for LSP | Go owns language-aware routing for plugin-defined `Code` sections in the current caller-backed scope. |
| Missing | LSP/admin helper routes still used by the current frontend | Edit-menu and shortcut flows still call Python-owned `typeCheck` and `restartLanguageServer`; Go does not register those HTTP endpoints today. |
| Missing | Large tail of direct HTTP project-graph and section-config mutations from Python | Child-section creation/deletion, edge and agentic-edge mutation, copy/paste/group/ungroup/move/undo/redo flows, section-variant create/delete/select/default/name/sort/frozen and JSON-source-key mutation, param entered-value/order/selection/update and kwarg helpers, prompt/codegen-prefix-suffix and code-object/file-binding/attached-terminal helpers, section sizing/filter/edge-IO/group-overflow/list-root/parent-default-child/column-width helpers, password/subprocess helpers such as `getPasswordParamValue` and `killSubprocesses`, and text-block/browser/spreadsheet/task-board/chart/image/social mutations are still current-frontend callers but do not have direct Go HTTP routes. |
| Missing | Default-project and JSON-source/file helpers still used by the current frontend | Home/global and input-area flows still call `getDefaultConfigName`, `setAsDefaultProject`, `createFile`, and `deleteJsonSourceFileAndVariant`; Go does not expose those HTTP routes today. |
| Missing | Legacy settings-project HTTP routes | `loadSettingsProject` and `saveSettingsProject` do not have Go route equivalents. |

## 5. MCP, app-spec ownership, tool registry, and LLM config

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | Authenticated Go MCP server/client foundation | `internal/mcpx` is the current owner for the internal MCP server/client boundary. |
| Complete | MCP runtime status and direct tool-call transport | Go owns `mcpServerRuntimeStatus` and `__setta__/tools/call`. |
| Complete | Tool metadata, search, namespacing, and scoped invocation | Current ownership is split across `internal/tools` and `internal/mcpx`, with broad Go test coverage. |
| Complete | Frontend-affinity-aware UI-setting tool flows | Go owns UI-setting reveal/result flows across `internal/realtime`, `internal/uisettings`, `internal/mcpx`, and the frontend websocket contract. |
| Complete | Current Setta MCP write/read tool surface used by the app | The repo now contains large Go-owned tool coverage for UI settings, plugin management, app-definition streaming, agent-profile tools, and related project-state tooling. |
| Complete | App-spec store, validation, diagnostics, and patch streaming foundations | `internal/appspec` is the current Go owner for bounded app-definition/app-spec state used by the MCP surface. |
| Complete | LLM config and managed API-key reads/writes | Go owns `GET/POST /llm/config` and `GET/POST /llm/apiKeys` via `internal/llmconfig`. |
| Partial | External file-watch parity for `.env` and `llm_config.json` | Immediate runtime refresh is Go-owned, but broad external watch parity remains explicitly deferred. |
| Missing | Legacy app-definition REST routes still used by the current frontend | The app-config pane still calls `getAppDefinition`, `setAppDefinition`, `validateAppDefinition`, and `getAppCatalog`; Go owns app-spec state and MCP tools, not these HTTP routes. |
| Missing | Legacy app-spec streaming helper route still used by the current frontend | The app-config pane still POSTs `streamAppSpec`; Go owns app-spec state and MCP tools, not this HTTP route. |
| Missing | Remaining legacy app-spec helper routes | `updateAppDefinition` and `listAppComponents` were not recreated as Go HTTP routes; the current Go owner is the MCP/app-spec boundary instead. |
| Missing | Legacy `runMcpTools` route | The Python-era direct route is absent; the Go tool path is the authenticated MCP boundary instead. |

## 6. AI, agentic runtime, chat state, and transcription

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | External-agent runtime ownership for Codex, OpenCode, and Claude | `internal/externalagents` and the Phase 12 slices mark the current bounded external-agent runtime as complete. |
| Complete | External-agent approval/question response transport | Go owns `respondExternalAgentApproval` and `respondExternalAgentQuestion`. |
| Complete | External-agent chat hydration, stop, and AI-follow snapshot transport | Go owns `getExternalAgentChat`, `stopExternalAgentRun`, and `getAIFollowSnapshot`. |
| Complete | External-agent attachment/prompt/app-generation payload handling | The bounded prompt, attachment, and app-generation follow-ons are marked landed in Phase 12. |
| Complete | Agent-run list/read transport | Go owns `getAgentRuns` and `getAgentRun`. |
| Complete | Agent profile CRUD | Go owns `getAgentProfiles`, `getAgentProfile`, `createAgentProfile`, `updateAgentProfile`, and `deleteAgentProfile`. |
| Complete | Prompt template CRUD | Go owns `getPromptTemplates`, `getPromptTemplate`, `createPromptTemplate`, `updatePromptTemplate`, and `deletePromptTemplate`. |
| Complete | App-gen skill list/read/upsert transport | Go owns `getAppGenSkills`, `getAppGenSkillContent`, and `upsertAppGenCustomSkill`, and the project-level AI skills UI uses those Go routes today. |
| Complete | External-agent config reads/health/CRUD | Go owns config list/single-item/health plus create/update/delete through `internal/externalagentconfigs`. |
| Complete | Engine config CRUD | Go owns list/single-item/create/update/delete through `internal/agentruns.EngineStore` and route transport. |
| Complete | Agentic summary-cache status | Go owns `getAgenticSummaryCacheStatus`. |
| Complete | Managed agent-run start/stop and run-chain start/stop | Phase 14 marks the bounded route/runtime mutation surface as Go-owned, including external-agent child steps inside run chains. |
| Partial | Managed chat runtime | Go owns `getLLMResponse`, `getLLMChat`, `stopLLMChat`, live websocket streaming, MCP-tool execution, and bounded OpenAI execution, but broader provider parity and managed reasoning output are still intentionally incomplete. |
| Partial | Managed tool-preview parity | The current Go runtime covers the landed `tool_argument_preview_delta` and `AIFollowToolResultUpdate` paths, not every historical preview kind. |
| Partial | External-agent health/preflight parity | Current config/health reads are Go-owned, but richer Python-only plugin/env-var/cache preflight semantics remain deferred. |
| Complete | Transcription-profile reads and CRUD | Go owns `getTranscriptionProfiles`, `createTranscriptionProfile`, `updateTranscriptionProfile`, and `deleteTranscriptionProfile`. |
| Complete | Transcription-session file mode and realtime mode | Go owns `startTranscriptionSession`, `appendTranscriptionAudio`, `stopTranscriptionSession`, and `cancelTranscriptionSession`. |
| Missing | Legacy direct chat CRUD/metadata routes | `createChat`, `getChat`, `appendChatMessages`, `deleteChat`, `getAllChatMetadata`, `getAllLLMChatMetadata`, `deleteLLMChat`, and `setChatSystemPrompt` do not have direct Go equivalents. |

## 7. Plugins and backend worker runtime

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | Plugin runtime/status payloads and frontend asset serving | Go owns `GET /plugins/runtime` plus `/plugins/{pluginId}/{assetPath:path}`. |
| Complete | Plugin config writes | Go owns `POST /plugins/config`. |
| Partial | Plugin restart transport | Go owns `POST /plugins/restart`, but the real app still treats restart as manual-only because no concrete restart hook is wired there. |
| Complete | Plugin lifecycle mutations | Go owns rescan, install, link, uninstall, update, rollback, enable, disable, lock-write, and lock-apply. |
| Complete | Backend registration visibility in plugin runtime/status | Go owns language-server, external-agent-adapter, and codegen-target registration loading for runtime/status payloads. |
| Complete | Plugin backend route dispatch | Go serves `/api/plugins/{pluginId}/...` through the Go backend runtime. |
| Complete | Plugin-defined backend MCP tools | Go owns plugin-defined backend MCP tool registration and invocation. |
| Complete | Plugin static-directory serving | Go owns `/plugin-static/{pluginId}/...` for registered plugin static dirs. |
| Complete | Plugin worker `read_project_state` and listener-endpoint registration capture | Current ownership is in `internal/plugins` plus the Go listener producer/runtime. |
| Complete | Plugin listener-endpoint websocket dispatch | Go owns websocket dispatch for plugin listener endpoints on `/ws/listeners/{listenerID}`. |
| Complete | Plugin backend runtime refresh after plugin mutations | Route/tool/static/listener ownership refresh after successful mutations is Go-owned. |
| Complete | Plugin-defined language-server execution and refresh | Go owns plugin code-language routing plus post-mutation language-server refresh. |
| Complete | Plugin codegen registration visibility | The active plugin/runtime/codegen selection path is Go-owned. |
| Missing | Plugin-defined external-agent execution | Runtime visibility and config selection are Go-owned, but plugin-backed external-agent execution is still explicitly out of scope. |
| Missing | Caller-backed proof for config-write-triggered backend/LSP reload | The repo intentionally defers speculative config-write reload behavior until a concrete caller requires it. |

## 8. File browser, binary payloads, attachments, artifacts, and git

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | Workspace file-browser reads/writes/transfers/downloads | Phase 22 marks the file-browser cluster as Go-owned. |
| Complete | Binary payload upload/download | Go owns `binary/upload` and `binary/{contentId}` for the current preview/snapshot surface. |
| Complete | Token-backed chat attachment download route | The current Go owner is `internal/chatattachments` plus `internal/httpapi/attachment_routes.go`. |
| Complete | Git read surface | Phase 20 marks `git/status`, `git/diff`, `git/log`, `git/commitDetails`, and `git/commitFileDiff` as Go-owned. |
| Partial | IDE artifact import/update/delete and cached artifact reads | Go owns the current artifact cluster, but write support is intentionally bounded to `File`, `BrushStroke`, and `DrawAreaLayerItemTransform`; the draw-area canvas still uses Python-owned `appendDrawAreaLayerItem`. |
| Partial | Share/app artifact overlays | Go owns per-session overlay reads and writes, but the same bounded artifact-write limits still apply. |
| Missing | Legacy artifact helper routes | Older routes like `loadArtifacts`, `loadAvailableArtifacts`, `loadArtifactFromDisk`, `sendArtifact`, and `getArtifactIdsFromNamePathType` are not recreated in Go. |
| Missing | Legacy attachment URL helper routes still used by the current frontend | Chat/UI callers still use `getAttachmentDownloadUrl` and `getAttachmentDownloadUrls`; the Go-owned surface is the token-backed download endpoint itself. |

## 9. Remaining Python-only or intentionally omitted legacy route families

These are the biggest Python-owned or intentionally omitted route families
after checking both the historical route inventory and current frontend
callers.

### Active current-frontend callers that still hit Python-owned routes

- App-definition REST routes:
  - `getAppDefinition`
  - `setAppDefinition`
  - `validateAppDefinition`
  - `getAppCatalog`
- App-spec streaming helper route:
  - `streamAppSpec`
- Helper/admin routes:
  - `restartLanguageServer`
  - `typeCheck`
  - `docstringToMarkdown`
  - `revealPathInOsFileExplorer`
- Python-era websocket route shapes still used by the current frontend:
  - `/frontend`
  - `/share/frontend`
  - `/{projectConfigId}/{sectionId}/{id}` terminal websocket path
- Attachment URL helper routes:
  - `getAttachmentDownloadUrl`
  - `getAttachmentDownloadUrls`
- Default-project and JSON-source/file helper routes:
  - `getDefaultConfigName`
  - `setAsDefaultProject`
  - `createFile`
  - `deleteJsonSourceFileAndVariant`
- Large direct project-graph and section-config mutation tails:
  - child-section create/delete
  - edge and agentic-edge mutation
  - copy/paste/group/ungroup/move plus undo/redo helpers
  - section-variant create/delete/select/default/name/sort/frozen and JSON-source-key toggles
  - param entered-value/order/selection/update and kwarg helpers
  - prompt/codegen-prefix-suffix and code-object/file-binding/attached-terminal helpers
  - section sizing/filter/edge-input-output/group-overflow/list-root/parent-default-child/column-width helpers
  - text-block, browser, spreadsheet, task-board, chart, image, and social/link metadata
  - password-param and subprocess helper routes (`getPasswordParamValue`, `killSubprocesses`)
- Artifact/draw-area helper route:
  - `appendDrawAreaLayerItem`

### Dormant or not-proven-current-caller legacy families

- Detached-run and CLI-output transport:
  - `runDetached`
  - `getRunStatus`
  - `cancelRun`
  - `/cli`
  - `/cli/{id}`
  - `/pythonScript/{id}`
- Generic chat CRUD/metadata routes:
  - `createChat`
  - `getChat`
  - `appendChatMessages`
  - `deleteChat`
  - `getAllChatMetadata`
  - `getAllLLMChatMetadata`
  - `deleteLLMChat`
  - `setChatSystemPrompt`
- Remaining legacy app-spec helpers:
  - `updateAppDefinition`
  - `listAppComponents`
- Settings-project and remaining JSON-source/export helper routes:
  - `loadSettingsProject`
  - `saveSettingsProject`
  - `newJsonVersionName`
  - `getJsonSourcePathToBeDeleted`
  - JSON export/import helper routes
- Old route shapes that were replaced rather than preserved:
  - `runMcpTools` was replaced by the Go MCP server/tool-call boundary
  - version-specific deployment session routes
    (`/share|app/deployments/{deploymentName}/{version}/session`) were not
    recreated; the current Go surface uses `.../current/session`

## Bottom line

For the current clean-break rewrite scope, the active Go backend now owns the
main product-facing runtime surface:

- auth/modes/settings
- project shell and current project-state transport
- listener coverage and force-refresh plus the replacement websocket/terminal runtime
- LSP/watch-code
- MCP/tooling
- deployments/launcher/workspace launch
- plugins
- git/file browser/artifacts
- current agentic, app-gen skills, and transcription surfaces

The remaining gaps are concentrated in older Python-only route tails,
intentionally bounded AI/plugin behavior, and still-live frontend callers that
continue to hit Python-owned HTTP routes and websocket path shapes.

Treat the active caller-backed gaps as remaining rewrite surface, not as
dormant historical debris.
