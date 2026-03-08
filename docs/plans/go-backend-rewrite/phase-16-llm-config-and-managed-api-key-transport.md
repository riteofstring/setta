# Phase 16 LLM Config And Managed API Key Transport

## Purpose

This doc records the landed bounded post-Phase-15 slice.

Phase 15 is closed for the current plugin/runtime scope. The next
highest-leverage remaining direct frontend dependency is the LLM settings
surface used by AI settings, chat hydration, and hidden app-generation
preflight:

- `GET /getLLMConfig`
- `POST /setLLMConfig`
- `GET /getLLMApiKeys`
- `POST /setLLMApiKeys`

This slice moves only that surface and the bounded owner work it requires.
It does not reopen managed `setta_llm` execution, broad watcher parity, or
other Python-owned app-generation features.

## Current Status

Completed before this slice:

- Phase 15 plugin runtime/transport closeout
- the earlier bounded agentic/config slices through Phase 14
- the landed Go-owned LLM runtime foundation already used by:
  - `internal/agentruns`
  - `internal/transcriptionprofiles`
  - `internal/httpapi/mcp_routes.go`

Concrete dependency that triggered this slice:

- active frontend callers still use:
  - `loadLLMConfig()` / `saveLLMConfig(...)`
  - `loadLLMApiKeys()` / `mutateAndSaveLLMApiKeys(...)`
- those callers are centered in:
  - `frontend/src/state/actions/ai.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateLLMState.ts`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
- frontend websocket consumers also already handle:
  - `LLMConfigUpdated`
  - `LLMApiKeysUpdated`
- Python still owns the route surface in `backend/setta/routers/llm.py`

Current Go behavior after this slice:

- `internal/llmconfig/config.go` already owns:
  - `llm_config.json` load/save/normalization
  - `llmconfig.Runtime` for live config and runtime API-key filtering
  - `.env` parsing for configured runtime API keys
- `internal/app/app.go` already:
  - loads `llm_config.json`
  - constructs `llmconfig.Runtime`
  - seeds runtime API keys from workspace `.env` plus process env
  - passes the runtime into transcription and agent-run services
- Go now owns:
  - HTTP transport for the four frontend LLM settings routes
  - revisioned managed API-key read/write semantics over workspace `.env`
  - websocket `LLMConfigUpdated` / `LLMApiKeysUpdated` producers
  - immediate shared-runtime refresh of current API keys after config saves

Landed in this slice:

- `internal/llmconfig`
  - revisioned managed API-key read/write owner over workspace `.env`
  - direct `llm_config.json` save owner above the shared runtime
  - effective vs runtime API-key resolution split for frontend snapshots vs
    engine-facing runtime state
- `internal/httpapi/llm_routes.go`
  - thin IDE-gated transport for:
    - `GET /llm/config`
    - `POST /llm/config`
    - `GET /llm/apiKeys`
    - `POST /llm/apiKeys`
- `internal/realtime/messages.go`
  - Go websocket message constructors/types for:
    - `LLMConfigUpdated`
    - `LLMApiKeysUpdated`
- `internal/app/app.go`
  - shared `llmconfig.Service` wiring into the existing runtime and route
    registration path
- focused coverage in:
  - `internal/llmconfig/managed_api_keys_test.go`
  - `internal/llmconfig/service_test.go`
  - `internal/httpapi/llm_routes_test.go`
  - `internal/app/websocket_test.go`

Current Python behavior relevant to this slice:

- `GET /getLLMConfig`
  - returns the current LLM config snapshot
- `POST /setLLMConfig`
  - is IDE-only
  - persists `llm_config.json`
  - updates the live runtime
  - returns the saved config snapshot
- `GET /getLLMApiKeys`
  - is IDE-only
  - reads only managed API keys from `.env`
  - merges configured process-env keys into the effective response payload
  - returns revision/corrupt/unavailable metadata
- `POST /setLLMApiKeys`
  - is IDE-only
  - applies expected-revision writes to the managed `.env` key subset
  - preserves unrelated `.env` entries
  - updates the live runtime and broadcasts a websocket snapshot
- Python also has file-watch reload paths for:
  - external `llm_config.json` edits
  - external `.env` edits

## Scope

This slice delivered:

- a bounded Go owner for managed API-key snapshot read/write semantics over
  workspace `.env`
- thin Go transport for:
  - `GET /getLLMConfig`
  - `POST /setLLMConfig`
  - `GET /getLLMApiKeys`
  - `POST /setLLMApiKeys`
- live `llmconfig.Runtime` updates after config and managed-key mutations
- websocket producers for:
  - `LLMConfigUpdated`
  - `LLMApiKeysUpdated`
- focused route, owner, and app websocket coverage

## Non-Goals

