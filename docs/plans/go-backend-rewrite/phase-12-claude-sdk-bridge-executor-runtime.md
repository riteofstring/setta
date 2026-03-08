# Phase 12 Claude SDK Bridge Executor Runtime

## Purpose

This doc narrows the next Phase 12 implementation slice to the remaining
Claude Code execution gap after the completed Codex and OpenCode executor
landings.

The goal of this slice is to make the Go external-agent runtime own Claude Code
execution without pretending there is already a stable Go-native Claude SDK
edge in this repo.

That means this slice should deliver:

- a real Claude-backed executor behind the existing Go runtime boundary
- same-chat Claude `sessionId` continuity in Go
- Go-owned approval and question response dispatch for Claude-backed runs
- bounded Claude settings-file generation in Go
- focused tests proving the executor/runtime split

The recommended adapter edge for this slice is a small Python sidecar that uses
the official `claude-agent-sdk`. Product semantics stay in Go; the sidecar only
owns the Claude SDK transport edge.

## Current Status

Completed before this slice:

- Go-owned external-agent chat hydration over persisted runs
- Go-owned active runtime for:
  - live overlays
  - stop ownership
  - approval registration and response dispatch
  - question registration and response dispatch
- Go-owned external-agent send-path validation and persisted running-run
  creation
- real Codex app-server execution behind the bounded executor interface
- real OpenCode sidecar execution behind the bounded executor interface
- thin Go transport for:
  - `/getLLMResponse` (external-agent branch only)
  - `/getExternalAgentChat`
  - `/stopExternalAgentRun`
  - `/respondExternalAgentApproval`
  - `/respondExternalAgentQuestion`

Remaining Phase 12 execution gap:

- Claude Code execution
- deferred Codex/OpenCode MCP-rich item parity and any remaining event-fanout
  closeout

## Why This Slice Exists

Claude is the last missing external-agent executor.

Unlike Codex and OpenCode, the current product path is not an already-bounded
JSONL app-server or Node sidecar. The stable official edge in the current repo
is the Python `claude-agent-sdk`, which itself shells out to the Claude CLI.

That creates a concrete design choice:

- try to reverse-engineer an undocumented raw Claude CLI protocol in Go
- or keep Go runtime ownership while using a narrow Claude SDK bridge at the
  adapter edge

Recommendation: use the narrow SDK bridge. It is the most robust source of
truth available for this slice and keeps the custom runtime semantics in Go.

## Scope

This slice should deliver:

- a real Claude executor behind `internal/externalagents.Executor`
- a bounded Claude SDK sidecar bridge launched from Go
- Go-owned same-chat `sessionId` continuity for Claude-backed chats
- Go-owned approval and question dispatch for Claude-backed runs
- bounded Claude settings-file generation for:
  - `.claude/settings.local.json`
  - `.claude/settings.json`
- focused preflight coverage for the Claude bridge requirements:
  - Claude CLI resolution
  - Python SDK availability
- focused tests for:
  - Claude completion persistence
  - Claude approval flow
  - Claude question flow
  - Claude `sessionId` reuse

The runtime owner should remain the source of truth for:

- persisted run lifecycle
- live chat overlays
- approval/question cleanup
- terminal completion/failure persistence

## Non-Goals

- a Go-native Claude SDK implementation
- full Claude MCP auth/header parity
- full Claude allowed-tool/profile parity
- full Claude attachment parity
- Claude MCP status snapshot parity
- broader Codex/OpenCode MCP/tool-result parity
- managed `setta_llm`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-external-agent-active-runtime-stop-approval-and-send.md`
- `docs/reference/external-agents.md`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_agent_settings.py`
- `backend/setta/agentic/external_adapters/claude_sdk.py`
- `tests/agentic/test_claude_sdk_adapter.py`
- `tests/agentic/test_claude_sdk_adapter_integration.py`
- `tests/agentic/test_external_agent_runner.py`
- `internal/externalagentconfigs/preflight.go`
- `internal/externalagentconfigs/store.go`
- `internal/externalagents/runtime.go`
- `internal/externalagents/send.go`
- `internal/httpapi/ai_routes.go`
- `internal/app/app.go`

## Recommended Design

1. Keep Claude execution behind the existing bounded executor interface.
   - Do not move SDK or subprocess ownership into the HTTP route or send
     service.

2. Use a narrow sidecar bridge for the official SDK edge.
   - Launch a checked-in Python sidecar from Go.
   - The sidecar should use `claude-agent-sdk` and emit normalized JSONL events.
   - The Go executor should remain the owner of persistence and runtime state.

3. Keep Claude-specific settings writing bounded.
   - Write the managed `.claude/settings*.json` file when the config allows it.
   - Reuse `settingsSources` from the Go config model.
   - Do not broaden into full Claude MCP config ownership in this slice.

4. Preserve robust same-chat continuation.
   - Seed persisted Claude `sessionId` from the latest same-chat external run.
   - Persist terminal `sessionId` back into the run outputs.

5. Treat question responses as first-class runtime state.
   - Claude question flows should route through the existing Go question runtime.
   - If the SDK callback id differs from the UI-facing tool-call id, persist the
     callback id as the runtime `ResponseID`.

## Proposed Landing Order

1. Add this focused plan doc.
2. Extend preflight for the Claude bridge requirements.
3. Add bounded Claude settings writing plus same-chat `sessionId` seeding.
4. Land the Claude SDK sidecar and Go executor.
5. Add focused Claude executor tests.
6. Update the Phase 12 docs with completed work and the remaining parity gap.

## Verification Targets

- `./scripts/go.sh test ./internal/externalagentconfigs ./internal/externalagents ./internal/httpapi`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Open Questions

- whether Claude MCP auth/header config must land in the same slice
  - recommendation: no; keep this slice bounded to execution, settings-file
    ownership, approvals, questions, and `sessionId` continuity
- whether the Claude sidecar should import helper logic from the current Python
  adapter or stay self-contained
  - recommendation: keep the sidecar self-contained around the official SDK so
    Go depends on a narrow bridge, not the existing Python runtime shape

## Expected Remaining Gap After This Slice

After this Claude landing, the remaining Phase 12 work should be:

- deferred Codex/OpenCode/Claude MCP-rich parity work
- any still-missing external-agent auth/header config work needed for MCP parity
- any remaining websocket/event fanout closeout for active external-agent runs
