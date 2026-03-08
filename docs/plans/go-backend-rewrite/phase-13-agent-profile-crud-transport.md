# Phase 13 Agent-Profile CRUD Transport

## Purpose

This doc records the landed bounded post-Phase-13 slice for agent-profile CRUD
transport.

The prior Phase 13 slices cleared the direct frontend hydration-read backlog,
prompt-template CRUD, and engine-config update transport. The next
highest-leverage remaining direct frontend dependency is the agent-profile
write cluster:

- `POST /createAgentProfile`
- `POST /updateAgentProfile`
- `POST /deleteAgentProfile`

This slice moves only those three routes over the already-landed Go
`internal/agentprofiles.Store`. It does not broaden into
`POST /getAgentProfile`, watcher ownership, or websocket
`AgentProfilesUpdated` parity.

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

Concrete dependency that triggered this slice:

- direct frontend callers used:
  - `createAgentProfile(...)`
  - `updateAgentProfile(...)`
  - `deleteAgentProfile(...)`
- those callers are in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/state/actions/ai.ts`
- the frontend action layer already updates local AI state directly from the
  mutation response
- Python owned the three routes in `backend/setta/routers/agentic.py`
- Go already owns the canonical `agent_profiles.json` store in
  `internal/agentprofiles/store.go`

Current Python behavior relevant to this slice:

- all three routes are IDE-only and LLM-gated
- create:
  - builds a new `AgentProfile` with a generated id
  - appends it to the persisted list
  - saves `agent_profiles.json`
  - returns the created profile
- update:
  - finds the persisted profile by id
  - replaces it in the list
  - saves `agent_profiles.json`
  - returns the updated profile
- delete:
  - removes the persisted profile by id
  - saves `agent_profiles.json`
  - returns `null`
- unlike several other Python settings routes, these route handlers do not
  broadcast a websocket update directly

Current Go behavior after this slice:

- `internal/agentprofiles.Store` already owns:
  - file path resolution for `agent_profiles.json`
  - strict decode and normalization
  - list/get/write/create/update/delete operations
- Go already owns `GET /getAgentProfiles`
- Go now owns:
  - `POST /createAgentProfile`
  - `POST /updateAgentProfile`
  - `POST /deleteAgentProfile`

Current frontend behavior relevant to scoping:

- same-tab correctness does not depend on websocket fan-out because
  `frontend/src/state/actions/ai.ts` already upserts/removes profiles in the
  local store from the mutation response
- no current direct frontend caller in the worktree uses `POST /getAgentProfile`

## Scope

This slice delivered:

- thin Go transport for:
  - `POST /createAgentProfile`
  - `POST /updateAgentProfile`
  - `POST /deleteAgentProfile`
- reusing the existing bounded Go owner:
  - `internal/agentprofiles.Store`
- focused store and route tests covering:
  - create roundtrip
  - update roundtrip
  - delete roundtrip
  - update/delete not found
  - invalid JSON
  - invalid/missing profile payload
  - share-mode gating

## Non-Goals

- `POST /getAgentProfile`
- websocket `AgentProfilesUpdated` parity
- agent-profile watcher/runtime ownership
- engine-config referential validation changes
- frontend generated type regeneration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-agent-profile-read-transport.md`
- `docs/plans/go-backend-rewrite/phase-13-engine-config-update-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `backend/setta/types/agentic.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `internal/agentprofiles/store.go`
- `internal/agentprofiles/store_test.go`
- `internal/httpapi/agent_profile_routes.go`
- `internal/httpapi/agent_profile_routes_test.go`

## Recommended Design

1. Extend the existing Go agent-profile route registration instead of adding a
   second subsystem.
   - Keep ownership split between:
     - `internal/agentprofiles` for file persistence and normalization
     - `internal/httpapi` for transport and HTTP error mapping

2. Keep mutation semantics inside the bounded store owner.
   - Add explicit store helpers for create/update/delete instead of pushing
     list-mutate-write logic into the route layer.
   - Keep not-found behavior explicit at the owner boundary.

3. Keep create id generation local and deterministic in shape.
   - Generate the profile id in the Go route.
   - Do not broaden the store into an id-allocation service.

4. Keep request handling explicit and thin.
   - Use strict JSON decode.
   - Require a top-level `profile` payload for update.
   - Require `profileId` for delete.
   - Return typed `400` errors for invalid or missing payloads.

5. Defer watcher and websocket work.
   - The current Python route handlers do not broadcast directly.
   - The current frontend callers already update local state from the response.
   - Do not broaden this slice into watcher or realtime ownership without a
     concrete dependency.

## Verification

- `./scripts/go.sh test ./internal/agentprofiles -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'AgentProfile|CreateAgentProfile|UpdateAgentProfile|DeleteAgentProfile' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needed a focused doc first because it introduced a three-route
  write cluster and an explicit defer decision for watcher/realtime work
- keep agent-profile write ownership in `Store` with bounded create/update/delete
  helpers instead of inventing a larger agent-profile service boundary
- keep `getAgentProfile` and engine-config referential validation out of scope
  because no current direct frontend caller requires them for this slice

## Open Questions

- whether `POST /getAgentProfile` should follow after CRUD lands because the
  generated frontend endpoint still exists
  - recommendation: only if a concrete caller appears, since the current
    direct frontend surface only needs list plus CRUD

## Next Recommended Step

- the transcription-profile CRUD follow-up is now landed in
  `phase-13-transcription-profile-crud-transport.md`
- open the next bounded Phase 13 doc around external-agent-config CRUD
  transport and keep plugin/env-var/cache side effects explicit
