# Caller-Backed Backend Surface Checklist

Snapshot date: 2026-03-10.

Primary agent entrypoint: `docs/plans/go-backend-rewrite/CURRENT.md`.

Audit/maintenance plan:
`docs/plans/go-backend-rewrite/caller-backed-backend-surface-checklist-audit-plan.md`.

Companion broad-coverage inventory:
`docs/plans/go-backend-rewrite/backend-capability-coverage-checklist.md`.

This checklist is a caller-backed rewrite-status inventory, not a promise of
route-for-route Python parity.
It answers: does the active caller reach a Go-owned backend surface today?

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
| Complete | Live settings-state load/save and websocket updates | Go owns `loadSettings`, `saveSettings`, and the current caller-backed settings live-update path through `internal/settingsstate`, `internal/httpapi/settings_routes.go`, and the active `/ws/frontend` frontend websocket caller. |
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
| Complete | Frontend websocket auth, identity, and connection inventory | Go owns `/ws/frontend`, frontend affinity tokens, and connection broadcasts under `internal/wsapi`/`internal/realtime`, and the current frontend websocket caller now connects to that Go route in IDE/share/app flows. |
| Complete | Frontend realtime UI-change and dependency-event routing | Go owns the active `/ws/frontend` producer/broadcaster path, and current frontend realtime UI-change and dependency-event messages now flow through that Go websocket route. |
| Complete | Listener coverage reads | Go owns `getListenerCoverage` through `internal/realtime` and `internal/httpapi/listener_routes.go`. |
| Complete | Listener force-refresh transport | Go owns `forceRefreshListener`, and the current frontend listener actions call that Go HTTP route today. |
| Partial | Listener websocket dispatch for plugin listener endpoints | `internal/wsapi` plus Phase 15 listener endpoint work own websocket dispatch for plugin-registered listener endpoints, but the repo does not currently contain a non-test frontend caller that proves `/ws/listeners/{listenerID}` is part of the active caller-backed surface. |
| Partial | Built-in listener endpoint parity beyond the active plugin caller surface | The plan still calls out built-in endpoint dispatch, listener temp-id negotiation, and related follow-ons as deferred. |
| Partial | Terminal PTY runtime | `internal/terminals` owns the replacement PTY runtime, and the current IDE frontend terminal attach flow now reaches Go's `/ws/terminals/{projectID}/{sectionID}` route. Deployment/share/app terminal transport remains intentionally deferred because the Go route is still IDE-only pending a Go-owned share-policy source of truth. |
| Partial | Terminal websocket attach/history replay/resize behavior | The active IDE caller now opens Go's `/ws/terminals/{projectID}/{sectionID}` websocket path for ready/history replay/input/resize behavior. Deployment/share/app terminal viewing still uses the legacy `/{projectConfigId}/{sectionId}/{id}` websocket path until that deferred transport slice is reopened. |
| Partial | Terminal cleanup HTTP routes | Go registers `deleteTerminals` and `interruptTerminalProcesses`, but the repo does not currently contain a non-test frontend caller that proves those cleanup routes are part of the active caller-backed surface; `interruptTerminalProcesses` is also absent from the generated frontend route set. |
| Partial | `runCode` execution path | Go owns the current IDE/share/app `runCode` surface, and IDE terminal output now reaches the Go `/ws/terminals/{projectID}/{sectionID}` websocket route. `cliId` output transport is still explicitly unsupported, and deployment/share/app terminal viewing remains on the deferred legacy websocket path. |

