# Phase 14 Run-Chain Caller And Progress Closeout

## Purpose

This doc records the bounded closeout inventory after the landed Phase 14
runtime route slices.

The goal of this closeout was to verify whether any real run-chain caller or
progress-parity gap still remained after Go took ownership of:

- `POST /startAgentRun`
- `POST /stopAgentRun`
- `POST /startRunChain`
- `POST /stopRunChain`

## Current Status

Completed before this closeout:

- Phase 12 bounded external-agent runtime and transport ownership
- Phase 13 non-runtime agentic transport ownership
- Phase 14 managed `start/stopAgentRun` ownership
- Phase 14 managed and external-agent `start/stopRunChain` ownership over the
  dedicated Go run-chain runtime

Current Go state after this closeout:

- `internal/httpapi/agent_run_routes.go`
  - owns the full bounded Phase 14 agentic runtime route surface
- `internal/runchains`
  - owns parent chain-run persistence, active chain-task lifecycle, child-step
    orchestration, snapshot/event recording, and stop cancellation
- `internal/externalagents`
  - owns the bounded lower-level external step-run owner reused by run-chain
- `frontend/src/state/actions/ai.ts`
  - still treats persisted `GET /getAgentRuns` data as the source of truth for
    agent-run hydration and refresh

## Inputs

- `docs/plans/go-backend-rewrite/phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-managed-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-external-agent-child-step-runtime.md`
- `backend/setta/agentic/run_chain.py`
- `backend/setta/routers/agentic.py`
- `tests/agentic/test_run_chain.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`
- `frontend/src/utils/generatedEndpoints.ts`

## Findings

### 1. There is still no live frontend caller for run-chain mutation routes

Repo search found no direct frontend callsites for:

- `startRunChain`
- `stopRunChain`
- `getAgentRun`

The only references outside backend code are the generated endpoint bindings.

### 2. The frontend still relies on persisted agent-run polling

Current UI behavior is driven by `GET /getAgentRuns`:

- `frontend/src/state/actions/ai.ts` loads and retries agent runs through
  `route_get_agent_runs()`
- `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`
  polls that route at a fast interval while runs are active and at a slower
  interval while idle

That means current user-facing run progress already depends on persisted run
state, not on a dedicated run-chain realtime channel.

### 3. Python did not have a separate run-chain realtime surface to preserve

`backend/setta/agentic/run_chain.py`:

- records `chain_started`, `step_started`, `step_completed`, `step_failed`,
  `chain_completed`, `chain_failed`, `chain_cancelled`, and `snapshot` events
  directly into the persisted run
- updates chain outputs in the same persisted run record
- does not use the injected `frontend_sender` to broadcast a dedicated
  run-chain websocket stream

So "richer run-chain progress realtime" is not a missed Go parity slice. It is
new product work if it is ever needed.

### 4. The landed Go runtime already matches the bounded source-of-truth path

The current Go run-chain runtime:

- persists parent chain status, outputs, and events
- supports both managed and external-agent child steps
- is already surfaced through the same persisted run polling pathway the
  frontend actually uses today

## Decisions Made

- treat the bounded Phase 14 agentic runtime route surface as complete
- stop describing richer run-chain progress behavior as an implied remaining
  parity gap
- treat any future dedicated run-chain progress UX or transport as new
  caller-backed product work, not as hidden rewrite debt

## Progress Notes

- 2026-03-09: reran the post-landing caller and parity inventory for the
  Phase 14 run-chain surface.
- 2026-03-09: confirmed there is no live frontend caller for run-chain
  mutation routes and no Python-owned dedicated run-chain realtime surface.
- 2026-03-09: the first bounded follow-on after this closeout landed in
  `phase-14-executor-fixture-stability-and-regression-hardening.md` to keep
  the real external-agent executor regression suite deterministic under load.
- 2026-03-09: the next bounded follow-on landed in
  `phase-14-agent-run-and-run-chain-app-middleware-regression-hardening.md`
  to prove the landed agent-run/run-chain route behavior through the real app
  handler stack.

## Verification

- docs and inventory only; no automated tests were run

## Next Recommended Step

- treat Phase 14 as complete for the current clean-break rewrite scope
- use `phase-14-executor-fixture-stability-and-regression-hardening.md` and
  `phase-14-agent-run-and-run-chain-app-middleware-regression-hardening.md` as
  the current stabilization baseline for the completed agentic runtime surface
- only reopen run-chain work for a concrete new caller or a product decision
  to add a dedicated chain-progress UX beyond persisted run polling
