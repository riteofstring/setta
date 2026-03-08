# Phase 12 Agent-Run List Read Transport Closeout

## Purpose

This doc records the concrete dependency gap that came out of the final Phase 12
external-agent closeout inventory and the bounded slice that closed it.

The Go external-agent runtime, send/hydrate/stop/approval/question routes,
executor adapters, parity slices, prompt shaping, attachment shaping, and
AI-follow transport were already landed. The remaining user-facing dependency
was that the frontend still loaded the global agent-run list from a
Python-owned route before it could:

- resolve the latest running external run to stop
- refresh project-chat history and provenance after external submit
- refresh external-run-backed overview and skills/MCP viewer state

That dependency is narrow enough to close with thin Go read transport over the
existing run store instead of reopening the broader Python `agentic.py`
migration surface.

## Current Status

Landed before this slice:

- Go-owned external-agent chat send/hydrate/stop/approval/question transport
- Go-owned external-agent runtime and Codex/OpenCode/Claude executors
- Go-owned external-agent AI-follow snapshot and realtime behavior
- existing persisted run storage in `internal/agentruns`

Concrete dependency that triggered this slice:

- `frontend/src/state/actions/ai.ts`
  - `loadAgentRuns()` still calls `route_get_agent_runs()`
  - `findLatestRunningExternalRunId()` depends on that list before
    `/stopExternalAgentRun`
- frontend consumers still read `agentRuns` broadly:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
- Python owned the route in `backend/setta/routers/agentic.py`:
  - `route_get_agent_runs(...)`

Landed in this slice:

- `internal/httpapi/agent_run_routes.go`
  - thin IDE-gated `GET /getAgentRuns` transport
  - direct readback from `internal/agentruns.RunStore`
- `internal/app/app.go`
  - explicit `RunStore` wiring into the new route registration
- `internal/httpapi/route_names.go`
  - bare-route registration for `getAgentRuns`
- `internal/httpapi/agent_run_routes_test.go`
  - focused coverage for successful list read, empty-list read, and
    IDE-mode gating

Closeout rerun after the landing:

- the frontend still references other Python-owned agentic reads:
  - `route_get_agent_profiles()`
  - `route_get_prompt_templates()`
  - `route_get_agentic_summary_cache_status()`
- those are not part of the external-agent runtime boundary that Phase 12 was
  explicitly tracking
- no additional concrete external-agent dependency was found after `GET
  /getAgentRuns` moved to Go

## Scope

This slice delivered:

- thin Go transport for `GET /getAgentRuns`
- source-of-truth readback from `internal/agentruns.RunStore`
- response shape matching the existing frontend expectation: `[]agentruns.Run`
- focused route tests for:
  - successful list read
  - empty-list read
  - IDE-mode gating

## Non-Goals

- broad `agentic.py` migration
- Go-owned `startAgentRun`, `stopAgentRun`, or run-chain routes
- agent-profile CRUD transport
- managed `setta_llm` runtime expansion
- speculative reshaping of the frontend `agentRuns` store contract

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `backend/setta/routers/agentic.py`
- `backend/setta/agentic/store.py`
- `tests/routers/test_agentic_routes.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
- `internal/agentruns/store.go`
- `internal/httpapi`

## Recommended Design

1. Keep the route read-only and thin.
   - No new orchestration service is needed for this slice.
   - Read directly from the persisted run store already used by the landed
     runtime owners.

2. Use the existing run JSON shape as the contract.
   - The frontend already consumes `AgentRun[]`.
   - Do not add route-local reshaping or compatibility fields.

3. Keep the scope to the dependency that inventory found.
   - Land `GET /getAgentRuns`.
   - Do not reopen start/stop/profile/chain transport in the same slice unless
     a direct dependency appears during implementation.

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'AgentRun|GetAgentRuns' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- treat the Python-owned agent-run list route as a real remaining Phase 12
  dependency because external stop/history UI still consumes it today
- keep this slice read-only and store-backed instead of reopening the broader
  agentic route cluster
- keep `GET /getAgentRun` out of this slice because the inventory-backed
  dependency was the list route only

## Open Questions

- whether the remaining non-external-agent Python reads should become a new
  bounded follow-up doc
  - recommendation: yes, but only if product work actually prioritizes agent
    profiles, prompt-template transport, or agentic summary cache status next

## Next Recommended Step

- treat the tracked Phase 12 external-agent boundary as complete for now
- if more AI-route migration is needed, open a new bounded doc for the
  remaining non-external-agent `agentic.py` reads instead of broadening this
  closeout slice
