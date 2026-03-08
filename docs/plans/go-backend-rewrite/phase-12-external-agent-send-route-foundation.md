# Phase 12 External-Agent Send Route Foundation

## Purpose

This doc narrows the remaining Phase 12 send-path work into one bounded landing
slice.

The goal of this slice is not full real-adapter execution parity. The goal is
to move the external-agent branch of `/getLLMResponse` onto a Go-owned runtime
path with explicit state resolution, validation, persisted running-run
creation, runtime activation, and a bounded executor interface that later
adapter work can plug into.

## Why This Slice Exists

The broader follow-on doc
`phase-12-external-agent-active-runtime-stop-approval-and-send.md` is now too
wide for a single implementation step because "adapter-backed execution" spans:

- external-agent config storage
- preflight resolution
- send-route validation/history shaping
- live runtime activation
- adapter lifecycle/control wiring
- real Codex, Claude Code, and OpenCode execution edges

This slice lands only the parts required to get `/getLLMResponse` onto a Go
ownership path without pretending the real adapters are already complete.

## Scope

This slice should deliver:

- a Go store for external-agent configs read from `external_agents.json`
- a bounded preflight-check boundary that the send path can call explicitly
- a Go-owned external-agent send service above:
  - `internal/agentruns`
  - `internal/agentprofiles`
  - `internal/projectstate`
  - the completed `internal/externalagents.Runtime`
- thin `/getLLMResponse` transport for the external-agent engine branch
- persisted running-run creation plus runtime activation for newly started
  external chats
- a bounded executor/controller interface proven by focused tests

This slice should explicitly include request-shape and history behavior for:

- `sectionId` versus `allowUnscoped`
- branch-edit validation
- `continueFromChatId`
- external chat-engine compatibility checks
- frontend-affinity-token normalization
- runtime execution settings:
  - `permissionMode`
  - `searchEnabled`
- external approval/sandbox overrides
- Codex reasoning defaults

## Non-Goals

- real Codex, Claude Code, or OpenCode adapter execution
- websocket/event fanout beyond runtime activation hooks already needed by the
  existing hydration path
- `respondExternalAgentQuestion`
- managed `setta_llm`
- agent-profile or external-agent config CRUD
- app-generation prompt parity beyond the fields needed to keep the request
  shape stable for this slice

## Inputs

- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-external-agent-active-runtime-stop-approval-and-send.md`
- `docs/reference/external-agents.md`
- `backend/setta/routers/ai.py`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/store.py`
- `backend/setta/agentic/external_agent_preflight.py`
- `backend/setta/types/external_agents.py`
- `tests/agentic/test_agentic_store.py`
- `tests/routers/test_ai_agent_run_chats.py`
- `internal/externalagents/runtime.go`
- `internal/externalagents/service.go`
- `internal/agentruns/store.go`
- `internal/agentprofiles/store.go`
- `internal/projectstate`

## Recommended Design

1. Keep `internal/externalagents.Service` read-only.
   - Hydration should remain separate from send/runtime orchestration.

2. Add a small Go owner for external-agent config reads.
   - Read `external_agents.json` directly.
   - Do not broaden into CRUD in this slice.

3. Put send-path orchestration in a dedicated Go service layered over the
   completed runtime.
   - Resolve engine config, external config, project config, optional profile,
     and prior chat history explicitly.
   - Create the persisted running run before dispatch.
   - Activate the already-landed runtime with the returned controller and the
     initial live chat snapshot.

4. Keep preflight as an explicit interface.
   - The send path should call a typed checker, not shell out ad hoc in the
     route.
   - A minimal concrete checker is acceptable in this slice as long as the
     service boundary is explicit.

5. Keep transport thin.
   - Decode request
   - invoke service
   - map typed errors to HTTP codes

## Landing Order

1. Add the external-agent config read package plus tests.
2. Add the bounded preflight interface and minimal checker shape.
3. Add the external-agent send service plus focused unit tests.
4. Add `/getLLMResponse` external-agent transport tests and app wiring.
5. Update Phase 12 docs with what remains for real adapters.

## Verification Targets

- `./scripts/go.sh test ./internal/externalagentconfigs ./internal/externalagents ./internal/httpapi`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Expected Remaining Gap After This Slice

After this slice, the remaining Phase 12 work should be smaller and more
explicit:

- wire real Codex, Claude Code, and OpenCode executors through the new bounded
  interface
- produce live deltas, approvals, and question prompts during active execution
- complete `respondExternalAgentQuestion`
- close out websocket/event streaming ownership for active runs
