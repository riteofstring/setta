# Phase 13 Agent-Profile Read Transport

## Purpose

This doc records the first bounded post-Phase-12 slice and its landing.

Phase 12 closed the tracked external-agent runtime and transport boundary. The
next highest-leverage user-facing gap is that the frontend still hydrates agent
profiles from a Python-owned route even though Go already owns the canonical
`agent_profiles.json` store.

This slice closed that dependency without broadening into the remaining
non-external-agent agentic surfaces that still need separate ownership
decisions.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and AI route ownership
- Go-owned `internal/agentprofiles.Store`
- Go-owned MCP parity for `list_agent_profiles` and `get_agent_profile`

Concrete dependency that triggered this slice:

- `frontend/src/state/actions/ai.ts`
  - `loadAgentProfiles()` still calls `route_get_agent_profiles()`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - agent-profile hydration still depends on that route at app load
- Python owned the route in `backend/setta/routers/agentic.py`:
  - `route_get_agent_profiles(...)`

Landed in this slice:

- `internal/httpapi/agent_profile_routes.go`
  - thin IDE-gated `GET /getAgentProfiles` transport
  - direct readback from `internal/agentprofiles.Store`
- `internal/app/app.go`
  - explicit agent-profile store wiring into route registration
- `internal/httpapi/route_names.go`
  - bare-route registration for `getAgentProfiles`
- `internal/httpapi/agent_profile_routes_test.go`
  - focused coverage for successful list read, empty-list read, and
    IDE-mode gating

Closeout rerun after the landing:

- `GET /getPromptTemplates` is still part of the same frontend hydration path
  in `useHydrateAgenticState.ts`
- `POST /getAgenticSummaryCacheStatus` is still Python-owned for the chat-area
  settings UI
- prompt-template read transport is the higher-leverage next bounded slice
  because it is also a hydration dependency and still looks file-backed/read-only

Remaining Python-owned agentic reads outside this slice:

- `GET /getPromptTemplates`
- `POST /getAgenticSummaryCacheStatus`

## Scope

This slice delivered:

- thin Go transport for `GET /getAgentProfiles`
- source-of-truth readback from `internal/agentprofiles.Store`
- response shape matching the current frontend expectation:
  `[]agentprofiles.Profile`
- focused route tests for:
  - successful profile-list read
  - empty-list read
  - IDE-mode gating

## Non-Goals

- `GET /getAgentProfile`
- create/update/delete agent-profile routes
- websocket agent-profile update broadcast parity
- prompt-template transport
- agentic summary-cache-status transport
- managed `setta_llm` runtime work

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-agent-profile-store-and-read-tools-parity.md`
- `backend/setta/routers/agentic.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
- `internal/agentprofiles/store.go`
- `internal/mcpx/agent_profile_tools.go`
- `internal/httpapi`

## Recommended Design

1. Keep the route read-only and thin.
   - Reuse `internal/agentprofiles.Store` directly.
   - Do not introduce a new orchestration service for this read-only slice.

2. Reuse the existing persisted JSON shape.
   - The frontend already consumes `AgentProfile[]`.
   - Do not add route-local reshaping or compatibility fields.

3. Keep the scope to the live dependency.
   - Land `GET /getAgentProfiles`.
   - Do not add `GET /getAgentProfile` unless a direct frontend dependency
     appears during implementation.

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'AgentProfile|GetAgentProfiles' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- use the already-landed Go store as the source of truth instead of reading
  agent profiles through the broader agentic service surface
- keep this slice read-only and list-only because that is the current frontend
  dependency

## Open Questions

- whether `GET /getAgentProfile` should follow immediately after this slice
  because the generated frontend endpoint still exists
  - recommendation: no; wait for an actual dependency or a broader agentic-read
    planning pass

## Next Recommended Step

- the follow-up prompt-template slice is now landed in
  `phase-13-prompt-template-read-transport.md`
- the summary-cache-status follow-up is now landed in
  `phase-13-agentic-summary-cache-status-transport-and-owner.md`
- the agent-profile CRUD follow-up is now landed in
  `phase-13-agent-profile-crud-transport.md`
- the transcription-profile CRUD follow-up is now landed in
  `phase-13-transcription-profile-crud-transport.md`
- the next bounded dependency for the remaining direct settings writes is now
  external-agent-config CRUD transport
