# Go-Owned Type Generation Cleanup Plan

## Goal
Make Go the source of truth for shared backend, frontend, and Python types.

Status: not complete.

The merge-prep cleanup removed a large amount of duplicate ownership, but the
broader goal is still not finished: `backend/setta/types/` still contains too
many handwritten Python wrappers whose only purpose is to preserve legacy
Python-side typing, discriminator, or default behavior around Go-generated
models.

That means:
- `backend/setta/types/` should contain very few handwritten files.
- Shared Go-owned types should be generated broadly, then pruned.
- The remaining handwritten Python types should be clearly Python-only.
- The Go backend should stay clean too: no duplicate Go definitions just to satisfy generation.

## Principles
- If a type already exists in a real Go backend owner package, reuse it.
- Do not replace one manual allowlist with another manual allowlist in a different file.
- Prefer package discovery plus pruning over hand-maintained type inventories.
- Route and endpoint specs may stay explicit when they are fundamentally route definitions rather than plain data-type discovery.
- Delete tests that only assert that specific generated type names appear in generated output.

## Current State

### Why This Is Not Finished
- The intended end state is not just "far fewer handwritten files"; it is that
  Go is the real source of truth and Python adapts to that generated surface
  instead of re-introducing hand-maintained shape decisions in thin wrappers.
- Some surviving handwritten classes in `backend/setta/types/` still do not
  meet that bar. They subclass generated Go-owned Python models but only
  restate discriminator literals, duplicate defaults already present on the
  generated base, or narrow Python unions without adding meaningful runtime
  behavior.
- Example: `backend/setta/types/chat.py::MessageThinkingDelta` currently exists
  as a handwritten subclass of the generated `MessageThinkingDelta`, but the
  generated base already owns the actual fields. The remaining handwritten
  class mostly exists to preserve Python-side discriminator narrowing rather
  than to express a distinct Python-only runtime concern.
- That pattern indicates the cleanup is still incomplete. It means Python is
  still partially dictating shared type shape in places where the Go-owned
  generated model should be authoritative.
- Similar remaining work likely includes:
  - literal-only subclasses
  - duplicate field/default redeclarations that do not change behavior
  - Python-side public unions and wrappers that only exist because callers have
    not yet been updated to consume the generated Go-owned surface directly

### Remaining Bar
- Audit every surviving handwritten class in `backend/setta/types/` and delete
  any class that only restates generated structure without meaningful
  Python-only behavior.
- Adapt Python callers and tests to consume generated Go-owned models directly
  wherever possible instead of preserving legacy handwritten wrapper surfaces.
- Keep handwritten code only when it is genuinely Python-only runtime glue, for
  example:
  - OpenAI-format helpers or other SDK-only conversion helpers
  - private non-serialized runtime state such as binary payload side channels
  - hashable/frozen key wrappers when required by Python runtime container use
  - minimal helper functions such as id generation when they are not shared
    schema owners
- If a remaining handwritten wrapper is still needed only because the generator
  emits types that are too broad for Python callers to use directly, that
  should be treated as generator/runtime follow-up work, not as a justification
  to keep an unnecessary handwritten schema layer indefinitely.
- Completion should mean that no handwritten class remains solely to narrow a
  discriminator, restate a generated default, or preserve a legacy Python type
  surface when the Go-owned generated type can be used directly.

### Completed
- Go type discovery is no longer driven by a hand-maintained frontend root manifest.
- `cmd/setta-gen-go-type-registries` now generates:
  - `internal/frontendbindings/discovered_type_roots_gen.go`
  - `internal/pythonsdkcontracts/discovered_contract_types_gen.go`
- `internal/pythonsharedtypes/contracts.go` now widens from discovered Go-convertible types instead of maintaining a separate Python-side inventory.
- Go -> Python already follows a real generate-then-prune path:
  - `frontend/generation/generate_go_python_types.sh`
  - `backend/scripts/prune_generated_types.py`
- TypeScript pruning already exists and matches the main-branch cleanup model:
  - `pnpm full-cleanup`
  - `frontend/scripts/runKnip.mjs`
  - `pnpm gcf`
- `backend/setta/types/generated/` has been collapsed to a single real generated file:
  - `backend/setta/types/generated/go_shared_types.py`
- The dead Python-owned impl and union generation layer is gone:
  - removed `section_impls.py`
  - removed `code_obj_impls.py`
  - removed `core.py`
  - removed generated union wrappers
  - removed generated `effective_impls.py`
  - removed the dead Python generators that existed only to support those files
- Low-value tests that only pinned generated type inventories or specific generated names have already been removed.
- `project_config.py` has been reduced substantially:
  - most nested project-state data models now come from `go_shared_types.py`
  - the handwritten remainder is mainly Python-side defaults and codegen-policy resolution logic
- Go type discovery now handles selector-backed named wrappers generically, so generated registries can keep frontend-facing names while still pointing at real backend owner types.
- `cmd/setta-gen-go-type-registries` now also generates a generic frontend wrapper-override registry, and `internal/frontendbindings/converter.go` uses that instead of a hardcoded canonical-type switch.
- `internal/frontendbindings/project_state_support.go` now points a large part of the project-state surface at real owner structs instead of empty placeholder structs.
- `internal/frontendbindings/project_state_support.go` has been reduced further by wrapping more real backend owners instead of repeating local contract shapes, including:
  - `RenameRefactorMode`
  - `StateMachineGateUIState`
  - `TypeErrorIgnoreState`
  - `BrowserSavedSearchTypeFilters`
  - `BrowserSavedSearch`
  - `TaskBoardColumn`
  - `TaskBoardTask`
  - `CodeSectionDiagnosticsIgnoreState`
  - `CodeSectionImpl`
  - `TerminalSectionImpl`
  - `DeleteProjectConfigsResponse`
  - `DeleteNotificationResponse`
  - `CreateNewSectionVariantResponse`
  - `SetCallableChildCodeObj`
  - `SignatureHelpStatus`
  - `SetCallableResponse`
  - `CodeFileBindingUpdate`
- `internal/frontendbindings/artifact_support.go` and `contracts.go` now use backend-owned wrapper types for the artifact/binary leaf contract family instead of repeating field layouts locally.
- parts of `internal/frontendbindings/ai_settings_support.go` now use backend-owned wrapper types for enum/env-status families instead of repeating local string enums and structs.
- the external-agent config/settings family now has a real backend owner in `internal/externalagentconfigs` instead of large mirrored structs in `frontendbindings`:
  - `ClaudeSettingsSource`
  - `ClaudeSettingsPermissions`
  - `ClaudeSettingsManaged`
  - `OpenCodeSettingsManaged`
  - `SettingsManagedBlock`
  - `Config`
- `internal/frontendbindings/ai_settings_support.go` now aliases that owner-backed external-agent config/settings family instead of repeating the field layouts locally.
- `internal/frontendbindings/ai_settings_support.go` no longer keeps pass-through wrapper enum constants just to feed generation; owner-backed wrapper enums now resolve generically from their imported backend packages.
- the external-agent preflight response now has an explicit Go route-contract owner in `internal/httpapi`:
  - `httpapi.ExternalAgentPreflightStatus`
- `internal/frontendbindings/ai_settings_support.go` now aliases that exported HTTP response type instead of owning the preflight field layout locally.
- the Go -> Python generator now treats `omitempty` fields as absent-capable unless an explicit Python default override is provided, so generated Python models stay aligned with Go JSON omission behavior.
- duplicated prompt-format ownership inside Go has been collapsed:
  - `internal/projectstate.PromptFormat` is gone
  - `internal/prompttemplates.Format` is now the single backend owner
  - frontend/Python generation still exports `PromptFormat`, but it now wraps the real owner instead of mirroring a duplicate backend enum
- the generated type-registry writer now only imports packages that are actually referenced by emitted wrapper overrides, so cleanup passes do not leave stale generated imports behind.
- `internal/frontendbindings/ai_settings_support.go` now uses owner-backed wrappers for the prompt-template and LLM config families where the backend structs already matched cleanly:
  - `PromptTemplate -> prompttemplates.Template`
  - `MCPServerConfig -> llmconfig.ServerConfig`
  - `LLMConfig -> llmconfig.Config`
  - `AllLLMConfigs -> llmconfig.AllConfigs`
