# Phase 13 Prompt-Template CRUD Transport

## Purpose

This doc records the next bounded post-Phase-13 slice and its landing.

The prior Phase 13 slices moved prompt-template reads and agentic
summary-cache-status reads to Go. The next highest-leverage remaining
frontend-facing Python dependency is prompt-template mutation:

- `POST /createPromptTemplate`
- `POST /updatePromptTemplate`
- `POST /deletePromptTemplate`

This slice moves only those thin HTTP transports over the already-landed Go
prompt-template file store. It does not broaden into prompt-template websocket
broadcast parity, watcher/runtime ownership, or the currently unused single-item
`POST /getPromptTemplate` read.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership
- Phase 13 agent-profile read transport
- Phase 13 prompt-template read transport
- Phase 13 agentic summary-cache-status owner and transport

Concrete dependency that triggered this slice:

- `frontend/src/state/actions/ai.ts`
  - `createPromptTemplate(...)`
  - `updatePromptTemplate(...)`
  - `deletePromptTemplate(...)`
- Python still owns those routes in `backend/setta/routers/agentic.py`
- Go already owns the canonical file-backed prompt-template store in
  `internal/prompttemplates/store.go`

Current Python behavior relevant to this slice:

- create:
  - constructs a new `PromptTemplate` with a generated id
  - saves it to `setta_files/prompts/{id}.json`
  - returns the created template
- update:
  - requires the target template to exist
  - overwrites the stored JSON document
  - returns the updated template
- delete:
  - requires the target template to exist
  - removes the stored JSON document
  - returns `null`
- all three routes are IDE-only and LLM-gated
- Python also refreshes the prompt-template watcher and broadcasts a
  `PromptTemplatesUpdated` websocket payload after mutation

Current frontend behavior relevant to scoping:

- the direct callers update local prompt-template state from the route response
  or request payload on success
- no current direct caller depends on the websocket broadcast for local CRUD
  correctness in the same tab

Landed in this slice:

- `internal/httpapi/prompt_template_routes.go`
  - thin IDE-gated `POST /createPromptTemplate` transport
  - thin IDE-gated `POST /updatePromptTemplate` transport
  - thin IDE-gated `POST /deletePromptTemplate` transport
  - explicit required-field presence checks that still allow empty prompt
    `name` and `template` values when the fields are present
- `internal/httpapi/route_names.go`
  - bare-route registration for the new prompt-template CRUD routes
- focused coverage in:
  - `internal/httpapi/prompt_template_routes_test.go`

Closeout rerun after the landing:

- the direct frontend dependency on Python-owned prompt-template CRUD is now
  gone
- prompt-template watcher refresh and `PromptTemplatesUpdated` websocket fan-out
  remain deferred because there is still no Go-owned prompt-template realtime
  path and the current direct callers do not require one for local correctness
- a closeout audit after this landing corrected an earlier stale inventory in
  the Phase 13 docs: prompt-template writes were not the last remaining direct
  frontend-owned Python agentic routes
- the remaining direct frontend Python-owned agentic routes are currently:
  - `GET /getExternalAgentConfigs`
  - `GET /getExternalAgentHealth`
  - `GET /getEngineConfigs`
  - `GET /getTranscriptionProfiles`
  - `POST /createAgentProfile`
  - `POST /updateAgentProfile`
  - `POST /deleteAgentProfile`
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`
  - `POST /updateEngineConfig`
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

- thin Go transport for:
  - `POST /createPromptTemplate`
  - `POST /updatePromptTemplate`
  - `POST /deletePromptTemplate`
- reusing the existing bounded Go prompt-template store as the source of truth
- explicit route-level behavior for:
  - IDE-only access
  - strict JSON decode
  - create id generation
  - update/delete not-found responses
  - `null` delete response
- focused route tests covering:
  - create roundtrip
  - update roundtrip
  - delete roundtrip
  - update/delete not found
  - invalid JSON
  - share-mode gating

## Non-Goals

- `POST /getPromptTemplate`
- prompt-template websocket `PromptTemplatesUpdated` parity
- prompt-template watcher/runtime ownership
- project-level prompt-section mutation routes
- frontend generated type regeneration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-prompt-template-read-transport.md`
- `docs/plans/go-backend-rewrite/phase-13-agentic-summary-cache-status-transport-and-owner.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `backend/setta/types/prompt.py`
- `tests/agentic/test_agentic_store.py`
- `tests/routers/test_agentic_routes.py`
- `tests/routers/test_share_mode_blocks_ide_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/state/actions/websocketReceive.ts`
- `internal/prompttemplates/store.go`
- `internal/httpapi/prompt_template_routes.go`

## Recommended Design

1. Extend the existing Go prompt-template route registration instead of adding a
   new subsystem.
   - Keep prompt-template ownership split between:
     - `internal/prompttemplates` for file persistence and validation
     - `internal/httpapi` for transport and HTTP error mapping

2. Keep request handling explicit and thin.
   - Decode request payloads directly into small route-local structs.
   - Reuse store normalization for default `format`, `inputSchema`, and
     `metadata` handling.
   - Map invalid JSON to `400 invalid_json`.

3. Keep existence checks explicit.
   - update/delete should call `store.Get(...)` first and map missing files to
     `404 prompt_template_not_found`.
   - do not rely on `Save(...)` or `Delete(...)` side effects to infer whether
     the template existed.

4. Keep create id generation local and deterministic in shape.
   - generate a fresh persistent template id in Go at route time
   - do not broaden the store into a larger CRUD service solely to host id
     generation

5. Defer watcher/websocket parity until a concrete caller needs out-of-band
   synchronization.
   - the current frontend callers already update local state directly from the
     CRUD responses
   - Go does not yet have a prompt-template broadcast path
   - do not broaden this slice into realtime ownership without a concrete
     dependency

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'PromptTemplate|CreatePromptTemplate|UpdatePromptTemplate|DeletePromptTemplate' -count=1`
- `./scripts/go.sh test ./internal/prompttemplates ./internal/httpapi -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needs a focused doc first because it introduces write semantics and
  an explicit defer decision for prompt-template realtime fan-out
- reuse the landed Go prompt-template store directly instead of inventing a
  larger prompt-template service boundary
- keep websocket and watcher parity out of scope for now because the current
  direct frontend callers do not depend on it for local correctness

## Open Questions

- whether prompt-template websocket fan-out should move under a later bounded
  Phase 13 slice if multi-frontend synchronization becomes a concrete
  requirement
  - recommendation: only add it once there is a real caller or product bug
    requiring out-of-band prompt-template updates

## Next Recommended Step

- open the next bounded Phase 13 doc around external-agent config plus
  external-agent health hydration transport over the already-landed Go
  `externalagentconfigs` store and preflight primitives
- after that hydration slice, reassess whether agent-profile CRUD or
  engine/transcription settings transport is the smaller remaining direct
  frontend dependency
