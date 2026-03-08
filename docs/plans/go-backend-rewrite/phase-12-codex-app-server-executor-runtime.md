# Phase 12 Codex App-Server Executor Runtime

## Purpose

This doc narrows the next Phase 12 implementation slice to the first real
adapter-backed execution path in Go.

The goal of this slice is to move Codex external-agent runs from "persisted
running-run creation plus inert runtime activation" to a real Go-owned
execution lifecycle:

- launch `codex app-server`
- own thread start or resume and turn start
- own stop and approval dispatch through the active Go runtime
- persist live chat/output updates while the run is active
- persist terminal completion and failure state in Go

This slice is intentionally Codex-first. Claude Code, OpenCode, and external
question-response routing remain follow-on work.

## Current Status

Completed before this slice:

- Go-owned external-agent chat hydration over persisted runs
- Go-owned external-agent runtime for:
  - active run registry
  - live chat overlays
  - stop ownership
  - approval-response dispatch
- Go-owned external-agent send route foundation for:
  - external-agent config lookup
  - preflight checks
  - request validation and history shaping
  - persisted running-run creation
  - runtime activation behind a bounded executor interface

Still missing before this slice:

- real adapter-backed execution behind the executor interface
- live output persistence during execution
- terminal completion and failure persistence owned by Go execution
- real approval request production from an adapter-backed runtime
- Claude Code and OpenCode execution
- `respondExternalAgentQuestion`

## Why This Slice Exists

The broader "real adapter execution" step is too large to land safely as a
single all-adapter change. Codex app-server is the highest-leverage first
adapter because:

- the current send path already carries Codex-specific reasoning and
  sandbox/approval shaping
- Codex is app-server based, so the process and JSONL ownership boundary is
  explicit
- getting one real executor live proves the runtime/service split without
  locking the design into Python-shaped adapter plumbing

## Scope

This slice should deliver:

- a real Codex app-server executor behind `internal/externalagents.Executor`
- Go-owned process launch, JSONL request/response handling, and turn lifecycle
- active-run control that supports:
  - cancellation
  - approval response dispatch
- runtime-owned live chat updates from Codex assistant output and approval
  prompts
- persisted output snapshots while the run is active
- persisted terminal completion and failure state for Codex-backed runs
- app wiring so external-agent `/getLLMResponse` starts real Codex runs in IDE
  mode when a Codex external-agent config is selected

## Non-Goals

- Claude Code execution
- OpenCode execution
- external-agent MCP tool parity
- full Python parser parity for every Codex item type
- websocket fanout parity for external-agent streaming
- `respondExternalAgentQuestion`
- managed `setta_llm`

## Inputs

- `docs/plans/go-backend-rewrite/phase-12-external-agent-send-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-external-agent-active-runtime-stop-approval-and-send.md`
- `docs/reference/external-agents.md`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_adapters/base.py`
- `backend/setta/agentic/external_adapters/codex_app_server.py`
- `backend/setta/agentic/external_adapters/prompt_utils.py`
- `backend/setta/agentic/external_agent_settings.py`
- `tests/agentic/test_codex_app_server_adapter.py`
- `tests/agentic/test_codex_app_server_adapter_integration.py`
- `tests/agentic/test_external_agent_runner.py`
- `internal/externalagents/runtime.go`
- `internal/externalagents/send.go`
- `internal/httpapi/ai_routes.go`
- `internal/app/app.go`

## Recommended Design

1. Keep adapter execution behind the existing executor boundary.
   - Do not move process ownership into the HTTP route or send service.

2. Add a Codex-specific executor implementation inside
   `internal/externalagents`.
   - It should own:
     - process launch
     - initialize / initialized handshake
     - thread start or resume
     - turn start
     - stdout/stderr reading
     - approval-response writes
     - cancellation

3. Keep runtime ownership explicit.
   - The executor should update persisted runs and live chat through the
     runtime/store boundary, not through hidden globals.

4. Prefer a bounded Codex parser.
   - Land the event handling required for this slice:
     - assistant text deltas/finalization
     - approval requests
     - terminal turn completion/failure
     - thread id capture
   - Defer broader item-type parity until MCP and question flows are brought
     over.

5. Keep Codex runtime config explicit and local to this slice.
   - Write a runtime `CODEX_HOME` under
     `setta_files/external_agent_settings/codex/<config-id>/sessions/<chat-id>/`
   - Carry forward:
     - developer instructions/system prompt
     - approval policy
     - sandbox policy
     - trusted project cwd
   - Do not broaden into full Claude/OpenCode settings ownership here.

## Landing Order

1. Add this focused plan doc.
2. Land Codex executor/process ownership plus focused unit tests.
3. Wire runtime live-state and terminal persistence around the executor.
4. Wire app construction to use the real executor.
5. Update the Phase 12 docs with completed work and the remaining adapter gaps.

## Verification Targets

- `./scripts/go.sh test ./internal/externalagents ./internal/httpapi`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Expected Remaining Gap After This Slice

After this Codex-first landing, the remaining Phase 12 work should be:

- Claude Code executor implementation
- OpenCode executor implementation
- external question-production and `respondExternalAgentQuestion`
- broader Codex item-type parity for MCP/tool-result rich flows
- websocket/event fanout closeout for external-agent active runs
