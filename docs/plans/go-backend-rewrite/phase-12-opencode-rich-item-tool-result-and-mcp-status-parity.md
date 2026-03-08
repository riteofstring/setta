# Phase 12 OpenCode Rich Item, Tool-Result, And MCP Status Parity

## Purpose

This doc narrows the next remaining Phase 12 parity work into one bounded
OpenCode-first slice over the completed Go-owned runtime and executor
boundary.

The goal of this slice is to close the highest-leverage OpenCode runtime gaps
without broadening into Claude in the same landing:

- richer OpenCode tool-result persistence from typed tool-part updates
- richer OpenCode terminal payload handling for same-payload assistant text plus
  tool-result output
- Go-owned external MCP runtime-status seeding and snapshot persistence for
  OpenCode-backed runs

OpenCode is the right next slice because the runtime already owns live question
state there, so the remaining user-visible gap is mostly richer item and status
preservation rather than another interaction shape.

## Current Status

Completed before this slice:

- Go-owned external-agent config lookup and bounded preflight
- Go-owned external-agent send, hydrate, stop, approval, and question
  transport
- Go-owned active runtime with live overlays and persisted run ownership
- real Codex, OpenCode, and Claude executors behind the shared Go runtime
- Codex-first rich item, tool-result, and external MCP status parity in
  `phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`

Completed in this slice:

- `internal/externalagents/opencode_rich_items.go` plus
  `internal/externalagents/opencode_executor.go`
  - richer OpenCode tool-result persistence from completed/error tool parts
  - richer generic OpenCode payload handling for same-payload assistant text,
    tool-call metadata, and tool-result output
  - persisted `tool_result` run events for OpenCode-rich outputs
- `internal/externalagents/external_mcp_status.go`
  - OpenCode config-backed unknown status seeding from generated
    `OPENCODE_CONFIG`
  - fetched server-mode `/mcp` payload normalization over the shared external
    runtime-status helpers
- `internal/externalagents/opencode_executor.go`
  - OpenCode external MCP status seeding after runtime activation
  - persisted snapshot closeout on completion/failure over the shared runtime
    path
- focused tests in:
  - `internal/externalagents/opencode_executor_test.go`
  - `internal/externalagents/runtime_test.go`

Still missing after this slice:

- Claude rich item/tool-result parity over the same runtime helpers
- Claude external MCP status parity over the same runtime helpers
- any still-missing Codex non-`response_item` rich items that prove user-facing

## Scope

This slice should deliver:

- richer OpenCode tool-part handling in `internal/externalagents`
  - persist completed/error tool-part outputs as tool-result messages
  - persist corresponding `tool_result` run events
  - keep question tool parts routed through the existing Go question runtime
- richer OpenCode terminal payload handling
  - preserve assistant text when the sidecar emits text and tool-result fields
    in the same payload
  - normalize tool naming the same way the Python adapter does for Setta/MCP
    tools
- Go-owned OpenCode external MCP runtime-status seeding
  - seed unknown rows from the generated `OPENCODE_CONFIG` when running in SDK
    mode
  - include the Setta MCP server as an unknown SSE row for SDK runs when it is
    configured through the generated config path
  - seed from fetched `/mcp` payloads for server-mode runs when available
  - snapshot statuses into run outputs on completion/failure/cancellation
- focused tests covering:
  - OpenCode completed tool-part -> tool-result persistence
  - same-payload assistant text + tool-result persistence
  - OpenCode MCP status seeding and persisted snapshot readback

## Non-Goals

- Claude rich item/tool-result parity in the same landing
- broader Claude/OpenCode auth/header ownership work
- a redesign of the shared runtime or transport boundary
- moving the OpenCode sidecar or changing its transport protocol
- attachment or allowed-tool parity work outside the bounded item/status gap

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`
- `docs/reference/external-agents.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_adapters/opencode_sdk.py`
- `tests/agentic/test_external_agent_runner.py`
- `tests/agentic/test_opencode_sdk_event_parser.py`
- `internal/externalagents/opencode_executor.go`
- `internal/externalagents/external_mcp_status.go`
- `internal/externalagents/runtime.go`
- `internal/httpapi/mcp_routes.go`

## Recommended Design

1. Keep OpenCode execution ownership in the existing executor.
   - Do not move richer item parsing into routes or send-service code.

2. Reuse the landed runtime helpers instead of inventing OpenCode-only storage.
   - Use `appendToolResultMessage(...)` and the existing MCP snapshot helpers.
   - Persist richer OpenCode outputs into canonical run `messages` and run
     events immediately.

3. Split OpenCode parsing into explicit helpers instead of one large switch.
   - Keep typed helpers for:
     - tool-part state handling
     - same-payload text + tool-result handling
     - OpenCode MCP status seeding from config and fetched payloads

4. Mirror the current Python behavior where it is the product source of truth.
   - Use the Python OpenCode parser and runner behavior as the reference for:
     - when a tool-part becomes a tool-result message
     - how same-payload text/tool-result output avoids dropping assistant text
     - how SDK/server-mode MCP status rows are seeded and persisted

5. Keep Claude explicitly deferred again.
   - This slice should prove the helper reuse pattern for a second adapter
     before broadening into the remaining Claude follow-on.

## Landing Outcome

1. Landed richer OpenCode tool-result persistence for completed tool parts and
   same-payload assistant text plus tool-result output.
2. Reused the shared runtime snapshot helpers for OpenCode config-backed and
   server-mode external MCP status ownership.
3. Added focused OpenCode executor tests for tool-part persistence,
   same-payload persistence, and persisted MCP runtime-status readback.
4. Narrowed the remaining Phase 12 gap to the Claude follow-on plus any small
   residual Codex rich-item gaps.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'OpenCode|Runtime'`
- `./scripts/go.sh test ./internal/httpapi -run 'MCPRuntimeStatus|ExternalAgent'`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- keep OpenCode richer item handling inside the existing Go executor/parser
  boundary instead of broadening the send service or routes
- reuse the shared external MCP status helpers instead of adding another
  OpenCode-only runtime store
- seed OpenCode MCP statuses from generated config for every run mode and merge
  fetched server-mode payloads above that source of truth
- keep Claude explicitly deferred until the OpenCode helper pattern is proven

## Open Questions

- whether OpenCode raw MCP payload capture during active streaming is needed
  after the landed startup/config seeding
  - recommendation: still no, unless a concrete user-facing runtime-status gap
    appears that startup/config seeding cannot cover

## Next Recommended Step

- after the now-landed Claude follow-on, inventory whether only residual
  Codex non-`response_item` rich-item cleanup remains before calling Phase 12
  effectively complete for the external-agent surface