- external file-watch parity for `llm_config.json` and `.env`
- broader managed-agent execution work
- app-generation skill/custom-skill transport
- regenerating frontend endpoint bindings
- preserving Python route policy where there is no concrete caller

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-caller-and-runtime-closeout.md`
- `backend/setta/routers/llm.py`
- `backend/setta/llm/api_keys.py`
- `backend/setta/llm/api_key_runtime_sync.py`
- `backend/setta/llm/config_watcher.py`
- `backend/setta/llm/dotenv_watcher.py`
- `tests/routers/test_llm_api_key_routes.py`
- `tests/llm/test_api_keys.py`
- `tests/llm/test_api_key_runtime_sync.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/state/actions/websocketReceive.ts`
- `frontend/src/state/actions/aiSaveLLMConfig.test.ts`
- `frontend/src/state/actions/aiSaveLLMApiKeys.test.ts`
- `frontend/src/state/actions/aiResourceLoadGuards.test.ts`
- `frontend/src/state/actions/websocketReceive.test.ts`
- `internal/llmconfig/config.go`
- `internal/llmconfig/config_test.go`
- `internal/app/app.go`
- `internal/realtime/messages.go`
- `internal/httpapi/transcription_profile_routes.go`

## Recommended Design

1. Keep `internal/llmconfig` as the owner boundary.
   - Do not put `.env` mutation semantics in `httpapi`.
   - Extend the existing package with explicit managed API-key read/write
     helpers and snapshot types.
   - Keep the live runtime owner as `llmconfig.Runtime`.

2. Keep transport thin and IDE-gated.
   - Register the four routes under `internal/httpapi`.
   - Keep `GET /getLLMConfig` and both API-key routes IDE-gated because the
     active callers are IDE/settings surfaces.
   - Return typed conflict/corrupt/unavailable API-key errors instead of
     heuristic fallbacks.

3. Preserve robust `.env` source-of-truth semantics.
   - Read only the managed key subset from `.env`.
   - Preserve unrelated `.env` entries exactly when writing.
   - Compute deterministic revisions from the managed key snapshot.
   - Use a file lock around read-modify-write so revision checks stay real.

4. Update the live runtime on every successful mutation.
   - `setLLMConfig` updates `llmconfig.Runtime` immediately.
   - managed API-key reads/writes must filter runtime keys through the current
     config set.
   - keep transcription and agent-run services on the shared runtime pointer
     instead of adding restart hooks.

5. Broadcast frontend snapshot updates for the active websocket consumers.
   - Add Go message constructors/types for `LLMConfigUpdated` and
     `LLMApiKeysUpdated`.
   - Broadcast successful config saves and managed-key writes.
   - Do not pull external file-watch reload into this slice unless it falls out
     of an already-landed app hook with little extra surface area.

## Verification

- `./scripts/go.sh test ./internal/llmconfig -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'LLM|LLMConfig|LLMApiKeys' -count=1`
- `./scripts/go.sh test ./internal/app -run 'LLM|ApiKeys' -count=1`
- `pnpm -C frontend exec vitest run src/state/actions/aiSaveLLMConfig.test.ts src/state/actions/aiSaveLLMApiKeys.test.ts src/state/actions/aiResourceLoadGuards.test.ts src/state/actions/websocketReceive.test.ts`
- `git diff --check`

## Decisions Made

- this slice needs a doc first because the direct route move depends on an
  owner decision for revisioned `.env` writes and live runtime mutation
- keep the owner in `internal/llmconfig` instead of inventing a parallel
  settings package
- refresh runtime API keys again after config saves so newly referenced
  process-env or managed `.env` keys become live immediately
- broadcast an API-key snapshot after config saves because the active frontend
  callers do not separately refetch API keys when only the config changes
- treat external file-watch parity as a separate follow-on unless the current
  app wiring exposes a cheap bounded reuse path

## Progress Notes

- 2026-03-09: landed Go-owned transport for the direct frontend LLM config and
  managed API-key route surface.
- 2026-03-09: landed revisioned managed API-key reads/writes that preserve
  unrelated `.env` entries and use a real file lock for read-modify-write.
- 2026-03-09: landed app-level websocket coverage for `LLMConfigUpdated` and
  `LLMApiKeysUpdated`.
- 2026-03-09: kept external `.env` / `llm_config.json` file-watch parity
  explicitly deferred instead of silently broadening the slice.
- 2026-03-09: the next caller-backed follow-on identified here later landed as
  `phase-17-app-gen-skills-and-custom-skill-transport.md`.

## Open Questions

- whether `GET /getLLMConfig` should stay broader than IDE mode
  - recommendation: keep it IDE-gated for the current direct caller set and
    only widen if a real non-IDE caller appears
- whether external `.env` / `llm_config.json` disk edits need a same-slice
  watcher follow-on
  - recommendation: defer unless a concrete app/runtime caller proves the need

## Next Recommended Step

- rerank the remaining Python-owned AI/app-generation routes after the landed
  Phase 17 follow-on instead of assuming watcher parity is next automatically
- external `.env` or `llm_config.json` watch parity should still only reopen
  if a concrete runtime caller proves the need
