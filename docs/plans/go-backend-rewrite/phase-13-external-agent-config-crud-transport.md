# Phase 13 External-Agent-Config CRUD Transport

## Purpose

This doc records the landed bounded post-Phase-13 slice for
external-agent-config CRUD transport.

The prior Phase 13 slices cleared the direct frontend hydration-read backlog
and the remaining direct settings writes except one. The last direct frontend
settings write cluster still owned by Python is external-agent-config CRUD:

- `POST /createExternalAgentConfig`
- `POST /updateExternalAgentConfig`
- `POST /deleteExternalAgentConfig`

This slice moved only those three routes over a new Go owner above the landed
`internal/externalagentconfigs.Store`. It does not broaden into
`POST /getExternalAgentConfig`, websocket `ExternalAgentConfigsUpdated`
parity, plugin-adapter-registry parity, or broad Python preflight parity.

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
- Phase 13 agent-profile CRUD transport
- Phase 13 transcription-profile CRUD transport

Concrete dependency that triggered this slice:

- direct frontend callers still use:
  - `createExternalAgentConfig(...)`
  - `updateExternalAgentConfig(...)`
  - `deleteExternalAgentConfig(...)`
- those callers are in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/state/actions/ai.ts`
- the frontend action layer already updates local AI state directly from the
  mutation response
- Python still owns the three routes in `backend/setta/routers/agentic.py`
- Go already owns:
  - the canonical `external_agents.json` file store in
    `internal/externalagentconfigs.Store`
  - the bounded health/preflight checker in
    `internal/externalagentconfigs.Checker`

Current Python behavior relevant to this slice:

- all three routes are IDE-only and LLM-gated
- create:
  - normalizes `envVarWhitelist`
  - applies Codex defaults for missing `approvalPolicy` and `sandboxPolicy`
  - defaults missing Claude/OpenCode `settingsManagedBlock`
  - validates plugin adapter selection against the live Python plugin runtime
  - appends the new config to `external_agents.json`
  - writes canonical managed settings files for:
    - Claude shared `.claude/settings*.json`
    - per-config Codex `config.toml`
    - per-config OpenCode `opencode.json`
  - broadcasts `ExternalAgentConfigsUpdated`
- update:
  - revalidates plugin adapter selection
  - normalizes `envVarWhitelist`
  - replaces the persisted config by id
  - broadcasts `ExternalAgentConfigsUpdated`
  - notably does not rewrite the canonical settings files
- delete:
  - removes the persisted config by id
  - broadcasts `ExternalAgentConfigsUpdated`
  - notably does not clean up canonical settings files

Current Go behavior after this slice:

- `internal/externalagentconfigs.Store` already owns:
  - file path resolution for `external_agents.json`
  - strict decode and normalization
  - list/get/write operations
- `internal/httpapi/external_agent_config_routes.go` already owns:
  - thin `GET /getExternalAgentConfigs`
  - thin `GET /getExternalAgentHealth`
- the current Go runtime still depends on per-config Codex/OpenCode canonical
  settings files under `setta_files/external_agent_settings/...` as the base
  payload for MCP-enabled runtime configs
- `internal/externalagentconfigs.Service` now owns:
  - create/update/delete orchestration above the file store
  - built-in config normalization plus Codex default-policy application
  - default Claude/OpenCode managed settings blocks when absent
  - canonical per-config Codex/OpenCode settings-file sync under
    `setta_files/external_agent_settings/...`
  - stale per-config Codex/OpenCode artifact cleanup on update/delete
- `internal/httpapi/external_agent_config_routes.go` now owns:
  - thin IDE-gated `POST /createExternalAgentConfig`
  - thin IDE-gated `POST /updateExternalAgentConfig`
  - thin IDE-gated `POST /deleteExternalAgentConfig`

Current frontend behavior relevant to scoping:

- same-tab correctness does not depend on websocket fan-out because
  `frontend/src/state/actions/ai.ts` already upserts/removes configs in the
  local store from the mutation response
- the current direct settings UI exposes the built-in tool types directly
  (`codex`, `claude_code`, `opencode`)
- the current direct settings UI does not expose a robust plugin-adapter
  selector or plugin-adapter-registry owner

## Scope

This slice delivered:

- a bounded Go external-agent-config service above the landed store
- thin Go transport for:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`
- focused service and route tests covering:
  - create roundtrip
  - update roundtrip
  - delete roundtrip
  - update/delete not found
  - invalid JSON
  - missing top-level config payload
  - invalid `pluginAdapterId` combinations
  - Codex default policy application
  - per-config Codex/OpenCode canonical settings-file initialization
  - share-mode gating

## Non-Goals