- `internal/frontendbindings/ai_endpoint_contracts.go` now uses the backend-owned `llmconfig.ManagedAPIKeysSnapshot` instead of a mirrored local struct.
- the structured dependency wire family now has a real backend owner in `internal/realtime`:
  - `DependencyKeyType`
  - `SectionDependencyKey`
  - `SectionParamDependencyKey`
  - `DependencyValueType`
  - `LiteralDependencyValue`
  - `FileReadDependencyValue`
  - `BinaryDependencyValue`
- `internal/frontendbindings/contracts.go` now aliases those realtime-owned dependency enums and structs instead of repeating empty local placeholder structs for the concrete wire objects.
- `project_config.py` no longer carries a handwritten `Viewport`; `go_shared_types.py` now provides that Go-owned model with the Python-side default values the SDK expects.
- `internal/pythonsharedtypes/discovered_shared_types_gen.go` now scans real owner packages directly, not just `projectstate`:
  - `internal/projectstate`
  - `internal/realtime`
  - `internal/artifacts`
  - `internal/scriptablechat`
- `internal/projectview`
- `internal/pythonsdkcontracts` when those owner types are referenced by surviving shared models
- the Python shared-type pipeline still prunes aggressively afterward, so widening owner-package discovery no longer requires hand-maintaining another allowlist just to keep the output small.
- `internal/realtime` now owns typed listener/streaming enums instead of leaving those names implicit in plain string constants:
  - `StreamingEventType`
  - `ListenerMessageType`
  - `ListenerDependencyMode`
- the draw-area / artifact payload family now has real Go owners in `internal/artifacts`:
  - `DrawAreaBrushShape`
  - `DrawAreaMode`
  - `BrushStroke`
  - `BrushStrokeWithTransform`
  - `DrawAreaLayerItemTransform`
  - `DrawAreaLayer`
  - `BrushStrokeArtifact`
  - `DrawAreaLayerItemTransformArtifact`
- `internal/frontendbindings/ai_runtime_support.go` now points the streaming-event family at realtime-owned structs instead of repeating local field layouts:
  - `MessageTextDelta`
  - `MessageThinkingDelta`
  - `MessageStartEvent`
  - `MessageDeltaEvent`
  - `ToolCallDeltaEvent`
  - `ToolResultEvent`
  - `ToolArgumentPreviewDeltaEvent`
  - `MessageStopEvent`
  - `MessageFinalizedEvent`
- the Go -> Python generator now orders generated models by dependency, so broader discovery does not break when one generated model references another generated model defined later in discovery order.
- `scriptablechat.Chat` and `scriptablechat.ChatMetadata` now export their `llmConfig` field through the generated `LLMConfig` name, so the generated Python chat models stay aligned with the rest of the Go-owned AI settings surface.
- `backend/setta/types/chat.py` no longer hand-owns the chat metadata / section-state field layouts:
  - `Chat`, `ChatMetadata`, `ChatSectionBranch`, and `ChatSectionState` now subclass Go-generated base models and only keep the Python-side typed message fields / defaults.
- the chat streaming event adapters now live in `backend/setta/types/chat.py`:
  - the event classes subclass Go-generated realtime event models and only keep the Python-side typed chat-message / preview-id wrappers.
- `internal/scriptablechat` now owns the concrete chat-message schema family that used to live only in frontendbindings/Python:
  - `ChatRole`
  - `ChatFileAttachment`
  - `MessageTextContent`
  - `MessageImageURL`
  - `MessageImageURLContent`
  - `MessageThinkingContent`
  - `ToolReferenceContent`
  - `ToolCallFunction`
  - `ToolCall`
  - `SystemChatMessage`
  - `AssistantChatMessage`
  - `UserChatMessage`
  - `ToolChatMessage`
- `internal/frontendbindings/project_state_support.go` now points the detailed chat-message schema family at `internal/scriptablechat` instead of keeping local placeholder owners.
- the chat message adapters now live in `backend/setta/types/chat.py`:
  - the Python classes subclass Go-generated base models and only keep Python-side validators, defaults, typed unions, and OpenAI-format helpers.
- `backend/setta/types/artifact.py` no longer hand-owns the draw-area artifact payload layouts:
  - the Python classes now subclass Go-generated base models and only keep Python-side chart settings, tuple-typed point wrappers, ids, and defaults.
- the chart artifact family now has real Go owners for the remaining shared schema pieces:
  - `internal/projectstate.LineChartSettings`
  - `internal/projectstate.ScatterChartSettings`
  - `internal/artifacts.ChartDataValue`
- `backend/setta/types/artifact.py` no longer hand-owns chart-settings field layouts:
  - the Python chart-settings classes now subclass Go-generated models and only keep discriminator literals
- `backend/setta/types/listener.py` no longer owns the dependency-mode values; it now wraps the Go-owned generated values and keeps only the Python-facing member names and runtime glue.
- the Go -> Python generator now applies discovered wrapper overrides to nested owner-backed field types too, so generated Python models use the same public wrapper names for embedded fields that they use for top-level discovered roots.
- the Go -> Python generator now also preserves named Go string-enum field types inside generated models instead of flattening them to plain `str`, which makes the generated Python surface much closer to the real backend schema.
- `internal/stringenumvalues` now resolves named string wrappers transitively across imported owner types, so the TS generator no longer needs hardcoded enum cases for:
  - `MCPServerTransport`
  - `PromptFormat`
  - `ExternalAgentToolType`
  - `ExternalAgentRunMode`
  - `ExternalAgentSettingsMode`
  - `ExternalAgentWorkingDirStrategy`
  - `ClaudeSettingsSource`
- `backend/setta/types/protocol.py` now owns the narrow Python-only dependency protocol glue:
  - frozen/hashable dependency-key wrappers for listener-runtime dictionary/set usage
  - discriminated-union adapters over Go-generated dependency-value models
- the frontend-facing project codegen policy family now has a real Go owner in `internal/projectview` instead of empty `frontendbindings` placeholders:
  - `ProjectCodegenLanguage`
  - `SectionCodegenMode`
  - `SectionRepresentationMode`
  - `CodeObjValueRepresentationMode`
  - `SectionTypeCodegenPolicy`
  - `SectionCodegenOverride`
  - `SectionCodegenPolicy`
  - `CodeObjTypeValuePolicy`
  - `CodeObjValueOverride`
  - `CodeObjValuePolicy`
  - `ProjectCodegenPythonTarget`
  - `ProjectCodegenPluginTarget`
- `internal/frontendbindings/project_state_support.go` now aliases that project-codegen family to `internal/projectview` instead of declaring local mirror structs/enums.
- the deployment session / project-metadata / follow-update / completion family has also been pushed onto real backend owners:
  - `internal/httpapi` now owns `ShareDeploymentSessionResponse`, `AppDeploymentSessionResponse`, and the exported `DeploymentMetadataResponse`
  - `internal/projectshell` owns `AllProjectMetadata`
  - `internal/projectstate` owns `ProjectConfigMetadata`
  - `internal/deployments` owns `Type`, `ListenerConfig`, `Manifest`, `RunSnapshotMode`, and `Policy`
  - `internal/realtime` owns `AIFollowToolArgumentsUpdateContent` and `AIFollowToolResultUpdateContent`
  - `internal/lspcompletion` owns `CodeMirrorCompletion`
- `internal/frontendbindings/project_state_support.go` now wraps that owner-backed deployment / project-metadata / follow-update / completion family instead of repeating those field layouts locally.
- the share/app deployment metadata naming split has been collapsed on the generated frontend side:
  - `DeploymentMetadata` / `DeploymentMetadataList` now back both share and app deployment catalog endpoints
  - `frontendbindings` no longer keeps separate `ShareDeploymentMetadata` and `AppDeploymentMetadata` mirror types for the same HTTP payload
