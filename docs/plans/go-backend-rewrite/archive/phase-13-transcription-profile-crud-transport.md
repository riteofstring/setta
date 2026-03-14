# Phase 13 Transcription-Profile CRUD Transport

## Purpose

This doc records the landed bounded post-Phase-13 slice for
transcription-profile CRUD transport.

The prior Phase 13 slices cleared the direct frontend hydration-read backlog,
engine-config update transport, and agent-profile CRUD. The next
highest-leverage remaining direct frontend dependency is the
transcription-profile write cluster:

- `POST /createTranscriptionProfile`
- `POST /updateTranscriptionProfile`
- `POST /deleteTranscriptionProfile`

This slice moves only those three routes over the already-landed Go
`internal/transcriptionprofiles` owner boundary. It does not broaden into
transcription-session runtime work, single-item reads, or websocket
`TranscriptionProfilesUpdated` parity.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership
- Phase 13 agent-profile read transport
- Phase 13 prompt-template read transport
- Phase 13 agentic summary-cache-status owner and transport
- Phase 13 prompt-template CRUD transport
- Phase 13 external-agent config plus health hydration transport
- Phase 13 engine-config read transport
- Phase 13 transcription-profile read transport and capability owner
- Phase 13 engine-config update transport
- Phase 13 agent-profile CRUD transport

Concrete dependency that triggered this slice:

- direct frontend callers still use:
  - `createTranscriptionProfile(...)`
  - `updateTranscriptionProfile(...)`
  - `deleteTranscriptionProfile(...)`
