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

Completed in this slice:

- `internal/externalagentconfigs`
  - shared Claude bridge runtime resolution for the repo-pinned Python command
  - bounded Claude preflight for Claude CLI resolution plus
    `claude-agent-sdk` import availability
- `internal/externalagents/send.go`
  - same-chat Claude `sessionId` continuity seeded from the latest persisted
    external run for the chat
- `internal/externalagents/claude_executor.go`
  - real Claude SDK sidecar execution behind the existing bounded executor
    interface
  - bounded managed `.claude/settings.local.json` /
    `.claude/settings.json` generation in Go
  - live assistant/tool-call persistence, approval registration, queued
    question-approval pairing, and terminal completion/failure closeout
- `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`
  - narrow Python bridge around the official `claude-agent-sdk`
  - normalized JSONL stream and approval/tool-response protocol for the Go
    executor
- `internal/app/app.go`
  - IDE-mode multi-executor wiring with the real Claude executor installed

Remaining Phase 12 gap after this slice:

- deferred Codex/OpenCode/Claude MCP-rich item parity
- any remaining external-agent auth/header ownership needed for that parity
- any remaining active-run websocket/event-fanout closeout

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

## Landing Outcome

1. Added bounded Claude bridge runtime resolution and preflight.
2. Added bounded managed Claude settings writing plus same-chat `sessionId`
   seeding in the Go-owned send/executor path.
3. Landed the Claude SDK sidecar and real Go executor over the existing
   runtime boundary.
4. Added focused Claude executor tests for completion, approval flow, question
   flow, and `sessionId` closeout.
5. Updated the Phase 12 docs so the remaining gap is now explicitly the
   deferred MCP-rich parity work rather than another executor foundation.

## Verification

- `./scripts/go.sh test ./internal/externalagentconfigs ./internal/externalagents ./internal/httpapi`
- `./scripts/go.sh test ./internal/app -run '^$'`
- `source activate.sh && python -m py_compile backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`

## Decisions Made

- keep Claude execution behind the existing bounded executor interface instead
  of broadening the HTTP or send-service layers
- keep the Python sidecar self-contained around the official
  `claude-agent-sdk` instead of importing the broader existing Python runtime
- keep the Go runtime as the source of truth for approval/question ownership
  and use `QuestionState.ResponseID` for the Claude AskUserQuestion callback id
- keep Claude settings ownership bounded to managed `.claude/settings*.json`
  writing and defer Setta-specific MCP auth/header config to the parity slice

## Open Questions

- whether the deferred parity slice should start with Claude MCP auth/header
  ownership or with shared runtime item/tool-result closeout across all three
  adapters
  - recommendation: start with the shared runtime item/tool-result closeout and
    only pull in auth/header work when a concrete parity gap depends on it

## Next Recommended Step

- the richer Claude follow-on is now landed in
  `phase-12-claude-rich-item-tool-result-and-mcp-status-parity.md`; next,
  reassess whether only residual Codex rich-item cleanup remains in Phase 12