## 4. Project state, project shell, code editing, LSP, and watch-code

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | Project-state runtime and persistence | The main Go owners are `internal/projectstate`, `internal/projectview`, and `internal/app`. |
| Complete | Project shell reads | Go owns `loadAllProjectMetadata` and `loadProjectConfig`. |
| Complete | Project lifecycle mutations | Go owns `saveProject`, `createProjectConfig`, `saveAsNewProjectConfig`, `deleteProjectConfigs`, and `setProjectConfigName`. |
| Partial | Default-project helper routes still used by the current frontend | `HomePage` now reaches Go-owned `setAsDefaultProject`, but `GlobalWrapper` still POSTs Python-owned `getDefaultConfigName` instead of deriving the redirect target from Go-owned project-shell metadata. |
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
| Missing | Type-error ignore HTTP route still used by the current frontend | The type-error context menu still POSTs Python-owned `setTypeErrorIgnore`; Go exposes the bounded write only as the MCP tool `set_type_error_ignore`, not as a legacy HTTP route. |
| Missing | Password/subprocess helper routes still used by the current frontend | Param inputs and stop-code flows still call Python-owned `getPasswordParamValue` and `killSubprocesses`; Go does not register those HTTP endpoints today. |
| Missing | Large tail of direct HTTP project-graph and section-config mutations from Python | Child-section creation/deletion, edge and agentic-edge mutation, copy/paste/group-orientation/group/ungroup/move/undo/redo flows, section-variant create/delete/select/default/name/sort/frozen and JSON-source-key mutation, param entered-value/order/selection/indent/update and kwarg helpers, prompt/codegen-prefix-suffix and code-object naming/display/file-binding/attached-terminal helpers, section sizing/filter/meta-control-title/edge-IO/group-overflow/list-root/parent-default-child/column-width helpers, and text-block display/format, browser view/search/column, spreadsheet, task-board, chart, image, and social/link mutations are still current-frontend callers but do not have direct Go HTTP routes. |
| Missing | Input-area and JSON-source file helpers still used by the current frontend | Current callers still use Python-owned `createFile` and `deleteJsonSourceFileAndVariant`. |

## 5. MCP, app-spec ownership, tool registry, and LLM config

| Status | Feature | Notes |
| --- | --- | --- |
| Complete | Authenticated Go MCP server/client foundation | `internal/mcpx` is the current owner for the internal MCP server/client boundary. |
| Complete | MCP runtime status and direct tool-call transport | Go owns `mcpServerRuntimeStatus` and `__setta__/tools/call`. |
| Complete | Tool metadata, search, namespacing, and scoped invocation | Current ownership is split across `internal/tools` and `internal/mcpx`, with broad Go test coverage. |
| Complete | Frontend-affinity-aware UI-setting tool flows | Go owns UI-setting reveal/result flows across `internal/realtime`, `internal/uisettings`, and `internal/mcpx`, and the current frontend now reaches that end-to-end path over `/ws/frontend`. |
| Complete | Current Setta MCP write/read tool surface used by the app | The repo now contains large Go-owned tool coverage for UI settings, plugin management, app-definition tooling, agent-profile tools, and related project-state tooling. |
| Complete | App-spec store, validation, diagnostics, and patch streaming foundations | `internal/appspec` is the current Go owner for bounded app-definition/app-spec state used by the MCP surface. |
| Complete | LLM config and managed API-key reads/writes | Go owns `GET/POST /llm/config` and `GET/POST /llm/apiKeys` via `internal/llmconfig`. |
| Partial | External file-watch parity for `.env` and `llm_config.json` | Immediate runtime refresh is Go-owned, but broad external watch parity remains explicitly deferred. |
| Missing | Legacy app-definition REST and app-spec streaming routes still used by the current frontend | The app-config pane still calls `getAppDefinition`, `setAppDefinition`, `validateAppDefinition`, `getAppCatalog`, and raw `streamAppSpec`; Go owns app-spec state and MCP tools, not these HTTP routes. |

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
| Partial | Managed chat runtime | Go owns `getLLMResponse`, `getLLMChat`, `stopLLMChat`, live websocket streaming, MCP-tool execution, and bounded OpenAI execution; the current frontend caller now reaches the Go websocket path, while broader provider parity plus managed reasoning output remain intentionally incomplete and the current OpenAI provider edge still needs the selected `openai-go` convergence follow-on. |
| Partial | Managed tool-preview parity | The current Go runtime covers the landed `tool_argument_preview_delta` and `AIFollowToolResultUpdate` paths, and the active caller now reaches those live preview updates over `/ws/frontend`, but not every historical preview kind is implemented. |
| Partial | External-agent health/preflight parity | Current config/health reads are Go-owned, but richer Python-only plugin/env-var/cache preflight semantics remain deferred. |
| Complete | Transcription-profile reads and CRUD | Go owns `getTranscriptionProfiles`, `createTranscriptionProfile`, `updateTranscriptionProfile`, and `deleteTranscriptionProfile`. |
| Complete | Transcription-session file mode and realtime mode | Go owns `startTranscriptionSession`, `appendTranscriptionAudio`, `stopTranscriptionSession`, and `cancelTranscriptionSession`; the transport/runtime ownership is landed even though the current OpenAI provider edge still needs the selected `openai-go` convergence follow-on. |

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
| Partial | Plugin listener-endpoint websocket dispatch | Go owns websocket dispatch for plugin listener endpoints on `/ws/listeners/{listenerID}`, but the repo does not currently contain a non-test frontend caller that proves this replacement websocket route is active in the caller-backed surface. |
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
| Partial | IDE artifact import/update/delete and cached artifact reads | Go owns the current artifact cluster, but `updateArtifacts` is intentionally bounded to `File`, `BrushStroke`, and `DrawAreaLayerItemTransform`, `deleteArtifacts` only supports `File`, and the draw-area canvas still uses Python-owned `appendDrawAreaLayerItem`. |
| Partial | Share/app artifact overlays | Go owns per-session overlay reads and writes, but the same bounded artifact limits still apply: overlay updates are restricted to `File`, `BrushStroke`, and `DrawAreaLayerItemTransform`, and overlay deletes only support `File`. |
| Missing | Legacy artifact helper routes still used by the current frontend | The UI still calls Python-owned `loadAvailableArtifacts`; other older helpers like `loadArtifacts`, `loadArtifactFromDisk`, `sendArtifact`, and `getArtifactIdsFromNamePathType` are not recreated in Go either. |
| Missing | Legacy attachment URL helper routes still used by the current frontend | Chat/UI callers still use `getAttachmentDownloadUrl` and `getAttachmentDownloadUrls`; the Go-owned surface is the token-backed download endpoint itself. |