- those callers are in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/state/actions/ai.ts`
- the frontend action layer already updates local AI state directly from the
  mutation response
- Python still owns the three routes in `backend/setta/routers/agentic.py`
- Go already owns:
  - the canonical `transcription_profiles.json` file store in
    `internal/transcriptionprofiles.Store`
  - the live capability and validation owner in
    `internal/transcriptionprofiles.Service`

Current Python behavior relevant to this slice:

- all three routes are IDE-only and LLM-gated
- create/update validate `transcriptionLlmConfigId` by resolving the current
  runtime config and rejecting blanks or unknown ids
- create/update reject `transportMode=realtime` when the resolved runtime config
  does not actually support realtime transcription
- create:
  - builds a new `TranscriptionProfile` with a generated id
  - recomputes `supportsRealtimeTranscription`
  - appends it to the persisted list
  - saves `transcription_profiles.json`
  - returns the created saved profile
- update:
  - validates the referenced runtime config and transport mode
  - recomputes `supportsRealtimeTranscription`
  - replaces the persisted profile by id
  - saves `transcription_profiles.json`
  - returns the updated saved profile
- delete:
  - removes the persisted profile by id
  - saves `transcription_profiles.json`
  - returns `null`
- Python also broadcasts `TranscriptionProfilesUpdated` after each mutation

Current Go behavior after this slice:

- `internal/transcriptionprofiles.Store` already owns:
  - file path resolution for `transcription_profiles.json`
  - strict decode and normalization
  - list/get/write operations
- `internal/transcriptionprofiles.Service` already owns:
  - live `supportsRealtimeTranscription` recomputation from `llmconfig.Runtime`
  - source-of-truth realtime support rules
- runtime-aware create/update validation for transcription LLM config
  references and realtime transport eligibility
- create/update/delete persistence orchestration above the file store
- Go already owns:
  - `GET /getTranscriptionProfiles`
  - `POST /createTranscriptionProfile`
  - `POST /updateTranscriptionProfile`
  - `POST /deleteTranscriptionProfile`

Current frontend behavior relevant to scoping:

- same-tab correctness does not depend on websocket fan-out because
  `frontend/src/state/actions/ai.ts` already upserts/removes profiles in the
  local store from the mutation response
- no current direct frontend caller in the worktree uses a single-item
  transcription-profile read route

Landed in this slice:

- `internal/transcriptionprofiles.Service`
  - Go-owned create/update/delete helpers above the file store
  - source-of-truth transcription LLM config validation and realtime transport
    eligibility checks
- `internal/httpapi/transcription_profile_routes.go`
  - thin IDE-gated `create/update/delete` transport over the existing service
- `internal/httpapi/route_names.go`
  - bare-route registration for transcription-profile CRUD routes
- focused coverage in:
  - `internal/transcriptionprofiles/service_test.go`
  - `internal/httpapi/transcription_profile_routes_test.go`

Closeout rerun after the landing:

- the direct frontend dependency on Python-owned transcription-profile write
  routes is now gone
- websocket `TranscriptionProfilesUpdated` parity remains deferred and is no
  longer a hidden blocker for the current direct settings surface
- the next bounded dependency at the time of this landing was
  external-agent-config CRUD

## Scope

This slice delivered:

- thin Go transport for:
  - `POST /createTranscriptionProfile`
  - `POST /updateTranscriptionProfile`
  - `POST /deleteTranscriptionProfile`
- reusing the existing bounded Go owner:
  - `internal/transcriptionprofiles.Service`
- focused service and route tests covering:
  - create roundtrip
  - update roundtrip
  - delete roundtrip
  - update/delete not found
  - invalid JSON
  - missing/invalid transcription LLM config id
  - invalid realtime transport for unsupported configs
  - share-mode gating

## Non-Goals

- transcription session runtime ownership
- websocket `TranscriptionProfilesUpdated` parity
- single-item transcription-profile reads
- frontend generated type regeneration
- external-agent-config CRUD

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-13-transcription-profile-read-transport-and-capability-owner.md`
- `docs/plans/go-backend-rewrite/archive/phase-13-agent-profile-crud-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/llm/transcription_capabilities.py`
- `backend/setta/types/agentic.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `internal/transcriptionprofiles/store.go`
- `internal/transcriptionprofiles/service.go`
- `internal/transcriptionprofiles/store_test.go`
- `internal/transcriptionprofiles/service_test.go`
- `internal/httpapi/transcription_profile_routes.go`
- `internal/httpapi/transcription_profile_routes_test.go`

## Recommended Design

1. Keep the owner split already established by the read slice.
   - `Store` remains the file owner.
   - `Service` owns runtime-aware validation and hydrated response shaping.
   - `httpapi` stays a thin transport layer.

2. Put create/update validation in the service, not the route.
   - Resolve `transcriptionLlmConfigId` through `llmconfig.Runtime`.
   - Reject blank or unknown config ids explicitly.
   - Reject `transportMode=realtime` for configs that do not support realtime
     transcription.

3. Keep mutation semantics bounded and explicit.
   - Add service helpers for create/update/delete above the store.
   - Keep not-found behavior explicit at the service boundary.
   - Return the hydrated saved profile from create/update.

4. Keep request handling explicit and thin.
   - Use strict JSON decode.
   - Require a top-level `profile` payload for update.
   - Require `profileId` for delete.
   - Return typed `400` errors for invalid or missing payloads.

5. Defer realtime fan-out again.
   - The current direct frontend callers already update local state from the
     mutation response.
   - Do not broaden this slice into websocket ownership without a concrete
     dependency.

## Verification

- `./scripts/go.sh test ./internal/transcriptionprofiles -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TranscriptionProfile|CreateTranscriptionProfile|UpdateTranscriptionProfile|DeleteTranscriptionProfile' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needs a focused doc first because runtime-aware validation belongs
  in the existing transcription service, not in an ad hoc route helper
- keep transcription-profile writes on the landed `Store` + `Service`
  boundary instead of inventing another owner
- keep websocket fan-out out of scope because the current dependency is local
  settings mutation correctness, not multi-client synchronization

## Next Recommended Step

- that next bounded external-agent-config CRUD follow-on is now landed in
  `phase-13-external-agent-config-crud-transport.md`
- rerank any remaining Python-owned agentic routes from real callers instead
  of assuming another direct settings write slice

## Open Questions

- whether websocket `TranscriptionProfilesUpdated` parity should follow after
  CRUD landed
  - recommendation: only if a concrete multi-client UI bug appears, since the
    current direct callers already self-heal local state from the mutation
    response
