# Go-Owned Type Generation Cleanup Plan

## Goal
Make Go the source of truth for shared backend, frontend, and Python types.

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
- `backend/setta/types/project_config.py` no longer hand-owns the top-level `ProjectConfig` field layout:
  - the Python class now subclasses the Go-generated `ProjectConfig` model and only keeps Python-side defaults, richer key typing, and validation
- the dead Python-only project-config policy helper layer has been removed:
  - deleted unused `resolve_*codegen_policy` / `get_*codegen_target` helpers
  - deleted the test that existed only to exercise that dead helper layer
- `backend/setta/types/listener.py` now also owns the handwritten websocket envelope adapters:
  - the Python message classes subclass Go-generated listener message models and only keep the Python-side typed content wrappers, discriminator literals, and `TypeAdapter`
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

### Remaining Handwritten Python Types
Current handwritten files in `backend/setta/types/`:
- `artifact.py`
- `chat.py`
- `id.py`
- `listener.py`
- `protocol.py`
- `project_config.py`

Working assumption for the next passes:
- `id.py` is likely truly Python-only.
- most of `listener.py` is now clearly Python-only wrapper logic over generated SDK / Go-owned enums.
- `protocol.py` is now clearly Python-only listener/dependency adapter glue, not a shared-schema owner.
- `chat.py` now owns the remaining chat metadata, section-state, and stream-event adapter glue over Go-owned generated models; it is not a primary schema owner.
- the remaining handwritten part of `project_config.py` is now narrower Python-only defaulting and validation glue over Go-generated project codegen and project-state models, not another large shared-model family.
- `artifact.py` is no longer a shared-schema owner; the handwritten remainder is now tuple aliases, artifact-id factories, discriminator literals, and draw-area convenience defaults.
- there is no longer an obvious large shared-schema owner left in `backend/setta/types/`; the surviving `project_config.py` and `artifact.py` code is much closer to adapter/default glue than to schema ownership.

## What Is Still Wrong

### 1. Discovery is generated, but ownership still flows through mirror packages
The biggest remaining problem is no longer “there is a giant manual type list.”

The remaining problem is that too much of the shared type surface still flows through:
- `internal/frontendbindings/project_state_support.go`
- related support files under `internal/frontendbindings/`

That is better than handwritten Python mirrors, but it still means `frontendbindings` is acting as an oversized type owner instead of a thin conversion layer over real backend owner packages.

This has improved for the project-state/view/windowing family, the project/deployment metadata family, the project-codegen policy family, the artifact/binary family, the prompt-template / LLM-config family, the dependency wire family, the streaming/listener enum family, the follow-update / completion family, the detailed chat-message schema family, the external-agent config/settings family, and the runtime agent / engine / transcription / detached-run family.

### 2. TypeScript pruning exists, but it is cleanup-time, not a separate generator concern
The earlier plan was wrong to say TS pruning did not exist.

What actually exists today:
- generate broad TS output
- run cleanup via `pnpm full-cleanup`
- `runKnip.mjs` iteratively trims unused declarations from `frontend/src/utils/generatedTypes.ts`

So the remaining work is not “invent TS pruning.”
The remaining work is:
- keep the TS generation surface generic
- keep the generated output stable under cleanup
- decide whether the standard documented workflow is `generate` then `full-cleanup`, or whether some of that cleanup should move closer to the generation entrypoint

### 3. Go -> Python still leans on `frontendbindings` more than it should
`internal/pythonsharedtypes/contracts.go` now widens from discovered convertible Go types, which is good.

It now also discovers directly from several real owner packages, which is better.

It also now applies discovered wrapper overrides to nested fields, not just top-level discovered roots, which removes one class of manual `py_type` patching.

But it still leans on the `frontendbindings` surface, plus some enum fallback logic, for a significant part of the exported Python-facing names, which means the real owner packages are still not cleanly expressed for many type families.

### 4. There may still be some duplicated type ownership inside Go
The frontend/Python cleanup is surfacing a few remaining “two Go packages define the same concept” cases.

The prompt-format duplication has already been removed, and the duplicated `ChatPermissionMode` / `RunSnapshotMode` pairs have also been collapsed onto single owners. The remaining work here is to keep applying the same rule elsewhere if any more duplicated owner pairs are found:
- collapse the backend ownership first
- then point frontend/Python generation at the surviving owner
- do not teach the generators to arbitrate between multiple backend owners forever

### 5. A few handwritten Python files are still shared-contract candidates
The remaining handwritten Python files are much smaller and clearer than before.

They are also much closer to adapter/default glue than to true schema ownership now.

The main candidates are now:
- any reducible remainder in `project_config.py`, if more of the defaulting/validation surface can be deleted or expressed without another handwritten adapter layer
- any remaining thin adapter logic in `artifact.py`, if the Python package no longer needs the tuple aliases, id factories, or convenience defaults
- any adapter-only file under `chat*.py`, `listener.py`, or `protocol.py` that can be collapsed further without reintroducing duplicate backend definitions

Already narrowed to Python adapter layers:
- `chat.py`
- `artifact.py`
- `listener.py`
- `protocol.py`

Likely Python-only:
- the remaining frozen/hashable dependency-key behavior in `protocol.py`, because the listener SDK currently uses dependency keys as dictionary keys

Those files should either:
- disappear because the Python package no longer needs them, or
- move to Go ownership and generate into `go_shared_types.py`, or
- be proven Python-only with a concrete runtime reason

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