- the generated agent / engine / transcription endpoint surface no longer goes through unused `*Response` alias names:
  - deleted the empty `AgentProfileResponse`, `AgentProfileListResponse`, `AgentRunResponse`, `AgentRunListResponse`, `EngineConfigResponse`, `EngineConfigListResponse`, `TranscriptionProfileResponse`, and `TranscriptionProfileListResponse` wrappers
  - endpoint specs and generated endpoints now point directly at `AgentProfile`, `AgentProfileList`, `AgentRun`, `AgentRunList`, `EngineConfig`, `EngineConfigList`, `TranscriptionProfile`, and `TranscriptionProfileList`
  - the matching manual converter alias entries were removed too
- `backend/setta/types/project_config.py` no longer hand-owns the project codegen target / policy field layouts:
  - those Python classes now subclass Go-generated base models and only keep Python-side richer key typing, defaults, and validation.
- the nested project-config policy leaf wrappers have been reduced further:
  - `SectionTypeCodegenPolicy`, `SectionCodegenOverride`, `CodeObjTypeValuePolicy`, and `CodeObjValueOverride` no longer exist as handwritten subclasses in `backend/setta/types/project_config.py`
  - the remaining Python code now supplies their defaults explicitly at construction time instead of preserving separate handwritten leaf wrapper classes
- `backend/setta/types/project_config.py` no longer hand-owns the top-level `ProjectConfig` field layout:
  - the Python class now subclasses the Go-generated `ProjectConfig` model and only keeps Python-side defaults, richer key typing, and validation
- the dead Python-only project-config policy helper layer has been removed:
  - deleted unused `resolve_*codegen_policy` / `get_*codegen_target` helpers
  - deleted the test that existed only to exercise that dead helper layer
- `backend/setta/types/listener.py` now also owns the handwritten websocket envelope adapters:
  - the Python message classes subclass Go-generated listener message models and only keep the Python-side typed content wrappers, discriminator literals, and `TypeAdapter`
- the listener register/ack transport family has been reduced further:
  - `ListenerRegisterCallback`, `ListenerRegisterContent`, and `ListenerRegisterAckContent` no longer exist as handwritten subclasses in `backend/setta/types/listener.py`
  - that register/ack family now reuses the generated Python SDK contract models directly, while the handwritten listener layer keeps only the websocket envelope/type-adapter glue and the runtime-only pieces
- the Go -> Python generator now handles shared models that depend on SDK-contract owner types without special per-type wiring:
  - if a referenced owner type is part of the shared discovered surface, it is generated locally
  - if a referenced owner type is genuinely external to `go_shared_types.py`, the generator can emit the needed Python import line
- `internal/frontendbindings/ai_runtime_support.go` no longer mirrors the runtime agent / engine / transcription / detached-run field layouts:
  - `EngineType`, `EngineConfigDefaults`, `EngineRuntimeSupport`, and `EngineConfig` now wrap `internal/agentruns`
  - `AgentProfile` now wraps `internal/agentprofiles`
  - `TranscriptionTransportMode` and `TranscriptionProfile` now wrap `internal/transcriptionprofiles`
  - `AgentRunStatus`, `RunEvent`, and `AgentRun` now wrap `internal/agentruns`
  - `DetachedRunStatus` and `DetachedRun` now wrap `internal/detachedruns`
- `internal/stringenumvalues` now resolves wrapper enums transitively even when the wrapper package defines no local enum constants, so owner-backed wrapper enums no longer need local pass-through const blocks or hardcoded TS converter entries just to keep their enum values.
- the TS converter no longer hardcodes runtime enum inventories for:
  - `EngineType`
  - `TranscriptionTransportMode`
  - `AgentRunStatus`
- `internal/scriptablechat` now owns the chat-toolkit action payload family too:
  - `ChatSendAction`
  - `ChatStopAction`
  - `ChatSendEvent`
  - `ChatStopEvent`
- `internal/frontendbindings/project_state_support.go` now aliases that chat-action family to `internal/scriptablechat`, so the TS generated surface and the Python generated surface both pick it up from the same Go owner.
- `backend/setta/types/chat_toolkit.py` has been deleted; the Python chat-toolkit code now imports the generated Go-owned event models directly.
- `frontend/src/components/Section/Layouts/ChatArea.tsx` no longer keeps its own handwritten chat-action payload shape; it now uses the generated chat-action event types.
- duplicate backend ownership has been reduced further instead of teaching generators to arbitrate between equivalent owners:
  - `managedchat.ChatPermissionMode` and `externalagents.ChatPermissionMode` now alias the single owner `projectstate.ChatPermissionMode`
  - `runs.RunSnapshotMode` now aliases the single owner `deployments.RunSnapshotMode`
- small route/callable contract shims have been reduced further:
  - `projectstate.SetCallableResponse` now carries the correct optional `callableId` owner tag
  - `frontendbindings` no longer needs a local `SetCallableResponse` shape just to preserve optionality
