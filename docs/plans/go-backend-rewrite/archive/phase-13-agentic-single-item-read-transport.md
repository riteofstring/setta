# Phase 13 Agentic Single-Item Read Transport

## Purpose

This doc records the landed bounded follow-on slice for the remaining dormant
single-item agentic reads after the landed engine-config create/delete cleanup.

The current post-Phase-13 inventory now leaves only two agentic route classes
still Python-owned:

- dormant single-item reads with no current live frontend caller
- managed-agent and run-chain runtime routes that remain intentionally
  de-scoped

The user requested continued execution. Given that constraint, the highest
leverage bounded follow-on was to land the remaining thin single-item reads
over already-landed Go owners:

- `POST /getAgentProfile`
- `POST /getPromptTemplate`
- `POST /getExternalAgentConfig`
- `POST /getEngineConfig`

This slice does not reopen managed `setta_llm`, run-chain runtime ownership, or
websocket fan-out parity.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership for the bounded
  external-agent surface
- Phase 13 direct app-start hydration reads
- Phase 13 direct settings mutation surface
- Phase 13 engine-config create/delete cleanup
- Phase 13 remaining-route inventory and rerank

Current Python behavior relevant to this slice:

- each route is a thin lookup by id over the corresponding file-backed store
- each route is LLM-gated, but not otherwise stateful
- each route returns `404` when the requested id is missing

Current Go behavior after this slice:

- Go already owns the canonical owners needed for these reads:
  - `internal/agentprofiles.Store`
  - `internal/prompttemplates.Store`
  - `internal/externalagentconfigs.Service` plus `Store`
  - `internal/agentruns.EngineStore`
- Go already owns the list and mutation transport for those same settings
  resources
- Go now also owns the remaining single-item read transport for those same
  settings resources

Current caller status relevant to scoping:

- the landed inventory did not find a live frontend caller for these routes
- this is therefore opportunistic cleanup, not a hidden dependency
- all four routes have the same shape and the same bounded ownership pattern,
  so moving them together is smaller than reopening them one by one later

## Scope

This slice delivered:

- thin Go transport for:
  - `POST /getAgentProfile`
  - `POST /getPromptTemplate`
  - `POST /getExternalAgentConfig`
  - `POST /getEngineConfig`
- one bounded read helper on `internal/externalagentconfigs.Service`
- focused route tests covering:
  - successful lookup
  - missing id validation
  - `404` not found behavior
  - share-mode gating

## Non-Goals

- `POST /startAgentRun`
- `POST /stopAgentRun`
- `POST /getAgentRun`
- `POST /startRunChain`
- `POST /stopRunChain`
- websocket update fan-out parity
- broadening these reads outside the current IDE-gated settings surface

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-13-remaining-agentic-route-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-13-engine-config-create-delete-transport.md`
- `backend/setta/routers/agentic.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/utils/generatedEndpoints.ts`
- `internal/agentprofiles/store.go`
- `internal/prompttemplates/store.go`
- `internal/externalagentconfigs/service.go`
- `internal/externalagentconfigs/store.go`
- `internal/agentruns/store.go`
- `internal/httpapi/agent_profile_routes.go`
- `internal/httpapi/prompt_template_routes.go`
- `internal/httpapi/external_agent_config_routes.go`
- `internal/httpapi/engine_config_routes.go`

## Recommended Design

1. Keep these routes inside the existing route files.
   - do not create a new cross-resource transport package
   - each route should stay beside the corresponding list/mutation transport

2. Keep the ownership split explicit.
   - stores and services stay source-of-truth for lookup and normalization
   - route handlers only decode, validate required ids, and map errors

3. Keep the current IDE-gated settings surface.
   - do not broaden these dormant reads into share-mode parity just because the
     Python routes were not IDE-only
   - the current rewrite boundary already intentionally narrowed these related
     settings reads to IDE mode

4. Reuse existing not-found and validation error codes where possible.
   - `profile_id_required`
   - `template_id_required`
   - `config_id_required`
   - `agent_profile_not_found`
   - `prompt_template_not_found`
   - `external_agent_config_not_found`
   - `engine_config_not_found`

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'AgentProfile|PromptTemplate|ExternalAgent|EngineConfig|GetAgentProfile|GetPromptTemplate|GetExternalAgentConfig|GetEngineConfig' -count=1`
- `./scripts/go.sh test ./internal/externalagentconfigs ./internal/httpapi -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- add a focused doc first because this slice spans four route files even though
  each individual route is small
- move the whole dormant single-item read cluster together so the remaining
  agentic Python surface becomes runtime-only instead of leaving one-off
  transport debris behind
- keep the current IDE-only settings boundary instead of broadening share-mode
  exposure just to match Python route shape

## Open Questions

- whether any of these dormant single-item reads will ever regain a direct
  caller in the current frontend
  - recommendation: treat this as cleanup, not as a signal that the frontend
    should return to one-off fetches

## Next Recommended Step

- treat the remaining non-runtime Phase 13 agentic transport cleanup as
  complete
- if another agentic rewrite slice is needed, require an explicit product or
  architecture decision for the still-deferred managed-agent and run-chain
  runtime surface
