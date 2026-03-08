# Phase 13 External-Agent Config And Health Read Transport

## Purpose

This doc records the next bounded post-Phase-13 slice and its landing plan.

The prior Phase 13 slices moved agent profiles, prompt templates,
summary-cache-status, and prompt-template CRUD to Go. The next
highest-leverage remaining hydration dependency is that app startup and several
chat/settings surfaces still read external-agent config and health from
Python-owned routes:

- `GET /getExternalAgentConfigs`
- `GET /getExternalAgentHealth`

This slice moves only those read transports over the already-landed Go
external-agent config store and bounded preflight checker. It does not broaden
into external-agent config CRUD, websocket broadcast parity, or full Python
preflight parity.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership
- Phase 13 agent-profile read transport
- Phase 13 prompt-template read transport
- Phase 13 agentic summary-cache-status owner and transport
- Phase 13 prompt-template CRUD transport

Concrete dependency that triggered this slice:

- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
  - still calls:
    - `loadExternalAgentConfigs()`
    - `loadExternalAgentHealth()`
- frontend consumers that gate chat/app behavior still depend on those stores:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts`
- Python still owns those routes in `backend/setta/routers/agentic.py`
- Go already owns:
  - `internal/externalagentconfigs.Store` for `external_agents.json`
  - `internal/externalagentconfigs.SystemChecker` for bounded preflight

Current Python behavior relevant to this slice:

- config read:
  - returns the stored `external_agents.json` list
- health read:
  - builds one preflight status per config
  - includes supported/available booleans plus issue strings
  - includes richer Python-only checks for:
    - managed API key/env-var availability
    - SDK/CLI probing details
    - plugin adapter registration and command resolution
    - cached preflight reuse

Current Go behavior relevant to this slice:

- the config store already normalizes and returns the canonical
  `external_agents.json` shape
- the checker already supports the Go-owned runtime surface well enough to
  answer current hydration questions for:
  - Codex app-server
  - Claude SDK bridge
  - OpenCode SDK/server
- the checker is intentionally narrower than Python preflight today:
  - no plugin-adapter-aware preflight parity
  - no managed API key/env-var status parity
  - no Python preflight cache layer

Current frontend behavior relevant to scoping:

- the hydration path uses config list and health list separately
- UI gating currently relies primarily on:
  - `configId`
  - `name`
  - `supported`
  - `available`
  - `issues`
- the direct callers do not require prompt-template-style websocket fan-out for
  correctness in the same tab

## Scope

This slice is responsible for:

- thin Go transport for:
  - `GET /getExternalAgentConfigs`
  - `GET /getExternalAgentHealth`
- reusing the existing bounded Go owners:
  - `internal/externalagentconfigs.Store`
  - `internal/externalagentconfigs.Checker`
- keeping health generation source-of-truth local to the checker boundary
- focused route tests covering:
  - config list read
  - health list read
  - checker issue propagation
  - store/checker internal error handling
  - IDE-mode gating

## Non-Goals

- `POST /createExternalAgentConfig`
- `POST /updateExternalAgentConfig`
- `POST /deleteExternalAgentConfig`
- `POST /getExternalAgentConfig`
- websocket `ExternalAgentConfigsUpdated` parity
- plugin-adapter-aware health parity
- managed API key/env-var preflight parity
- Python preflight cache parity

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-prompt-template-crud-transport.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `backend/setta/agentic/external_agent_preflight.py`
- `tests/routers/test_agentic_routes.py`
- `tests/routers/test_share_mode_blocks_ide_routes.py`
- `tests/agentic/test_external_agent_preflight.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState.ts`
- `frontend/src/components/Chat/engineUtils.ts`
- `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
- `internal/externalagentconfigs/store.go`
- `internal/externalagentconfigs/preflight.go`
- `internal/httpapi/ai_routes.go`

## Recommended Design

1. Add a dedicated read-only route registration for external-agent config and
   health.
   - Keep ownership split between:
     - `internal/externalagentconfigs` for config persistence and preflight
     - `internal/httpapi` for HTTP transport and error mapping

2. Keep the config route trivial and store-backed.
   - Read directly from the Go store.
   - Return the canonical normalized config list.

3. Keep the health route thin over the landed checker.
   - Read configs from the same Go store.
   - Build one status per config through the checker interface.
   - Keep order aligned with the config list.

4. Preserve the frontend-facing payload shape that current selectors actually
   use.
   - Return `configId`, `name`, `toolType`, `runMode`, `supported`,
     `available`, and `issues`.
   - Provide nullable/defaulted fields required by the generated health type
     even when the current Go checker does not compute the richer Python-only
     metadata.

5. Explicitly defer richer Python-only preflight parity.
   - Do not bolt Python env-var/plugin cache semantics onto this read slice.
   - If a concrete UI bug appears that requires richer preflight data, open a
     separate bounded follow-on above the same checker boundary.

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'ExternalAgent|GetExternalAgent(Configs|Health)' -count=1`
- `./scripts/go.sh test ./internal/externalagentconfigs ./internal/httpapi -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- this slice needs a focused doc first because it includes an explicit scope
  decision to move hydration transport without claiming full Python preflight
  parity
- the health route should depend on the landed Go checker now instead of
  waiting for broader plugin/env-var parity work
- websocket broadcast parity stays deferred because the direct hydration
  callers already refresh through HTTP and local state updates

## Open Questions

- whether plugin-adapter-aware preflight should become a bounded follow-on once
  Go owns plugin external-agent runtime rather than only config persistence
  - recommendation: defer until plugin-backed external-agent runtime becomes a
    concrete Go-owned product dependency

## Next Recommended Step

- land the thin Go config and health read routes plus focused tests
- after that landing, reassess whether agent-profile CRUD or engine-config
  hydration is the smaller remaining direct frontend Python-owned settings
  dependency
