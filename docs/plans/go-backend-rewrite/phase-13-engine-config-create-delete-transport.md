# Phase 13 Engine-Config Create Delete Transport

## Purpose

This doc records the landed bounded follow-on slice for engine-config
create/delete transport after the landed Phase 13 remaining-route inventory.

The inventory concluded that there was no hidden direct frontend blocker left
in the current agentic surface. The remaining route choices were:

- dormant single-item reads
- dormant engine-config create/delete transport
- managed-agent and run-chain runtime work that remains intentionally
  de-scoped

The user requested that rewrite execution continue. Given that constraint, the
highest-leverage bounded next step is the smallest remaining settings transport
slice over an already-landed Go owner:

- `POST /createEngineConfig`
- `POST /deleteEngineConfig`

This slice does not reopen managed `setta_llm`, run-chain runtime work, or
single-item read transport.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership for the bounded
  external-agent surface
- Phase 13 direct app-start hydration reads
- Phase 13 prompt-template CRUD transport
- Phase 13 engine-config read transport
- Phase 13 engine-config update transport
- Phase 13 agent-profile CRUD transport
- Phase 13 transcription-profile CRUD transport
- Phase 13 external-agent-config CRUD transport
- Phase 13 remaining-route inventory and rerank

Current Python behavior relevant to this slice:

- `POST /createEngineConfig` constructs a new `EngineConfig`, persists the full
  list, and returns the saved config
- `POST /deleteEngineConfig` removes a matching config id and returns success
- both routes are IDE-only and currently live in `backend/setta/routers/agentic.py`
- Python also broadcasts `EngineConfigsUpdated` after mutation

Current Go behavior after this slice:

- `internal/agentruns.EngineStore` already owns:
  - path resolution for `engine_configs.json`
  - strict list/get/write/update/create/delete behavior
  - canonical engine-config normalization
- Go already owns:
  - `GET /getEngineConfigs`
  - `POST /createEngineConfig`
  - `POST /updateEngineConfig`
  - `POST /deleteEngineConfig`
- websocket `EngineConfigsUpdated` parity remains intentionally deferred

Current caller status relevant to scoping:

- the remaining-route inventory did not find a current direct frontend caller
  for engine-config create/delete
- that means this is an opportunistic cleanup slice, not a hidden dependency
- the slice is still bounded and low-risk because the owner already exists

## Scope

This slice delivered:

- thin Go transport for:
  - `POST /createEngineConfig`
  - `POST /deleteEngineConfig`
- bounded owner support in:
  - `internal/agentruns.EngineStore`
- focused tests covering:
  - create roundtrip
  - delete roundtrip
  - invalid JSON and missing payloads
  - not-found delete behavior
  - share-mode gating

## Non-Goals

- `POST /getEngineConfig`
- websocket `EngineConfigsUpdated` parity
- frontend generation refresh or new UI callers
- managed `setta_llm` runtime design
- run-chain route migration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-engine-config-update-transport.md`
- `docs/plans/go-backend-rewrite/phase-13-remaining-agentic-route-inventory-and-rerank.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/types/agentic.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/utils/generatedEndpoints.ts`
- `internal/agentruns/store.go`
- `internal/agentruns/types.go`
- `internal/httpapi/engine_config_routes.go`
- `internal/httpapi/engine_config_routes_test.go`

## Recommended Design

1. Keep engine-config mutation ownership in `internal/agentruns.EngineStore`.
   - add bounded `Create(...)` and `Delete(...)` operations there
   - do not invent a second mutation service for the same file owner

2. Keep transport thin and explicit.
   - decode strict JSON
   - require top-level payload fields explicitly
   - map bounded owner errors to stable HTTP status codes

3. Generate ids in the route layer for create.
   - `EngineStore` should remain focused on normalization and persistence
   - route transport can assemble the new `EngineConfig` from request fields
     and a generated id before calling the owner

4. Reuse canonical normalization.
   - do not hand-roll route-specific validation heuristics
   - let the bounded engine owner reject invalid persisted shapes

5. Keep websocket fan-out deferred.
   - current caller inventory still does not justify broadening this slice into
     realtime sync parity

## Verification

- `./scripts/go.sh test ./internal/agentruns -run 'EngineStore' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'EngineConfig|CreateEngineConfig|DeleteEngineConfig' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- open one focused doc first because this slice exists only due to the user
  asking to continue after the inventory found no mandatory next route
- keep the work bounded to engine-config create/delete because it is the
  smallest remaining settings transport over an already-landed owner
- continue to defer websocket parity and single-item engine-config reads
- keep id generation in the route layer so `EngineStore` remains a persistence
  and normalization owner instead of becoming a transport-aware factory

Later follow-on note:

- the deferred dormant single-item reads mentioned here were later landed in
  `phase-13-agentic-single-item-read-transport.md`

## Open Questions

- whether websocket `EngineConfigsUpdated` parity should move at all in the
  current bounded rewrite scope
  - recommendation: only if a concrete multi-client sync dependency appears

## Next Recommended Step

- treat the engine-config create/delete cleanup as complete for the current
  bounded Phase 13 surface
- use `phase-13-agentic-single-item-read-transport.md` for the later
  single-item read follow-on and the inventory doc for the remaining
  runtime-only agentic surface