## 9. Remaining Python-only or intentionally omitted legacy route families

These are the biggest Python-owned or intentionally omitted route families
after checking both the historical route inventory and current frontend
callers.

### Active current-frontend callers that still hit Python-owned routes

- App-definition REST and app-spec streaming routes:
  - `getAppDefinition`
  - `setAppDefinition`
  - `validateAppDefinition`
  - `getAppCatalog`
  - `streamAppSpec`
- Helper/admin routes:
  - `restartLanguageServer`
  - `typeCheck`
  - `docstringToMarkdown`
  - `revealPathInOsFileExplorer`
- Type-error helper route:
  - `setTypeErrorIgnore`
- Python-era websocket route shapes still used by the current frontend:
  - deployment/share/app terminal websocket path `/{projectConfigId}/{sectionId}/{id}`
- Attachment URL helper routes:
  - `getAttachmentDownloadUrl`
  - `getAttachmentDownloadUrls`
- Default-project helper routes:
  - `getDefaultConfigName`
- File and JSON-source helper routes:
  - `createFile`
  - `deleteJsonSourceFileAndVariant`
- Password and subprocess helper routes:
  - `getPasswordParamValue`
  - `killSubprocesses`
- Artifact helper routes:
  - `loadAvailableArtifacts`
  - `appendDrawAreaLayerItem`
- Large direct project-graph and section-config mutation tails:
  - child-section create/delete
  - edge and agentic-edge mutation
  - copy/paste/group-orientation/group/ungroup/move plus undo/redo helpers
  - section-variant create/delete/select/default/name/sort/frozen and JSON-source-key toggles
  - param entered-value/order/selection/indent/update and kwarg helpers
  - prompt/codegen-prefix-suffix and code-object naming/display/file-binding/attached-terminal helpers
  - section sizing/filter/meta-control-title/edge-input-output/group-overflow/list-root/parent-default-child/column-width helpers
  - text-block display/format, browser view/search/column, spreadsheet, task-board, chart, image, and social/link metadata

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
- Remaining legacy artifact helper routes:
  - `loadArtifacts`
  - `loadArtifactFromDisk`
  - `sendArtifact`
  - `getArtifactIdsFromNamePathType`
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
intentionally bounded AI/plugin behavior, still-live frontend callers that
continue to hit Python-owned HTTP routes, and the remaining deployment/share/app
terminal websocket path shape.

Treat the active caller-backed gaps as remaining rewrite surface, not as
dormant historical debris.