- more non-project-state `frontendbindings` support files now wrap real backend owners instead of repeating response/runtime shapes:
  - `internal/frontendbindings/ai_endpoint_contracts.go` now wraps `httpapi.TranscriptionSessionDeltaResponse`, `httpapi.StateMachineRunControlResponse`, and `httpapi.RunDetachedResponse`
  - `internal/frontendbindings/terminal_support.go` now wraps `httpapi.InterruptTerminalProcessesResponse`
  - `internal/frontendbindings/filebrowser_support.go` now wraps `filebrowser.RootResponse`, `filebrowser.FileBrowserDownloadURLEntry`, `filebrowser.FileContentResponse`, `filebrowser.FileStatResponse`, `filebrowser.WriteFileContentResponse`, `filebrowser.TransferOperation`, and `filebrowser.TransferResponse`
  - `internal/frontendbindings/git_support.go` now wraps `gitread.DiffMode`, `gitread.RepoInfo`, `gitread.StatusEntry`, `gitread.GitWorktreeEntry`, `gitread.StatusResponse`, `gitread.DiffRequest`, `gitread.DiffResponse`, `gitread.Commit`, `gitread.LogRequest`, `gitread.LogResponse`, `gitread.CommitChangedFile`, `gitread.CommitDetailsRequest`, `gitread.CommitDetailsResponse`, `gitread.CommitFileDiffRequest`, and `gitread.CommitFileDiffResponse`
  - `internal/frontendbindings/contracts.go` now wraps `mcpx.Transport`, `mcpx.RuntimeState`, `mcpx.ServerRuntimeStatus`, `httpapi.MCPRuntimeStatusRequest`, `httpapi.MCPRuntimeStatusResponse`, `httpapi.GetAttachmentDownloadURLRequest`, `httpapi.GetAttachmentDownloadURLResponse`, `httpapi.GetAttachmentDownloadURLsRequest`, and `httpapi.AttachmentDownloadURLEntry`
  - `internal/frontendbindings/contracts.go` now also wraps the plugin enum / leaf-struct family from `internal/plugins` instead of repeating those shared definitions locally:
    - `PluginScope`
    - `PluginRuntimeState`
    - `PluginEnablementSource`
    - `PluginSourceManager`
    - `PluginInstallerBackend`
    - `PluginSourceTrustStatus`
    - `PluginBlockedCapabilityReason`
    - `PluginErrorInfo`
    - `PluginBlockedCapability`
    - `PluginRegisteredCodegenTarget`
    - `PluginRegisteredBackendRoute`
    - `PluginRegisteredStaticDir`
    - `PluginRegisteredListenerEndpoint`
    - `PluginConfigValidationResult`
    - `PluginConfigWriteResponse -> plugins.PluginConfigWriteResult`
  - `internal/frontendbindings/contracts.go` now also wraps the larger plugin/runtime/config owner types instead of mirroring those response bodies locally:
    - `ServerMode -> config.Mode`
    - `LaunchSettaFilesLocation -> config.FilesLocation`
    - `LaunchResolvedSettaFilesLocation -> config.ResolvedFilesLocation`
    - `PluginRestartCapabilityMode -> plugins.RestartCapabilityMode`
    - `PluginFrontendDescriptor -> plugins.FrontendDescriptor`
    - `PluginContentDescriptor -> plugins.ContentDescriptor`
    - `PluginConfigDescriptor -> plugins.ConfigDescriptor`
    - `PluginRestartCapability -> plugins.RestartCapability`
    - `PluginListEntry -> plugins.ListEntry`
    - `PluginListResponse -> plugins.ListResponse`
    - `PluginStatusEntry -> plugins.StatusEntry`
    - `PluginStatusResponse -> plugins.StatusResponse`
    - `PluginRuntimeResponse -> plugins.RuntimeResponse`
    - `PluginInstallResponse -> plugins.PluginInstallResult`
    - `PluginEnableDisableResponse -> plugins.PluginEnableDisableResult`
    - `PluginUninstallResponse -> plugins.PluginUninstallResult`
    - `PluginUpdateResponse -> plugins.PluginUpdateResult`
    - `PluginRollbackResponse -> plugins.PluginRollbackResult`
    - `PluginRestartResponse -> plugins.PluginRestartResult`
  - the remaining plugin rescan / lock wire contracts now also point at exact backend owners instead of route-local or frontendbinding-only copies:
    - `PluginRescanResponse -> httpapi.PluginsRescanResponse`
    - `PluginLockApplyRequestInput -> httpapi.PluginLockApplyRequest`
    - `PluginLockWriteResponse -> plugins.PluginLockWriteResult`
    - `PluginLockApplyResponse -> plugins.PluginLockApplyResult`
  - more exact plugin mutation request contracts now also point at exported `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `PluginEnableDisableRequestInput -> httpapi.PluginEnableDisableRequest`
    - `PluginInstallRequestInput -> httpapi.PluginInstallRequest`
    - `PluginLinkRequestInput -> httpapi.PluginLinkRequest`
    - `PluginUninstallRequestInput -> httpapi.PluginUninstallRequest`
    - `PluginUpdateRequestInput -> httpapi.PluginUpdateRequest`
    - `PluginRollbackRequestInput -> httpapi.PluginRollbackRequest`
    - `PluginConfigWriteRequestInput -> httpapi.PluginConfigWriteRequest`
  - `internal/httpapi/plugin_routes.go` now exports those exact plugin mutation request structs instead of trapping them inside handler bodies, so `frontendbindings` no longer has to repeat them
  - `internal/httpapi` now exports the plugin rescan / lock request-response structs that were still trapped inside route handlers, so `frontendbindings` can alias the real route-contract owners instead of repeating those shapes locally
  - the remaining launcher enums that already had exact backend owners are now also wrapped instead of repeated:
    - `LauncherOpenMode -> launcher.LauncherOpenMode`
    - `LauncherWorkspaceBehavior -> launcher.LauncherWorkspaceBehavior`
    - `LauncherUpdateCapability -> launcher.LauncherUpdateCapability`
  - more request and websocket helper types now wrap exact backend owners instead of repeating route/realtime payload shapes:
    - `GetPasswordParamValueRequestInput -> httpapi.GetPasswordParamValueRequest`
    - `GetPasswordParamValueResponse -> httpapi.GetPasswordParamValueResponse`
    - `ForceRefreshListenerRequestInput -> httpapi.ForceRefreshProjectRequest`
    - `ListenerCoverageRequestInput -> httpapi.ListenerCoverageRequest`
    - `UISettingRevealActivationStep -> realtime.UISettingRevealActivationStep`
    - `UISettingRevealTarget -> realtime.UISettingRevealTarget`
    - `UISettingRevealContent -> realtime.UISettingRevealContent`
    - `UISettingRevealResultStatus -> realtime.UISettingRevealResultStatus`
    - `UISettingRevealResultContent -> realtime.UISettingRevealResultContent`
  - more exact-shape diagnostics and launcher-home helper types now wrap existing backend owners instead of living only in `frontendbindings`:
    - `LauncherHomeErrorPayload -> launcher.HomeError`
    - `LauncherRecentWorkspacePayload -> launcher.RecentWorkspaceEntry`
    - `LauncherDirectoryEntryPayload -> launcher.DirectoryEntry`
    - `SettaLspDiagnosticPosition -> projectstate.LSPDiagnosticPosition`
    - `SettaLspDiagnosticRange -> projectstate.LSPDiagnosticRange`
    - `SettaLspDiagnostic -> projectstate.LSPDiagnostic`
    - `SettaSectionTypeErrors -> projectstate.SectionTypeErrors`
    - `SettaProjectConfigDiagnostics -> projectstate.ProjectConfigDiagnostics`
    - `SettaLspDiagnosticsPayload -> projectstate.LSPDiagnosticsPayload`
  - the app-definition and app-catalog frontend contracts now also point at real backend owners instead of mirrored `frontendbindings` structs:
    - `AppCatalogPropType -> appspec.PropType`
    - `AppCatalogProp -> httpapi.AppCatalogPropResponse`
    - `AppCatalogComponent -> httpapi.AppCatalogComponentResponse`
    - `AppCatalogAction -> httpapi.AppCatalogActionResponse`
    - `AppCatalogResponse -> httpapi.AppCatalogResponse`
    - `AppRoute -> projectstate.AppRoute`
    - `AppDefinition -> projectstate.AppDefinition`
    - `GetAppDefinitionRequestInput -> httpapi.GetAppDefinitionRequest`
    - `SetAppDefinitionRequestInput -> httpapi.SetAppDefinitionRequest`
    - `ValidateAppDefinitionRequestInput -> httpapi.ValidateAppDefinitionRequest`
    - `AppDefinitionReadResponse -> projectstate.AppDefinitionReadResult`
    - `AppDefinitionMutationResponse -> projectstate.AppDefinitionMutationResult`
    - `AppValidationIssue -> appspec.AppValidationIssue`
    - `AppCapabilities -> appspec.AppCapabilities`
    - `AppDefinitionValidationResponse -> projectstate.AppDefinitionValidationResult`
  - `internal/httpapi` now marks the optional app-definition route fields with `omitempty`, so the owner-backed generated TypeScript surface preserves the optional request semantics instead of forcing nullable placeholders for absent fields
  - the app-gen skill frontend contracts now also point at their real backend owners instead of mirrored `frontendbindings` structs:
    - `AppGenSkillEntry -> appgenskills.SkillEntry`
    - `GetAppGenSkillsResponse -> appgenskills.GetSkillsResponse`
    - `GetAppGenSkillContentRequestInput -> httpapi.GetAppGenSkillContentRequest`
    - `AppGenSkillContent -> appgenskills.SkillContent`
    - `UpsertAppGenCustomSkillRequestInput -> httpapi.UpsertAppGenCustomSkillRequest`
    - `UpsertAppGenCustomSkillResponse -> appgenskills.UpsertCustomSkillResponse`
  - `internal/httpapi` now exports the app-gen skill route request structs, so `frontendbindings` can alias the real route-contract owners instead of repeating those request shapes locally
  - more exported LSP and project-route request contracts now also point at exact `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `GetLatestLspDiagnosticsRequestInput -> httpapi.GetLatestLSPDiagnosticsRequest`
    - `TypeCheckRequestInput -> httpapi.TypeCheckRequest`
    - `SetTypeErrorIgnoreRequestInput -> httpapi.SetTypeErrorIgnoreRequest`
    - `GetLatestProjectStateRequestInput -> httpapi.GetLatestProjectStateRequest`
    - `UndoRequestInput -> httpapi.UndoRequest`
    - `RedoRequestInput -> httpapi.RedoRequest`
    - `SetSectionNameRequestInput -> httpapi.SetSectionNameRequest`
    - `AcceptRenameRefactorRequestInput -> httpapi.AcceptRenameRefactorRequest`
    - `DeclineRenameRefactorRequestInput -> httpapi.DeclineRenameRefactorRequest`
    - `ToggleSectionVisibilityRequestInput -> httpapi.ToggleSectionVisibilityRequest`
    - `SetShowParamDisplayNamesRequestInput -> httpapi.SetShowParamDisplayNamesRequest`
    - `TogglePositionLocksRequestInput -> httpapi.TogglePositionLocksRequest`
    - `ToggleMinimizedRequestInput -> httpapi.ToggleMinimizedRequest`
    - `SetSectionTagColorRequestInput -> httpapi.SetSectionTagColorRequest`
    - `SetSectionStyleColorRequestInput -> httpapi.SetSectionStyleColorRequest`
    - `SetCallableRequestInput -> httpapi.SetCallableRequest`
    - `SetCodeRequestInput -> httpapi.SetCodeRequest`
    - `FormatCodeRequestInput -> httpapi.FormatCodeRequest`
  - more project-state mutation result contracts now point at their real `projectstate` owners instead of mirrored `frontendbindings` structs:
    - `CreateChildSectionsResponse -> projectstate.CreateChildSectionsResult`
    - `DeleteChildSectionsViaDecrementerResponse -> projectstate.DeleteSectionsResult`
    - `CreateTopLevelSectionResponse -> projectstate.CreateTopLevelSectionResult`
  - more deployment route contracts now point at exact `httpapi` owners instead of local `frontendbindings` copies:
    - `LoadDeploymentProjectConfigRequestInput -> httpapi.LoadDeploymentProjectConfigRequest`
    - `AppDeploymentStateResponse -> httpapi.AppDeploymentStateResponse`
  - `internal/httpapi/deployment_routes.go` now exports the app-deployment state/request structs that were previously trapped inside the route file, so `frontendbindings` can alias the real route-contract owners instead of repeating those shapes locally
  - `frontendbindings.Position` no longer mirrors the backend point shape; it now aliases `projectstate.Position`, which also unblocked `CreateTopLevelSectionResult` from using its real backend field owner
  - more project-route request contracts now also point at exact backend owners instead of mirrored `frontendbindings` structs:
    - `DeleteChildSectionsViaDecrementerRequestInput -> httpapi.DeleteChildSectionsViaDecrementerRequest`
    - `PrepareSectionsForCopyRequestInput -> httpapi.PrepareSectionsForCopyRequest`
    - `PasteSectionsRequestInput -> httpapi.PasteSectionsRequest`
    - `CreateTopLevelSectionRequestInput -> httpapi.CreateTopLevelSectionRequest`
    - `SetTopLevelSectionLayoutRequestInput -> httpapi.SetTopLevelSectionLayoutRequest`
    - `SetViewportRequestInput -> httpapi.SetViewportRequest`
    - `SetActiveIDsRequestInput -> httpapi.SetActiveIDsRequest`
    - `CreateViewModeRequestInput -> httpapi.CreateViewModeRequest`
    - `SetActiveViewModeRequestInput -> httpapi.SetActiveViewModeRequest`
    - `ToggleIsEditingViewModeRequestInput -> httpapi.ToggleIsEditingViewModeRequest`
    - `ToggleViewModeUserFacingRequestInput -> httpapi.ToggleViewModeUserFacingRequest`
    - `ToggleViewModeTabRequestInput -> httpapi.ToggleViewModeTabRequest`
    - `SetViewModeNameRequestInput -> httpapi.SetViewModeNameRequest`
    - `SetViewModeSortOrderRequestInput -> httpapi.SetViewModeSortOrderRequest`
    - `DeleteViewModeRequestInput -> httpapi.DeleteViewModeRequest`
    - `AutoLayoutTopLevelSectionsRequestInput -> httpapi.AutoLayoutTopLevelSectionsRequest`
    - `GroupSectionsRequestInput -> httpapi.GroupSectionsRequest`
    - `UngroupGroupsRequestInput -> httpapi.UngroupGroupsRequest`
    - `SetCodeFileBindingRequestInput -> httpapi.SetCodeFileBindingRequest`
  - more frontend geometry/layout helper types now point at exact `projectstate` owners instead of mirrored `frontendbindings` structs:
    - `ViewportInput -> projectstate.Viewport`
    - `ViewportBoundsInput -> projectstate.ViewportBounds`
    - `TopLevelSectionLayoutInput -> projectstate.TopLevelSectionLayout`
  - the launcher status / update and most launcher-home route contracts now point at exact backend owners instead of mirrored `frontendbindings` structs:
    - `LauncherHomeErrorPayload -> httpapi.LauncherHomeErrorPayload`
    - `LauncherRecentWorkspacesResponse -> httpapi.LauncherRecentWorkspacesResponse`
    - `LauncherRecentWorkspaceRequestInput -> httpapi.LauncherRecentWorkspaceRequest`
    - `PinLauncherRecentWorkspaceRequestInput -> httpapi.PinLauncherRecentWorkspaceRequest`
    - `LauncherFilesystemRootsResponse -> httpapi.LauncherFilesystemRootsResponse`
    - `LauncherListDirectoryRequestInput -> httpapi.LauncherListDirectoryRequest`
    - `LauncherListDirectoryResponse -> httpapi.LauncherListDirectoryResponse`
    - `LauncherOpenWorkspaceRequestInput -> httpapi.LauncherOpenWorkspaceRequest`
    - `LauncherOpenWorkspaceResponse -> httpapi.LauncherOpenWorkspaceResponse`
    - `LauncherOperationErrorPayload -> httpapi.LauncherOperationErrorPayload`
    - `LauncherStatusResponse -> httpapi.LauncherStatusResponse`
    - `LauncherUpdateResponse -> httpapi.LauncherUpdateResponse`
    - `LauncherRequestBaseInput -> httpapi.LauncherRequestBase`
    - `UpdateLauncherRequestInput -> httpapi.UpdateLauncherRequest`
  - `internal/httpapi` now exports the launcher route request/response structs that were still trapped inside route files, so `frontendbindings` can alias the real route-contract owners instead of repeating those shapes locally
  - the remaining launcher setup/install request surface is still intentionally separate for now, because the frontend payload uses different public enum values than the launcher runtime owner types:
    - `SetupLauncherRequestInput`
    - `SetupLauncherWorkspaceBehavior`
    - `LauncherInstallSource`
  - the backend-init/auth-refresh/setta-home status contracts now point at exact `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `BackendInitEvent -> httpapi.BackendInitEvent`
    - `BackendInitStatusResponse -> httpapi.BackendInitStatusResponse`
    - `AuthRefreshStatusResponse -> httpapi.AuthRefreshStatusResponse`
    - `SettaHomeInfoResponse -> httpapi.SettaHomeInfoResponse`
  - the workspace-launch request/response family now points at exact `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `LaunchSettaFilesLocation -> httpapi.LaunchSettaFilesLocation`
    - `LaunchResolvedSettaFilesLocation -> httpapi.LaunchResolvedSettaFilesLocation`
    - `LaunchRequestInput -> httpapi.LaunchRequest`
    - `CreateWorkspaceLaunchIntentRequestInput -> httpapi.CreateWorkspaceLaunchIntentRequest`
    - `LaunchErrorPayload -> httpapi.WorkspaceLaunchErrorPayload`
    - `CreateWorkspaceLaunchIntentResponse -> httpapi.CreateWorkspaceLaunchIntentResponse`
    - `LaunchSessionInfo -> httpapi.LaunchSessionInfo`
    - `LaunchResponse -> httpapi.LaunchResponse`
  - `internal/httpapi/workspace_launch_routes.go` now owns the frontend-facing launch enum wrappers and request/response contracts that used to live only in `frontendbindings`
  - the file-browser request contract family now points at exact `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `CreateFileRequestInput -> httpapi.CreateFileRequest`
    - `CheckIfFileExistsRequestInput -> httpapi.CheckIfFileExistsRequest`
    - `CheckWorkspaceInitializedRequestInput -> httpapi.CheckWorkspaceInitializedRequest`
    - `MissingFolderBehavior -> httpapi.MissingFolderBehavior`
    - `GetFolderContentsRequestInput -> httpapi.GetFolderContentsRequest`
    - `GetFileBrowserDownloadURLsRequestInput -> httpapi.GetFileBrowserDownloadURLsRequest`
    - `FileBrowserDownloadRouteParams -> httpapi.FileBrowserDownloadRouteParams`
    - `GetFileBrowserFileContentRequestInput -> httpapi.GetFileBrowserFileContentRequest`
    - `GetFileBrowserFileStatRequestInput -> httpapi.GetFileBrowserFileStatRequest`
    - `WriteFileBrowserFileContentRequestInput -> httpapi.WriteFileBrowserFileContentRequest`
    - `TransferFileBrowserEntryRequestInput -> httpapi.TransferFileBrowserEntryRequest`
  - `internal/httpapi/filebrowser_routes.go` now owns the frontend-facing file-browser request wrappers and translates them into the narrower `internal/filebrowser` service requests locally, so `frontendbindings` no longer has to mirror that route surface
  - more AI endpoint request families now point at exact `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `StartStateMachineRunRequestInput -> httpapi.StartStateMachineRunRequest`
    - `StopStateMachineRunRequestInput -> httpapi.StopStateMachineRunRequest`
    - `ResetStateMachineRequestInput -> httpapi.ResetStateMachineRequest`
    - `GetStateMachineRunRequestInput -> httpapi.GetStateMachineRunRequest`
    - `RunDetachedRequestInput -> httpapi.RunDetachedRequest`
    - `GetRunStatusRequestInput -> httpapi.GetRunStatusRequest`
    - `CancelRunRequestInput -> httpapi.CancelRunRequest`
    - `GetRunnerSummaryRequestInput -> httpapi.GetRunnerSummaryRequest`
    - `SetChatSectionStateRequestInput -> httpapi.SetChatSectionStateRequest`
  - more simple AI CRUD/lookup request families now point at exact backend owners instead of mirrored `frontendbindings` structs:
    - `CreateAgentProfileRequestInput -> httpapi.CreateAgentProfileRequest`
    - `GetAgentProfileRequestInput -> httpapi.GetAgentProfileRequest`
    - `DeleteAgentProfileRequestInput -> httpapi.DeleteAgentProfileRequest`
    - `GetPromptTemplateRequestInput -> httpapi.GetPromptTemplateRequest`
    - `CreatePromptTemplateRequestInput -> httpapi.CreatePromptTemplateRequest`
    - `DeletePromptTemplateRequestInput -> httpapi.DeletePromptTemplateRequest`
    - `GetExternalAgentConfigRequestInput -> httpapi.GetExternalAgentConfigRequest`
    - `DeleteExternalAgentConfigRequestInput -> httpapi.DeleteExternalAgentConfigRequest`
    - `GetAgentRunRequestInput -> httpapi.GetAgentRunRequest`
    - `StartAgentRunRequestInput -> httpapi.StartAgentRunRequest`
    - `StopAgentRunRequestInput -> httpapi.StopAgentRunRequest`
    - `GetEngineConfigRequestInput -> httpapi.GetEngineConfigRequest`
    - `CreateEngineConfigRequestInput -> httpapi.CreateEngineConfigRequest`
    - `DeleteEngineConfigRequestInput -> httpapi.DeleteEngineConfigRequest`
    - `RunChainStepInput -> runchains.StepInput`
    - `RunChainSpecInput -> runchains.SpecInput`
    - `StartRunChainRequestInput -> httpapi.StartRunChainRequest`
    - `StopRunChainRequestInput -> httpapi.StopRunChainRequest`
  - a few remaining exact AI leaf contracts now also point at backend owners instead of mirrored `frontendbindings` structs:
    - `SettaNotificationType -> notifications.Type`
    - `SettaNotification -> notifications.Notification`
    - `ChatContextUsage -> managedchat.ChatContextUsage`
    - `StopLLMChatResponse -> managedchat.StopResult`
  - the corresponding `internal/httpapi` route files now export those simple request structs instead of trapping them as route-local implementation details:
    - `agent_profile_routes.go`
    - `prompt_template_routes.go`
    - `external_agent_config_routes.go`
    - `engine_config_routes.go`
    - `agent_run_routes.go`
  - the exact terminal route request shapes now also point at `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `DeleteTerminalsRequestInput -> httpapi.DeleteTerminalsRequest`
    - `InterruptTerminalProcessesRequestInput -> httpapi.InterruptTerminalProcessesRequest`
  - the exact project-shell request shapes now also point at `httpapi` owners instead of mirrored `frontendbindings` structs:
    - `LoadProjectConfigRequestInput -> httpapi.ProjectLoadRequest`
    - `SaveProjectRequestInput -> httpapi.ManualSaveRequest`
    - `SaveAsNewProjectConfigRequestInput -> httpapi.SaveAsNewProjectConfigRequest`
    - `CreateProjectConfigRequestInput -> httpapi.CreateProjectConfigRequest`
    - `DeleteProjectConfigsRequestInput -> httpapi.DeleteProjectConfigsRequest`
    - `SetProjectConfigNameRequestInput -> httpapi.SetProjectConfigNameRequest`
    - `SetAsDefaultProjectRequestInput -> httpapi.SetDefaultProjectConfigRequest`
    - `GetNotificationsRequestInput -> httpapi.GetNotificationsRequest`
    - `DeleteNotificationRequestInput -> httpapi.DeleteNotificationRequest`
  - a larger exact project-mutation request block now also points at `httpapi` owners instead of mirrored `project_state_support.go` structs:
    - `CreateNewSectionVariantRequestInput -> httpapi.CreateNewSectionVariantRequest`
    - `SetSectionVariantRequestInput -> httpapi.SetSectionVariantRequest`
    - `SetDefaultSectionVariantRequestInput -> httpapi.SetDefaultSectionVariantRequest`
    - `SetSectionVariantSortOrderRequestInput -> httpapi.SetSectionVariantSortOrderRequest`
    - `ToggleVariantFrozenRequestInput -> httpapi.ToggleVariantFrozenRequest`
    - `ToggleVariantJSONSourceRequestInput -> httpapi.ToggleVariantJSONSourceRequest`
    - `SetVariantJSONSourceKeysRequestInput -> httpapi.SetVariantJSONSourceKeysRequest`
    - `SetSectionVariantNameRequestInput -> httpapi.SetSectionVariantNameRequest`
    - `DeleteSectionsRequestInput -> httpapi.DeleteSectionsRequest`
    - `DeleteSelectedParamsRequestInput -> httpapi.DeleteSelectedParamsRequest`
    - `UpdateEdgeRequestInput -> httpapi.UpdateEdgeRequest`
    - `DeleteEdgesRequestInput -> httpapi.DeleteEdgesRequest`
    - `ReconnectEdgeRequestInput -> httpapi.ReconnectEdgeRequest`
    - `SetEdgesRequestInput -> httpapi.SetEdgesRequest`
    - `UpdateStateMachineEdgeRequestInput -> httpapi.UpdateStateMachineEdgeRequest`
    - `DeleteStateMachineEdgesRequestInput -> httpapi.DeleteStateMachineEdgesRequest`
    - `SetStateMachineEdgesRequestInput -> httpapi.SetStateMachineEdgesRequest`
    - `UpdateAgenticEdgeRequestInput -> httpapi.UpdateAgenticEdgeRequest`
    - `DeleteAgenticEdgesRequestInput -> httpapi.DeleteAgenticEdgesRequest`
    - `SetAgenticEdgesRequestInput -> httpapi.SetAgenticEdgesRequest`
    - `MoveSectionsRequestInput -> httpapi.MoveSectionsRequest`
    - `MoveParamGroup -> httpapi.MoveParamGroupRequest`
    - `MoveParamsRequestInput -> httpapi.MoveParamsRequest`
    - `MoveParamGroupsRequestInput -> httpapi.MoveParamGroupsRequest`
    - `IndentParamsRequestInput -> httpapi.IndentParamsRequest`
    - `UnindentParamsRequestInput -> httpapi.UnindentParamsRequest`
    - `AddKwargRequestInput -> httpapi.AddKwargRequest`
    - `DeleteKwargRequestInput -> httpapi.DeleteKwargRequest`
    - `SetParamEnteredValueRequestInput -> httpapi.SetParamEnteredValueRequest`
    - `UpdateParamImplConfigRequestInput -> httpapi.UpdateParamImplConfigRequest`
    - `SetCodeSectionAttachedTerminalRequestInput -> httpapi.SetCodeSectionAttachedTerminalRequest`
    - `SetGenCodePrefixRequestInput -> httpapi.SetGenCodePrefixRequest`
    - `SetGenCodeSuffixRequestInput -> httpapi.SetGenCodeSuffixRequest`
    - `SetCodeObjNameRequestInput -> httpapi.SetCodeObjNameRequest`
    - `SetCodeObjDisplayNameRequestInput -> httpapi.SetCodeObjDisplayNameRequest`
    - `SetWatchCodeEnabledRequestInput -> httpapi.SetWatchCodeEnabledRequest`
    - `SetWatchCodeInputsRequestInput -> httpapi.SetWatchCodeInputsRequest`
  - more exact section/browser/chat/text-block mutation requests now also point at `httpapi` owners instead of mirrored `project_state_support.go` structs:
    - `SetCallableHideParamsRequestInput -> httpapi.SetCallableHideParamsRequest`
    - `SetSectionHideUnpinnedParamsRequestInput -> httpapi.SetSectionHideUnpinnedParamsRequest`
    - `SetSectionPinnedParamsRequestInput -> httpapi.SetSectionPinnedParamsRequest`
    - `SetChatSectionSettingsRequestInput -> httpapi.SetChatSectionSettingsRequest`
    - `SetStateMachineSectionSettingsRequestInput -> httpapi.SetStateMachineSectionSettingsRequest`
    - `ToggleParamSelectedRequestInput -> httpapi.ToggleParamSelectedRequest`
    - `UnselectAllParamsRequestInput -> httpapi.UnselectAllParamsRequest`
    - `SetSectionParamFilterRequestInput -> httpapi.SetSectionParamFilterRequest`
    - `SetMetaControlShowSectionTitleRequestInput -> httpapi.SetMetaControlShowSectionTitleRequest`
    - `SetSectionColumnWidthRequestInput -> httpapi.SetSectionColumnWidthRequest`
    - `SetSectionEdgeInputsRequestInput -> httpapi.SetSectionEdgeInputsRequest`
    - `SetSectionEdgeOutputsRequestInput -> httpapi.SetSectionEdgeOutputsRequest`
    - `SetListRootViewModeRequestInput -> httpapi.SetListRootViewModeRequest`
    - `ToggleGroupOrientationRequestInput -> httpapi.ToggleGroupOrientationRequest`
    - `SetGroupOverflowModeRequestInput -> httpapi.SetGroupOverflowModeRequest`
    - `SetBrowserColumnWidthsRequestInput -> httpapi.SetBrowserColumnWidthsRequest`
    - `SetBrowserAreaViewModeRequestInput -> httpapi.SetBrowserAreaViewModeRequest`
    - `SetBrowserHideColumnRequestInput -> httpapi.SetBrowserHideColumnRequest`
    - `SetBrowserSavedSearchesRequestInput -> httpapi.SetBrowserSavedSearchesRequest`
    - `SetSpreadsheetFilePathRequestInput -> httpapi.SetSpreadsheetFilePathRequest`
    - `SetSpreadsheetSectionSettingsRequestInput -> httpapi.SetSpreadsheetSectionSettingsRequest`
    - `SetTaskBoardSectionStateRequestInput -> httpapi.SetTaskBoardSectionStateRequest`
    - `SetImageAreaImagePathRequestInput -> httpapi.SetImageAreaImagePathRequest`
    - `SetSocialURLRequestInput -> httpapi.SetSocialURLRequest`
    - `AppendDrawAreaLayerItemRequestInput -> httpapi.AppendDrawAreaLayerItemRequest`
    - `SetChartAreaDataPathRequestInput -> httpapi.SetChartAreaDataPathRequest`
    - `SetChartTypeRequestInput -> httpapi.SetChartTypeRequest`
    - `SetTextBlockTextRequestInput -> httpapi.SetTextBlockTextRequest`
    - `SetTextBlockDisplayModeRequestInput -> httpapi.SetTextBlockDisplayModeRequest`
    - `SetTextBlockFormatRequestInput -> httpapi.SetTextBlockFormatRequest`
    - `SetTextBlockHeadingAsSectionNameRequestInput -> httpapi.SetTextBlockHeadingAsSectionNameRequest`
    - `SetTextBlockMetaControlStyleRequestInput -> httpapi.SetTextBlockMetaControlStyleRequest`
    - `SetTextBlockMasterFontSizeRequestInput -> httpapi.SetTextBlockMasterFontSizeRequest`

### Remaining Handwritten Python Types
Current handwritten files in `backend/setta/types/`:
- `artifact.py`
- `chat.py`
- `id.py`
- `listener.py`
- `protocol.py`
- `project_config.py`

Final classification:
- `id.py`: keep. Pydantic-specific `ID` integration and local ID factories are genuinely Python-only.
- `listener.py`: keep. The remaining code is Python SDK/runtime glue: binary payload storage via `PrivateAttr`, stricter init validation, and typed websocket adapters over generated SDK contracts.
- `protocol.py`: keep. The remaining code is Python-only dependency-key/value glue: frozen/hashable dependency keys for dictionary/set usage plus discriminated-union adapters used by the generated SDK contracts.
- `chat.py`: keep. The remaining code is Python-only chat/runtime glue: OpenAI-format conversion, JSON argument parsing, datetime parsing, typed content unions, and richer wrappers over generated Go-owned chat/event models.
- `artifact.py`: keep. The remaining code is Python-only artifact/runtime glue: artifact-id factories, tuple aliases, discriminator defaults, and the adapter/type-adapter layer used by the listener runtime.
- `project_config.py`: keep. The remaining code is Python-only defaulting and validation over generated Go-owned project-state/codegen models.
- there is no longer an obvious handwritten Python shared-schema owner left in `backend/setta/types/`.

## Optional Follow-ups

### 1. Discovery is generated, but ownership still flows through mirror packages
The biggest remaining problem is no longer “there is a giant manual type list.”

The remaining follow-up is that some type surface still flows through:
- `internal/frontendbindings/project_state_support.go`
- related support files under `internal/frontendbindings/`

At this point, most of the remaining local surface is route-local query/body shaping, raw-JSON/stringly contracts, or generator sentinel types rather than duplicated shared-schema ownership. Further shrinkage is possible, but it is no longer required to satisfy the current cleanup goal.

This has improved for the project-state/view/windowing family, the project/deployment metadata family, the project-codegen policy family, the artifact/binary family, the prompt-template / LLM-config family, the dependency wire family, the streaming/listener enum family, the follow-update / completion family, the detailed chat-message schema family, the external-agent config/settings family, and the runtime agent / engine / transcription / detached-run family.

It has also improved for the `git`, `filebrowser`, terminal-runtime, and detached/transcription/state-machine route-response families that previously still carried small mirror structs in separate support files.

It has now also improved for the launcher status / update and most launcher-home route families; the remaining launcher-local surface is the intentional setup/install request payload mismatch rather than another accidental mirror owner.

It has also improved for the backend-init/auth-refresh/setta-home status contracts and the workspace-launch request/response family; those route-level shapes now live in `httpapi` instead of `frontendbindings`.

It has also improved for the file-browser request family; the remaining file-browser shared surface in `frontendbindings` is now mostly direct aliases to `internal/filebrowser` response owners.

It has also improved for the detached-run, state-machine-run, and chat-section-state AI endpoint request families; those are no longer local `frontendbindings` mirrors.

It has also improved for the exact terminal delete/interrupt request contracts; only the looser `RunCodeRequestInput` wrapper remains in `terminal_support.go`.

It has also improved for the simple AI CRUD/lookup route contracts and run-chain input models; those now come from `httpapi` / `runchains` instead of `frontendbindings`.

It has also improved for the project-shell request family; those exact request contracts no longer need local `project_state_support.go` mirrors.

### 2. TypeScript pruning exists, but it is cleanup-time, not a separate generator concern
The earlier plan was wrong to say TS pruning did not exist.

What actually exists today:
- generate broad TS output
- run cleanup via `pnpm full-cleanup`
- `runKnip.mjs` iteratively trims unused declarations from `frontend/src/utils/generatedTypes.ts`

So the remaining work is not “invent TS pruning.”
The remaining optional improvement is:
- keep the TS generation surface generic
- keep the generated output stable under cleanup
- decide whether the standard documented workflow is `generate` then `full-cleanup`, or whether some of that cleanup should move closer to the generation entrypoint

### 3. Go -> Python still leans on `frontendbindings` more than it should
`internal/pythonsharedtypes/contracts.go` now widens from discovered convertible Go types, which is good.

It now also discovers directly from several real owner packages, which is better.

It also now applies discovered wrapper overrides to nested fields, not just top-level discovered roots, which removes one class of manual `py_type` patching.

But it still leans on the `frontendbindings` surface, plus some enum fallback logic, for part of the exported Python-facing names. That is now an optimization/future-cleanup issue, not a blocker for the current goal.

### 4. There may still be some duplicated type ownership inside Go
The frontend/Python cleanup is surfacing a few remaining “two Go packages define the same concept” cases.

The prompt-format duplication has already been removed, and the duplicated `ChatPermissionMode` / `RunSnapshotMode` pairs have also been collapsed onto single owners. The remaining optional work here is to keep applying the same rule elsewhere if any more duplicated owner pairs are found:
- collapse the backend ownership first
- then point frontend/Python generation at the surviving owner
- do not teach the generators to arbitrate between multiple backend owners forever

### 5. A few handwritten Python files are still shared-contract candidates
This item is resolved for the current scope. The remaining handwritten Python files have now been classified as Python-only runtime/default/validation glue rather than shared-schema owners.

## Desired End State

### `backend/setta/types/`
Keep only:
- `id.py` if its Pydantic integration remains genuinely Python-specific
- the narrow Python runtime glue in `listener.py` if it cannot be expressed cleanly in Go
- a very small number of other files only if they are truly Python-only

Everything else should either:
- be generated from Go into `backend/setta/types/generated/go_shared_types.py`, or
- disappear entirely because it is no longer needed

### Go -> Python
- Discover convertible exported Go types generically from approved owner packages
- Generate one broad shared Python type module
- Run the Python prune script after generation
- Avoid per-type manual inventories except for narrow exclusions

### Go -> TypeScript
- Discover convertible exported Go types generically from approved owner packages
- Generate the canonical frontend outputs
- Continue to rely on the existing TS cleanup path after generation
- Keep only narrow semantic special cases in the converter

## Scope

### In scope
- Shrinking `backend/setta/types/` further
- Moving remaining shared type ownership toward real Go owner packages
- Reducing `frontendbindings` mirror ownership
- Keeping Go -> Python generic and broad
- Keeping Go -> TypeScript generic and broad
- Preserving the existing TS cleanup path while making the overall workflow cleaner
- Deleting any more dead generators, dead generated outputs, or low-value tests that are discovered

### Out of scope
- Introducing a new third schema language
- Preserving backward compatibility for old Python module paths
- Keeping Python-owned shared contracts just because they existed historically

## Execution Plan

### Phase 1: Reclassify the remaining handwritten Python files
For each remaining file in `backend/setta/types/`, make one decision:
- keep as Python-only
- move to Go ownership
- delete as unneeded

Default rule:
- if the file describes backend/runtime/project-state/shared-contract data, it should not stay handwritten in Python

Deliverable:
- a short explicit survivor list for the Python-only files

Expected likely survivors:
- `id.py`
- the Python-specific validation and binary-payload glue in `listener.py`
- the typed websocket / chat adapter layers if the Go backend deliberately continues to represent chat messages and streaming chunks as raw JSON payloads internally

### Phase 2: Shrink `frontendbindings` as a type owner
Target files:
- `internal/frontendbindings/project_state_support.go`
- other support files that define shared structs and enums only to feed conversion

Work:
- identify which definitions already have real backend owners elsewhere
- move ownership away from `frontendbindings` where it is only acting as a mirror
- prefer backend-owned named wrappers plus the generated wrapper-override registry over manual converter switches
- keep `frontendbindings` focused on conversion rules, route groups, endpoint specs, and generation helpers

Guardrail:
- do not create duplicate Go definitions while doing this

### Phase 3: Move the remaining shared Python families to Go ownership
Primary targets:
- `chat.py`
- `listener.py`
- `protocol.py`
- any remaining reducible wrapper content in `project_config.py`
- any remaining reducible wrapper content in `artifact.py`

Work:
- find the real Go owner package for each family
- reuse existing Go definitions wherever they already exist
- only add new Go definitions where the concept is truly missing
- if multiple Go packages already define the same concept, collapse that ownership first instead of adding another generated workaround
- generate the Python surface from those Go owners
- prune unused generated output afterward

### Phase 4: Collapse the Python package surface further
After the Go owners exist:
- update Python imports to use `go_shared_types.py`
- delete the handwritten mirror files that become unnecessary
- rerun pruning and formatting

Success condition:
- `backend/setta/types/` contains only genuinely Python-only files plus `generated/go_shared_types.py`

### Phase 5: Stabilize the full generation plus cleanup workflow
Target scripts:
- `frontend/generation/generate.sh`
- `frontend/generation/generate_go_frontend_bindings.sh`
- `frontend/generation/generate_go_python_types.sh`
- `frontend/scripts/runKnip.mjs`
- `frontend/scripts/gcf.sh`

Work:
- document the intended standard workflow clearly
- keep `generate` broad and deterministic
- keep cleanup deterministic after generation
- avoid reintroducing dead generated files or manual mirrors

Open decision:
- whether TS cleanup should remain a separate cleanup step in the standard workflow, or whether some of it should move closer to the generation entrypoint

### Phase 6: Final cleanup
- remove stale docs that still point at deleted Python-owned types
- remove obsolete compatibility imports and dead code paths
- remove any remaining low-value generated-code tests that only pin names or inventories
- verify that `pnpm generate` and the standard cleanup flow produce stable output

## Concrete Work Order
1. Reclassify the remaining handwritten Python files.
2. Identify the biggest mirror-owner blocks in `internal/frontendbindings/`.
3. Move shared project-state and websocket/chat families toward real Go owners.
4. Regenerate Python and TypeScript output.
5. Run the existing prune and cleanup flow.
6. Delete any handwritten Python mirrors that become unnecessary.
7. Run focused verification.

## Verification
- `./scripts/go.sh test ./internal/gotypediscovery ./internal/frontendbindings ./internal/pythonsharedtypes ./internal/pythonsdkcontracts -count=1`
- `source activate.sh && cd frontend && pnpm generate`
- `cd frontend && pnpm full-cleanup`
- `source activate.sh && ./scripts/run_backend_tests.sh`
- `./scripts/run_go_tests.sh`

Add targeted frontend verification as generator ownership changes land.

## Acceptance Criteria
- New shared backend types do not require hand-appending large root inventories.
- `backend/setta/types/generated/` stays collapsed to a single generated shared-types file.
- `backend/setta/types/` no longer contains handwritten mirrors of Go-owned shared types.
- Go -> Python follows the broad pattern: discover, generate, prune.
- Go -> TypeScript follows the broad pattern: discover, generate, cleanup-prune.
- The remaining handwritten Python files have a concrete Python-only justification.

## Notes
- The earlier version of this plan was stale in two important ways:
  - it claimed TypeScript pruning was missing
  - it still listed handwritten Python files and generator layers that have already been deleted
- The main remaining problem is no longer “replace giant manual inventories.”
- The main remaining problem is “stop using mirror conversion packages as de facto type owners, and finish collapsing the remaining handwritten Python shared-contract files.”
