# Phase 13 Engine-Config Read Transport

## Purpose

This doc records the next bounded post-Phase-13 slice and its landing.

The prior Phase 13 slices moved agent profiles, prompt templates,
summary-cache-status, prompt-template CRUD, and external-agent config/health
hydration to Go. The next highest-leverage remaining frontend hydration
dependency is engine-config read transport:

- `GET /getEngineConfigs`

This slice moves only that read transport over the already-landed Go
`internal/agentruns.EngineStore`. It does not broaden into engine-config CRUD,
engine websocket fan-out, engine single-item reads, or any managed
`setta_llm` runtime work.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership
- Phase 13 agent-profile read transport
- Phase 13 prompt-template read transport
- Phase 13 agentic summary-cache-status owner and transport
- Phase 13 prompt-template CRUD transport
- Phase 13 external-agent config plus health hydration transport

Concrete dependency that triggered this slice:

- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - still calls `loadEngineConfigs()`
- direct frontend consumers still depend on hydrated engine configs:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
- Python owned `GET /getEngineConfigs` in `backend/setta/routers/agentic.py`
- Go already owns the canonical engine-config file store in
  `internal/agentruns/store.go`

Current Python behavior relevant to this slice:

- `GET /getEngineConfigs` is a thin LLM-gated read over `load_engine_configs()`
- the route returns the stored `engine_configs.json` list directly
- Python does not require IDE mode for the read route today
- Python mutation routes and websocket broadcast parity remain separate:
  - `POST /updateEngineConfig`
  - `EngineConfigsUpdated`

Current Go behavior relevant to this slice:

- `internal/agentruns.EngineStore` already owns:
  - `engine_configs.json` path resolution
  - strict JSON array decoding
  - unknown-field rejection
  - normalized `EngineConfig` payloads
  - empty/missing-file handling as `[]`
- the store already supports current Go-owned managed-run and external-agent
  runtime dependencies

Current frontend behavior relevant to scoping:

- the current startup/hydration path only needs the full engine-config list
- no direct frontend caller in the current worktree uses `POST /getEngineConfig`
- direct engine mutation callers still used `POST /updateEngineConfig` when
  this read slice was planned
- websocket `EngineConfigsUpdated` exists, but current same-tab hydration and
  mutation flows do not require broadcast parity for this read slice
- current callers are in IDE/settings/chat surfaces; no concrete share-mode
  caller was found in the current worktree

Landed in this slice:

- `internal/httpapi/engine_config_routes.go`
  - thin IDE-gated `GET /getEngineConfigs` transport
- `internal/app/app.go`
  - explicit `EngineStore` wiring into route registration scope
- `internal/httpapi/route_names.go`
  - bare-route registration for `getEngineConfigs`
- focused coverage in:
  - `internal/httpapi/engine_config_routes_test.go`

Closeout rerun after the landing:

- the direct frontend hydration dependency on the Python-owned engine-config
  read route is now gone
- the Go route intentionally stays IDE-gated for the current bounded settings
  surface even though Python exposed the read more broadly
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`
- generated single-item reads still exist for:
  - `POST /getAgentProfile`
  - `POST /getAgentRun`
  - `POST /getPromptTemplate`
  - `POST /getExternalAgentConfig`
  - `POST /getEngineConfig`
  but no direct frontend caller was found for them in the current worktree

## Scope

This slice delivered:

- thin Go transport for:
  - `GET /getEngineConfigs`
- reusing the existing bounded Go owner:
  - `internal/agentruns.EngineStore`
- focused route tests covering:
  - list read
  - empty list when the file is missing
  - invalid persisted payload handling
  - IDE-mode gating

## Non-Goals

- `POST /getEngineConfig`
- `POST /updateEngineConfig`
- `POST /createEngineConfig`
- `POST /deleteEngineConfig`
- websocket `EngineConfigsUpdated` parity
- managed `setta_llm` runtime/config migration beyond the stored read shape
- frontend generated type regeneration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-external-agent-config-and-health-read-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `backend/setta/types/agentic.py`
- `backend/setta/agentic/example_config.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
- `internal/agentruns/store.go`
- `internal/agentruns/types.go`
- `internal/httpapi/agent_profile_routes.go`
- `internal/httpapi/prompt_template_routes.go`
- `internal/httpapi/external_agent_config_routes.go`

## Recommended Design

1. Add a dedicated read-only engine-config route registration in
   `internal/httpapi`.
   - Keep ownership split between:
     - `internal/agentruns` for file persistence and normalization
     - `internal/httpapi` for transport and error mapping

2. Keep the route thin and store-backed.
   - Read directly from `EngineStore.List()`.
   - Return the normalized canonical list without a second translation layer.

3. Keep the bounded mode decision explicit.
   - Register the Go route behind `RequireIDEMode(...)`.
   - Do not broaden this slice to preserve Python's broader read exposure
     unless a concrete share/deployment caller is identified.

4. Keep websocket parity deferred.
   - Read hydration does not require `EngineConfigsUpdated`.
   - Leave engine-config mutation/broadcast work to a later bounded slice.

5. Keep the follow-up bounded.
   - After this read slice lands, move to the next bounded write transport
     instead of bundling multiple CRUD surfaces together.

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'EngineConfig|GetEngineConfigs' -count=1`
- `./scripts/go.sh test ./internal/agentruns -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needs a focused doc first because it introduces an explicit scope
  and mode-policy decision instead of silently inheriting Python's broader
  route exposure
- reuse the landed Go `EngineStore` directly instead of inventing an engine
  service layer for a plain file-backed read
- keep websocket and engine mutation parity out of scope because the current
  direct caller is hydration, not multi-client synchronization

## Open Questions

- whether `GET /getEngineConfigs` should later become available outside IDE
  mode once a concrete share/deployment caller exists
  - recommendation: keep the route IDE-only until a real caller proves that
    broader access is part of the Go product surface

## Next Recommended Step

- the transcription-profile hydration follow-up is now landed in
  `phase-13-transcription-profile-read-transport-and-capability-owner.md`
- the engine-config update follow-up is now landed in
  `phase-13-engine-config-update-transport.md`
- the agent-profile CRUD follow-up is now landed in
  `phase-13-agent-profile-crud-transport.md`
- the transcription-profile CRUD follow-up is now landed in
  `phase-13-transcription-profile-crud-transport.md`
- the next bounded direct settings-write dependency is now external-agent-config
  CRUD over the landed Go config store/checker boundary