- `POST /getExternalAgentConfig`
- websocket `ExternalAgentConfigsUpdated` parity
- Python preflight cache parity
- plugin-adapter-registry parity
- plugin external-agent command/env-var preflight parity
- shared Claude settings-file ownership from generic config CRUD

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-external-agent-config-and-health-read-transport.md`
- `docs/plans/go-backend-rewrite/phase-13-transcription-profile-crud-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/external_agent_defaults.py`
- `backend/setta/agentic/external_agent_settings.py`
- `backend/setta/types/external_agents.py`
- `tests/routers/test_agentic_routes.py`
- `tests/routers/test_share_mode_blocks_ide_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `internal/externalagentconfigs/store.go`
- `internal/externalagentconfigs/preflight.go`
- `internal/httpapi/external_agent_config_routes.go`
- `internal/httpapi/external_agent_config_routes_test.go`
- `internal/externalagents/codex_executor.go`
- `internal/externalagents/opencode_executor.go`
- `internal/externalagents/claude_executor.go`

## Recommended Design

1. Add a dedicated Go service for external-agent-config mutations.
   - Keep ownership split between:
     - `internal/externalagentconfigs.Store` for `external_agents.json`
     - `internal/externalagentconfigs.Service` for mutation rules and
       canonical managed-settings side effects
     - `internal/httpapi` for thin transport and HTTP error mapping

2. Keep built-in external-agent defaults and normalization in the service.
   - Normalize and dedupe `envVarWhitelist`.
   - Apply default Codex `approvalPolicy=on-failure` and
     `sandboxPolicy=workspace-write` when absent.
   - Default missing Claude/OpenCode `settingsManagedBlock` for create.

3. Keep per-config managed-settings ownership explicit.
   - Create/update the per-config Codex and OpenCode canonical settings files
     under `setta_files/external_agent_settings/...` when the config stays on a
     Setta-owned path.
   - Do not make generic config CRUD the owner of shared Claude
     `.claude/settings*.json` files.
   - Claude settings remain runtime-owned because those paths are shared across
     configs and are not safely attributable to one persisted config entry.

4. Keep plugin handling explicitly bounded.
   - Enforce only the deterministic config-shape rules available in Go now:
     - `pluginAdapterId` is required for `toolType=plugin`
     - `pluginAdapterId` is rejected for non-plugin tool types
   - Do not claim live plugin-adapter-registry validation until Go owns a
     source-of-truth registry for registered plugin external-agent adapters.

5. Keep transport thin and IDE-only.
   - Use strict JSON decode.
   - Require a top-level `config` payload for update.
   - Require `configId` for delete.
   - Map not-found and invalid-config errors explicitly.

6. Defer realtime fan-out again.
   - The current direct frontend callers already update local state from the
     mutation response.
   - Do not broaden this slice into websocket ownership without a concrete
     multi-client dependency.

## Verification

- `./scripts/go.sh test ./internal/externalagentconfigs -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'ExternalAgent|CreateExternalAgentConfig|UpdateExternalAgentConfig|DeleteExternalAgentConfig' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needs a focused doc first because it introduces a new Go owner
  above the store and a real boundary decision for canonical settings files
- plugin adapter registration validation is not available from a Go
  source-of-truth today, so this slice only keeps the deterministic
  `pluginAdapterId` shape rules in scope
- shared Claude settings files stay runtime-owned instead of being mutated by
  generic config CRUD because those paths are shared across configs

## Landed in This Slice

- `internal/externalagentconfigs.Service`
  - Go-owned create/update/delete boundary above the canonical file store
  - built-in config-shape normalization and bounded `pluginAdapterId` rules
  - per-config Codex/OpenCode canonical settings-file sync and stale-artifact
    cleanup
- `internal/httpapi/external_agent_config_routes.go`
  - thin IDE-gated CRUD transport over the new service
- `internal/httpapi/route_names.go`
  - bare-route registration for the external-agent-config CRUD routes
- `internal/app/app.go`
  - app assembly now wires the external-agent-config service into the route
    layer
- focused coverage in:
  - `internal/externalagentconfigs/service_test.go`
  - `internal/httpapi/external_agent_config_routes_test.go`

## Closeout Rerun

- the direct frontend settings write surface tracked through Phase 13 is now
  Go-owned for the current bounded scope
- shared Claude `.claude/settings*.json` ownership remains intentionally on the
  runtime/executor path instead of on generic config CRUD
- live plugin-adapter-registry validation remains deferred because Go still
  does not own a source-of-truth registry for registered plugin external-agent
  adapters
- the remaining Python-owned agentic routes now need to be reranked from real
  callers instead of assuming another direct settings mutation slice

## Open Questions

- whether Go should later own a real plugin external-agent adapter registry
  above the plugin runtime so CRUD and health can validate plugin configs
  consistently
  - recommendation: yes, but as a separate bounded follow-on once plugin
    external-agent runtime becomes a concrete Go-owned dependency

## Next Recommended Step

- rerank the remaining Python-owned agentic routes from actual frontend/runtime
  callers before opening another transport slice
- recommendation: treat that as bounded inventory work first, because current
  direct app-start hydration and direct settings mutation flows are already
  Go-owned
