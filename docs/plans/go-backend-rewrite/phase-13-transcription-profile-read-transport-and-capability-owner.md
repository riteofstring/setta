# Phase 13 Transcription-Profile Read Transport And Capability Owner

## Purpose

This doc records the next bounded post-Phase-13 slice and its landing.

The prior Phase 13 slices moved the remaining direct frontend hydration reads
except one. The next highest-leverage remaining app-start hydration dependency
is transcription-profile read transport:

- `GET /getTranscriptionProfiles`

This slice moves only that read transport and the bounded owner it requires.
Unlike the earlier file-backed reads, Python does not simply echo the stored
`transcription_profiles.json` payload. It recomputes
`supportsRealtimeTranscription` from the current LLM config runtime on every
read. The Go move therefore needs a small owner above file persistence so the
route does not hard-code capability heuristics or trust stale stored booleans.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership
- Phase 13 agent-profile read transport
- Phase 13 prompt-template read transport
- Phase 13 agentic summary-cache-status owner and transport
- Phase 13 prompt-template CRUD transport
- Phase 13 external-agent config plus health hydration transport
- Phase 13 engine-config read transport

Concrete dependency that triggered this slice:

- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - still calls `loadTranscriptionProfiles()`
- direct frontend consumers still depend on hydrated transcription profiles:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- Python owned `GET /getTranscriptionProfiles` in
  `backend/setta/routers/agentic.py`
- Go did not yet own a transcription-profile file store or capability owner
- Go already owns the LLM config runtime needed for capability attachment:
  - `internal/llmconfig.Runtime`

Current Python behavior relevant to this slice:

- `GET /getTranscriptionProfiles` is a thin LLM-gated read route
- the route loads `transcription_profiles.json`
- it then recomputes `supportsRealtimeTranscription` for every profile by:
  - resolving the referenced LLM config from the live runtime
  - returning `false` when the config is missing
  - returning `true` only for supported realtime transcription configs
- Python currently exposes the read route outside IDE mode
- Python mutation routes and websocket broadcast parity remain separate:
  - `POST /createTranscriptionProfile`
  - `POST /updateTranscriptionProfile`
  - `POST /deleteTranscriptionProfile`
  - `TranscriptionProfilesUpdated`

Current Go behavior relevant to this slice:

- there is no Go transcription-profile owner yet
- `internal/llmconfig.Runtime` already provides canonical config resolution via
  `Configs().ResolveConfig(...)`
- the repo already has the capability rule needed for parity in Python:
  OpenAI realtime transcription model ids/prefixes plus base-url/provider
  guardrails

Current frontend behavior relevant to scoping:

- hydration needs the full list, not a single-profile read
- current selectors use `supportsRealtimeTranscription` directly, so the read
  route cannot just echo the persisted file blindly
- no direct frontend caller in the current worktree uses a single-item
  `getTranscriptionProfile` route because none exists
- current callers are IDE/settings/chat surfaces; no concrete share-mode caller
  was found in the current worktree

Landed in this slice:

- `internal/transcriptionprofiles`
  - file-backed `transcription_profiles.json` store ownership
  - live capability attachment over `internal/llmconfig.Runtime`
- `internal/httpapi/transcription_profile_routes.go`
  - thin IDE-gated `GET /getTranscriptionProfiles` transport
- `internal/app/app.go`
  - explicit transcription-profile store/service wiring over the shared
    `llmconfig.Runtime`
- `internal/httpapi/route_names.go`
  - bare-route registration for `getTranscriptionProfiles`
- focused coverage in:
  - `internal/transcriptionprofiles/store_test.go`
  - `internal/transcriptionprofiles/service_test.go`
  - `internal/httpapi/transcription_profile_routes_test.go`

Closeout rerun after the landing:

- the direct frontend hydration dependency on the Python-owned transcription
  profile read route is now gone
- the startup hydration backlog for the current direct frontend agentic reads is
  now cleared
