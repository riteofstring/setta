# Frontend/Backend Duplication Audit

## Scope and criteria

- Reviewed manual logic in `frontend/src`, the Go backend runtime under `internal/` and `cmd/`, and backend-owned browser-side JS embedded in Go HTML templates.
- Did not count generated artifacts as unjustified duplication. If a frontend enum/helper already comes from generated Go bindings, that was treated as the intended source of truth.
- Did not count test-only overlap as a finding by itself, but used tests and fixtures as evidence when they proved two implementations were being kept in lockstep.
- Marked a duplicate as justified when the frontend needed local-only UX behavior or optimistic state handling while the backend still remained the authoritative validator/persistence owner.
- Marked a duplicate as unjustified when the frontend manually mirrored backend-owned validation/protocol semantics and the repo already showed explicit sync pressure between the two copies.

## Resolved findings

### 1. Backend-owned name validation no longer lives as a handwritten frontend mirror

Status: resolved.

The frontend now consumes generated validation helpers instead of maintaining its own copy of backend name-validation rules.

What changed:

- `frontend/src/utils/nameValidation.ts` now re-exports generated helpers from `frontend/src/utils/generatedTypes.ts`.
- `internal/frontendbindings/name_validation_support.go` generates the frontend validation helpers and option types.
- `internal/projectstate/name_validation_frontend_support.go` exposes the Go-owned validation contract data used to generate those helpers.
- Shared backend/frontend fixture coverage remains in place to prove the generated client-side validators still match backend-owned caller-visible behavior.

Result:

- project names
- section names
- view mode names
- window space names
- param names

All now use a generated/backend-owned validation contract instead of a manually maintained TypeScript implementation.

### 2. Workspace bootstrap/handoff protocol now has a single Go-owned contract

Status: resolved.

The bootstrap/handoff protocol keys and limits are now defined once in Go and consumed by both the backend-served bootstrap page and the frontend utilities.

What changed:

- `internal/httpapi/bootstrap_handoff_contract.go` defines the protocol constants and exported contract shape.
- `internal/httpapi/bootstrap_page.go` injects that contract into the bootstrap-page script instead of hardcoding raw literals inline.
- `internal/frontendbindings/bootstrap_handoff_support.go` exports the same protocol into generated frontend bindings as `GENERATED_BOOTSTRAP_PROTOCOL`.
- Frontend consumers now read that generated contract instead of carrying their own copies:
  - `frontend/src/utils/workspaceHistory.ts`
  - `frontend/plugin-sdk/app-subsystem/src/launcherOrigin.ts`
  - `frontend/src/utils/backendOriginOverride.ts`
  - `frontend/src/utils/workspaceLaunchNavigation.ts`
  - `frontend/src/utils/workspaceSwitcherLaunch.ts`

Result:

The launcher/bootstrap handoff storage keys, query/hash parameters, and max handoff length now come from one Go-owned source of truth.

### 3. App-generation modes and the `plain_chat` sentinel now come from `internal/agentruns`

Status: resolved.

The frontend no longer hand-maintains the canonical app-generation mode set or the `plain_chat` sentinel.

What changed:

- `internal/agentruns/app_generation.go` now owns the shared app-generation mode constants, parser, and optional-mode normalizer.
- `internal/frontendbindings/app_generation_support.go` exports generated frontend bindings for:
  - the app-generation mode union
  - the mode enum object
  - the `plain_chat` sentinel
  - the shared parser
- Frontend consumers now use those generated bindings:
  - `frontend/src/state/types/appGenerationMode.ts`
  - `frontend/src/state/utils/chatAppGeneration.ts`
  - `frontend/src/components/Chat/appGenerationSlashCommands.ts`
  - `frontend/src/components/Chat/chatInputHelpers.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatCoreUtils.ts`
- Managed-chat and external-agent backend code paths were also updated to consume the same `agentruns` owner instead of keeping local copies.

Result:

The canonical allowed-value set for `appGenerationMode` and `appGenerationByMessageId` provenance handling is now owned in one backend package and generated outward.

## Remaining unjustified duplications

None found in the audited areas after the fixes above.

## Reviewed but judged justified

- `plugins/setta-json-render-app-gen/frontend/src/appSpecPatchStream.ts` vs
  `internal/appsubsystem/appspec/patch_stream.go`
  - Justified. The frontend needs local patch parsing/application for streaming preview, while the backend remains authoritative for persisted app-spec state.
- `frontend/src/state/actions/stateMachineDraftValidation.ts` vs `internal/statemachineruns/runtime.go`
  - Justified. The frontend is warning early about obvious draft issues; the backend still owns execution-time validation and runtime behavior.
- `frontend/src/state/actions/projectChatWindowing.ts` vs `internal/projectstate/project_chat_windowing*.go`
  - Justified. The frontend needs optimistic/local window management and intentionally does not re-own backend conflict resolution.
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.helpers.ts` vs `internal/plugins/config_write.go`
  - Justified. The frontend performs lightweight UX prechecks; schema and correctness remain backend-owned.
- `frontend/src/utils/settaFilesLocation.ts` vs backend setta-files-location normalization
  - Justified. The frontend is normalizing local storage/request inputs for UX; backend request handling remains authoritative.

## Bottom line

The three unjustified frontend/backend duplications identified in this audit have been removed. The remaining overlaps reviewed in this pass are the justified UX/runtime splits listed above, where the frontend still needs local behavior but no longer re-owns backend authority.
