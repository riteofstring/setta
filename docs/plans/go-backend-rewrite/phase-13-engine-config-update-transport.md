# Phase 13 Engine-Config Update Transport

## Purpose

This doc records the landed bounded post-Phase-13 slice for engine-config
update transport.

The prior Phase 13 slices cleared the direct frontend hydration-read backlog.
The next highest-leverage remaining direct frontend dependency is the existing
write transport for updating engine configs:

- `POST /updateEngineConfig`

This slice moves only that write transport over the already-landed Go
`internal/agentruns.EngineStore`. It does not broaden into engine-config
create/delete transport, single-item reads, or websocket `EngineConfigsUpdated`
parity.

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

Concrete dependency that triggered this slice:

- direct frontend callers used `updateEngineConfig(...)` in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
- `frontend/src/state/actions/ai.ts`
  - updates local AI store state directly from the route response
- Python owned `POST /updateEngineConfig` in
  `backend/setta/routers/agentic.py`
- Go already owns the canonical engine-config file store in
  `internal/agentruns/store.go`

Current Python behavior relevant to this slice:

- `POST /updateEngineConfig` is IDE-only and LLM-gated
- it finds the existing engine config by id
- it replaces that config in the persisted list
- it saves the full `engine_configs.json` payload
- it returns the updated config
- it also broadcasts `EngineConfigsUpdated` after mutation

Current Go behavior after this slice:

- `internal/agentruns.EngineStore` already owns:
  - file path resolution for `engine_configs.json`
  - strict decoding and normalization
  - list/get/write/update operations
- Go already owns the engine-config read route
- Go now owns `POST /updateEngineConfig`
- websocket `EngineConfigsUpdated` parity remains intentionally deferred

Current frontend behavior relevant to scoping:

- the direct callers update the local AI store from the mutation response
- no current same-tab caller requires websocket fan-out for correctness
- no direct frontend caller in the current worktree uses create/delete engine
  config transport

## Scope

This slice delivered:

- thin Go transport for:
  - `POST /updateEngineConfig`
- reusing the existing bounded Go owner:
  - `internal/agentruns.EngineStore`
- focused route tests covering:
  - update roundtrip
  - update not found
  - invalid JSON
  - invalid/missing engine config payload
  - share-mode gating

## Non-Goals

- `POST /createEngineConfig`
- `POST /deleteEngineConfig`
- `POST /getEngineConfig`
- websocket `EngineConfigsUpdated` parity
- broader engine-config CRUD service design beyond the landed store
- frontend generated type regeneration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-transcription-profile-read-transport-and-capability-owner.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `backend/setta/types/agentic.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/state/actions/aiUpdateEngineConfig.test.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
- `internal/agentruns/store.go`
- `internal/agentruns/types.go`
- `internal/httpapi/engine_config_routes.go`
- `internal/httpapi/engine_config_routes_test.go`

## Recommended Design

1. Extend the existing Go engine-config route registration instead of adding a
   second subsystem.
   - Keep ownership split between:
     - `internal/agentruns` for file persistence and normalization
     - `internal/httpapi` for transport and HTTP error mapping

2. Keep existence checks explicit inside the bounded owner.
   - Require a top-level `config` payload.
   - Have `EngineStore.Update(...)` normalize the payload, replace by id, and
     return `404` when the config id is missing from persisted state.

3. Keep normalization source-of-truth local to the engine owner.
   - Do not hand-roll ad hoc route heuristics for engine config validity.
   - Reuse bounded engine-config normalization so the route can reject invalid
     payloads with `400` before persisting.

4. Keep the route IDE-only.
   - Match the current product boundary for this write route.
   - Do not broaden scope into share/deployment behavior.

5. Defer websocket parity.
   - The current direct callers already update local state from the route
     response.
   - Do not broaden this slice into `EngineConfigsUpdated` fan-out unless a
     concrete multi-client sync dependency appears.

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'EngineConfig|UpdateEngineConfig' -count=1`
- `./scripts/go.sh test ./internal/agentruns -run 'EngineStore|ResolveManagedEngine' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needed a focused doc first because it introduced write semantics
  and an explicit defer decision for engine-config websocket fan-out
- keep engine-config write ownership in `EngineStore` with a bounded
  `Update(...)` operation instead of inventing a separate mutation service
- keep the rest of engine-config CRUD out of scope because no current direct
  frontend caller requires it

## Open Questions

- whether `create/delete/getEngineConfig` should move at all in Phase 13
  - recommendation: only if a concrete caller appears, since the current
    direct frontend usage only needed list plus update

## Next Recommended Step

- open the next bounded Phase 13 doc around agent-profile CRUD transport over
  the already-landed Go agent-profile store
- keep the external-agent-config and transcription-profile CRUD clusters
  separate unless a dependency forces them to combine