- the Go route intentionally stays IDE-gated for the current bounded settings
  surface even though Python exposed the read more broadly
- the current remaining direct frontend Python-owned agentic routes are:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`
  - `POST /createTranscriptionProfile`
  - `POST /updateTranscriptionProfile`
  - `POST /deleteTranscriptionProfile`
- generated single-item reads still exist for:
  - `POST /getAgentProfile`
  - `POST /getAgentRun`
  - `POST /getPromptTemplate`
  - `POST /getExternalAgentConfig`
  - `POST /getEngineConfig`
  but no direct frontend caller was found for them in the current worktree

## Scope

This slice delivered:

- a bounded Go transcription-profile file owner for
  `transcription_profiles.json`
- a bounded Go capability owner that attaches live
  `supportsRealtimeTranscription` values from `internal/llmconfig.Runtime`
- thin Go transport for:
  - `GET /getTranscriptionProfiles`
- focused tests covering:
  - file-store list behavior
  - live capability attachment for supported and unsupported configs
  - missing-config fallback to `false`
  - invalid persisted payload handling
  - IDE-mode gating

## Non-Goals

- `POST /createTranscriptionProfile`
- `POST /updateTranscriptionProfile`
- `POST /deleteTranscriptionProfile`
- websocket `TranscriptionProfilesUpdated` parity
- runtime ownership of transcription sessions
- frontend generated type regeneration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-engine-config-read-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `backend/setta/llm/transcription_capabilities.py`
- `backend/setta/types/agentic.py`
- `backend/setta/database/db_objs.py`
- `backend/setta/agentic/example_config.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `internal/llmconfig/config.go`
- `internal/httpapi/engine_config_routes.go`

## Recommended Design

1. Add a dedicated `internal/transcriptionprofiles` package.
   - Keep file persistence and capability attachment out of `internal/httpapi`.
   - Split responsibilities explicitly:
     - `Store` for `transcription_profiles.json`
     - `Service` for live capability attachment above the store

2. Keep file persistence simple and deterministic.
   - Use a list-backed JSON file owner similar to the other Phase 13 file
     stores.
   - Preserve canonical normalized profile order from the file.

3. Recompute `supportsRealtimeTranscription` on every read.
   - Resolve the referenced LLM config from `llmconfig.Runtime`.
   - Return `false` when the config is missing or unsupported.
   - Do not trust the stored `supportsRealtimeTranscription` boolean as the
     source of truth.

4. Keep the route thin and IDE-gated.
   - Register `GET /getTranscriptionProfiles` behind `RequireIDEMode(...)`.
   - Return the service-owned hydrated list directly.
   - Do not preserve Python's broader route exposure without a concrete caller.

5. Defer write and realtime work.
   - After this slice lands, re-evaluate the remaining direct frontend write
     routes separately instead of bundling them into the read owner.

## Verification

- `./scripts/go.sh test ./internal/transcriptionprofiles -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TranscriptionProfile|GetTranscriptionProfiles' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needs a focused doc first because the read move requires an owner
  decision about live capability resolution, not just a thin file-backed route
- `supportsRealtimeTranscription` must come from live Go LLM config resolution
  instead of the stored profile payload
- write routes and websocket fan-out stay deferred because the current direct
  dependency is startup hydration, not mutation/realtime parity

## Open Questions

- whether the new store should expose only read helpers or the fuller shape
  later CRUD work will need
  - recommendation: include the small read-plus-write foundation if it stays
    simple, but keep the current slice transport read-only

## Next Recommended Step

- the engine-config update follow-up is now landed in
  `phase-13-engine-config-update-transport.md`
- the agent-profile CRUD follow-up is now landed in
  `phase-13-agent-profile-crud-transport.md`
- open the next bounded Phase 13 doc around transcription-profile CRUD
  transport over the already-landed Go transcription-profile owner
- keep external-agent-config CRUD separate because it still carries the larger
  settings-file and plugin/preflight side-effect surface
