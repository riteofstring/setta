# Phase 13 Agent-Run Read Transport Closeout

## Purpose

This doc records the bounded follow-on slice for `POST /getAgentRun` after the
landed dormant single-item settings-read cleanup.

At this point, the remaining Python-owned agentic surface is almost entirely
runtime-shaped. One small exception remains:

- `POST /getAgentRun`

Unlike `start/stopAgentRun` and `start/stopRunChain`, this route is just a
single persisted run lookup over an already-landed Go owner. That makes it the
last bounded transport cleanup available before the rewrite crosses into real
runtime design work.

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime and route ownership for the bounded
  external-agent surface
- Phase 13 direct app-start hydration reads and direct settings mutation
  surface
- Phase 13 engine-config create/delete cleanup
- Phase 13 dormant single-item settings-read cleanup
- Phase 12 agent-run list read transport closeout

Current Python behavior relevant to this slice:

- `POST /getAgentRun` is an LLM-gated lookup by `runId`
- it loads the persisted run from `agent_runs/`
- it returns `404` when the run is missing

Current Go behavior before this slice:

- Go already owns the canonical persisted run owner in `internal/agentruns.RunStore`
- Go already owns `GET /getAgentRuns` in `internal/httpapi/agent_run_routes.go`
- Go does not yet expose the single-run lookup transport even though the owner
  and list transport are already landed

Current caller status relevant to scoping:

- the post-Phase-13 inventory did not find a current direct frontend caller
  for `POST /getAgentRun`
- this is therefore cleanup, not a hidden product dependency
- it is still worth landing because it removes the last thin route from the
  managed-agent run surface before runtime-only work begins

## Scope

This slice will deliver:

- thin Go transport for:
  - `POST /getAgentRun`
- focused route tests covering:
  - successful persisted run lookup
  - missing `runId` validation
  - `404` not-found mapping
  - share-mode gating

## Non-Goals

- `POST /startAgentRun`
- `POST /stopAgentRun`
- `POST /startRunChain`
- `POST /stopRunChain`
- managed-run cancellation runtime ownership
- run-chain runtime migration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-13-agentic-single-item-read-transport.md`
- `docs/plans/go-backend-rewrite/phase-13-remaining-agentic-route-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-12-agent-run-list-read-transport-closeout.md`
- `backend/setta/routers/agentic.py`
- `tests/routers/test_agentic_routes.py`
- `internal/agentruns/store.go`
- `internal/httpapi/agent_run_routes.go`
- `internal/httpapi/agent_run_routes_test.go`

## Recommended Design

1. Keep the route in `internal/httpapi/agent_run_routes.go`.
   - it belongs beside `GET /getAgentRuns`
   - no new subsystem is justified for a single persisted read

2. Keep the transport thin.
   - strict JSON decode
   - explicit required `runId` validation
   - direct delegation to `RunStore.Load(...)`

3. Reuse stable transport error codes.
   - `run_id_required`
   - `agent_run_not_found`

4. Keep the current IDE-only route boundary.
   - do not broaden into share-mode parity while the remaining run routes are
     still unresolved runtime work

## Verification

- `./scripts/go.sh test ./internal/httpapi -run 'AgentRun|GetAgentRun|GetAgentRuns' -count=1`
- `./scripts/go.sh test ./internal/agentruns -run 'RunStore' -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- treat `POST /getAgentRun` as the last bounded transport cleanup before any
  managed-agent runtime decision
- keep `start/stopAgentRun` and run-chain routes out of scope because they are
  not transport-only gaps

## Open Questions

- whether `start/stopAgentRun` should be reopened next at all
  - recommendation: only behind a new bounded runtime doc, since that work is
    qualitatively different from this read-only closeout

## Next Recommended Step

- land `POST /getAgentRun` over the existing `RunStore`
- after landing, update the Phase 13 closeout docs so the remaining
  Python-owned agentic surface is explicitly runtime-only mutation work
