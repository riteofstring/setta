# Phase 13 Remaining Agentic Route Inventory And Rerank

## Purpose

This doc records the bounded inventory follow-on after the landed
external-agent-config CRUD slice.

Phase 13 moved the direct app-start hydration reads and the direct settings
mutation surface that still had live frontend callers. The next recommended
step after that landing was not another blind transport migration. It was a
rerank pass over the remaining Python-owned agentic routes so the rewrite does
not keep opening Phase 13 slices without a real caller or product dependency.

## Current Status

Completed before this inventory:

- Phase 12 external-agent runtime and route ownership for the bounded
  external-agent surface
- Phase 13 agent-profile read transport
- Phase 13 prompt-template read transport
- Phase 13 agentic-summary-cache-status owner and transport
- Phase 13 prompt-template CRUD transport
- Phase 13 external-agent config and health read transport
- Phase 13 engine-config read transport
- Phase 13 transcription-profile read transport and capability owner
- Phase 13 engine-config update transport
- Phase 13 agent-profile CRUD transport
- Phase 13 transcription-profile CRUD transport
- Phase 13 external-agent-config CRUD transport

Question this inventory answers:

- after those landings, which Python-owned routes in
  `backend/setta/routers/agentic.py` still matter enough to justify another Go
  migration slice right now?

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-13-external-agent-config-crud-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/types/routes.py`
- `backend/setta/server_state.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `frontend/src/utils/generatedEndpoints.ts`
- `internal/httpapi/*.go`

## Inventory Method

1. Enumerate the current agentic routes still defined in
   `backend/setta/routers/agentic.py`.
2. Compare that route set with the current Go-owned route registrations under
   `internal/httpapi`.
3. Search current frontend code for real callers of the remaining generated
   endpoint functions.
4. Separate routes with current product callers from routes that only remain in
   tests or generated bindings.
5. Rerank the remaining surface by actual dependency, not by how easy a route
   would be to port in isolation.

## Findings

### 1. No direct frontend hydration or direct settings mutation gap remains

The current direct frontend callers in `frontend/src/state/actions/ai.ts` now
load or mutate these resources from Go:

- agent profiles
- prompt templates
- external-agent configs
- external-agent health
- engine configs list
- transcription profiles
- agentic summary-cache status
- external-agent stop / approval / question
- external-agent run list

The settings UI in `ProjectAISettings.tsx` now directly uses the Go-backed
actions for all currently exposed create/update/delete flows except engine
create/delete, which are not currently exposed there.

### 2. Remaining Python-owned single-item reads have no current frontend caller

These generated endpoints still exist, but this inventory did not find a live
frontend caller outside generated bindings or backend tests:

- `POST /getAgentProfile`
- `POST /getPromptTemplate`
- `POST /getExternalAgentConfig`
- `POST /getEngineConfig`

Current status:

- they are still covered as Python route behavior in
  `tests/routers/test_agentic_routes.py`
- they are not part of the current app-start hydration flow
- they are not part of the current direct settings mutation flow

Rerank:

- low priority
- do not open a transport slice for them unless a concrete frontend/runtime
  caller appears

### 3. Engine-config create/delete remain Python-owned, but have no current UI caller

These routes remain Python-owned:

- `POST /createEngineConfig`
- `POST /deleteEngineConfig`

Current status:

- `POST /updateEngineConfig` and `GET /getEngineConfigs` are already Go-owned
- the current frontend state/actions layer exposes only engine-config update
- this inventory did not find a live caller for the create/delete route
  bindings in current frontend code

Rerank:

- medium-low priority
- if a product change reintroduces engine create/delete into the live settings
  UI, this becomes the smallest bounded next transport slice because the Go
  store and update transport already exist
- absent that caller, this is not the next step

### 4. Managed-agent and run-chain routes remain Python-owned by design, not by hidden omission

These routes remain Python-owned:

- `POST /startAgentRun`
- `POST /stopAgentRun`
- `POST /getAgentRun`
- `POST /startRunChain`
- `POST /stopRunChain`

Current status:

- `startAgentRun` still fans into the Python `AgentRunner` for
  `EngineType.setta_llm` and the Python `ExternalAgentRunner` compatibility
  path
- `startRunChain` and `stopRunChain` still depend on the Python
  `RunChainRunner` initialized in `backend/setta/server_state.py`
- the current rewrite docs already de-scope a Go-owned managed `setta_llm`
  runtime unless a later product decision explicitly reopens it
- this inventory did not find a current frontend caller for the generated
  `route_start_agent_run`, `route_stop_agent_run`, `route_get_agent_run`,
  `route_start_run_chain`, or `route_stop_run_chain` bindings

Rerank:

- not a Phase 13 transport follow-on
- if product work ever revives this surface, it needs a new runtime-level doc
  first because the dependency is not a thin route gap
- recommendation: treat this as a future product/runtime decision, not as the
  next automatic rewrite slice

## Reranked Outcome

1. There is no remaining direct frontend hydration or direct settings mutation
   blocker in the current agentic surface.
2. The remaining Python-owned agentic routes split into:
   - dormant single-item reads
   - dormant engine create/delete transport
   - managed-agent/run-chain runtime routes tied to intentionally de-scoped
     `setta_llm` and Python runtime owners
3. None of those route groups is the obvious next transport slice without an
   explicit new caller or product decision.

## Decisions Made

- do not open another automatic Phase 13 transport slice just because some
  generated agentic endpoints still point at Python
- treat remaining single-item reads as low-priority dormant surface until a
  real caller appears
- treat engine create/delete as the smallest possible future transport slice,
  but only if the UI or another live caller actually needs it
- treat managed `setta_llm` / run-chain routes as a separate runtime decision,
  not as a thin transport migration

## Verification

- docs and inventory only; no automated tests were run

## Next Recommended Step

- close the current Phase 13 direct-surface migration work as complete for the
  current bounded scope
- if a new agentic follow-on is needed, require one of:
  - a concrete caller for engine create/delete or single-item reads
  - an explicit product decision to reopen managed `setta_llm` / run-chain
    runtime work with a new bounded design doc first
