# Phase 12 OpenCode Executor And Question Runtime

## Purpose

This doc narrows the next Phase 12 implementation slice to the OpenCode-backed
external-agent path that still remains Python-owned after the completed Codex
executor landing.

The goal of this slice is to make the Go external-agent runtime own the first
non-Codex adapter that has a real live question flow:

- launch the OpenCode SDK sidecar from Go
- own same-chat `sessionId` continuity in Go
- own approval and question response dispatch through the active Go runtime
- persist live assistant/tool/question state while the run is active
- expose `respondExternalAgentQuestion` through thin Go transport

This slice is intentionally OpenCode-first instead of Claude-first because it
already has an explicit process boundary and question-production path that can
be brought under the current Go runtime without inventing a Claude SDK bridge
in the same change.

## Current Status

Completed before this slice:

- Go-owned external-agent chat hydration over persisted runs
- Go-owned active runtime for:
  - live overlays
  - stop ownership
  - approval registration and response dispatch
- Go-owned external-agent send-path validation and persisted running-run
  creation
- real Codex app-server execution behind the bounded executor interface

Blocking dependency surfaced during repo inspection:

- `internal/externalagentconfigs.Store` currently drops
  `settingsManagedBlock`, so the Go runtime cannot yet read the managed
  OpenCode permission/model config that exists in `setta_files/external_agents.json`

Still missing after the Codex slice:

- OpenCode executor implementation
- Go-owned pending-question registry and response dispatch
- `/respondExternalAgentQuestion`
- OpenCode same-chat `sessionId` continuity
- bounded OpenCode settings-file generation in Go
- Claude Code execution

## Why This Slice Exists

The remaining Phase 12 gap is still too large to land safely as an
"all remaining adapters plus questions" change.

OpenCode is the highest-leverage next adapter because:

- it uses an explicit local process bridge instead of an in-process Python SDK
- it is the first remaining adapter with a real question-response workflow
- the frontend already depends on `respondExternalAgentQuestion`, so this slice
  closes a user-visible active-runtime gap instead of just adding another
  executor stub

Claude remains follow-on work because the current repo does not yet have a
bounded Go-native or bridge-owned Claude SDK edge comparable to the OpenCode
sidecar boundary.

## Scope

This slice should deliver:

- typed Go read access to the OpenCode-managed subset of
  `settingsManagedBlock`
- a bounded OpenCode settings writer that can produce runtime
  `opencode.json` files under:
  - `setta_files/external_agent_settings/opencode/<config-id>/opencode.json`
  - `setta_files/external_agent_settings/opencode/<config-id>/sessions/<chat-id>/opencode.json`
- a real OpenCode executor behind `internal/externalagents.Executor`
- Go-owned `sessionId` persistence and same-chat continuation seeding for
  OpenCode-backed runs
- runtime-owned pending-question registration and response dispatch
- thin Go `/respondExternalAgentQuestion` transport
- focused tests covering the new runtime and executor behavior

The runtime owner should continue to be the source of truth for:

- active run handles
- live chat overlays
- persisted tool/question result materialization
- approval/question cleanup

## Non-Goals

- Claude Code execution
- full Claude/OpenCode config-management parity
- Go-owned external-agent MCP auth/header injection
- attachment parity for all external-agent adapters
- broader OpenCode MCP/tool-result parity beyond the bounded question and
  approval flows required for this slice
- managed `setta_llm`

## Inputs

- `docs/plans/go-backend-rewrite/phase-12-codex-app-server-executor-runtime.md`
- `docs/plans/go-backend-rewrite/phase-12-external-agent-active-runtime-stop-approval-and-send.md`
- `docs/reference/external-agents.md`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_agent_settings.py`
- `backend/setta/agentic/node_runtime.py`
- `backend/setta/agentic/external_adapters/opencode_sdk.py`
- `backend/setta/agentic/external_adapters/sidecars/opencode_sdk_runner.mjs`
- `tests/agentic/test_external_agent_runner.py`
- `tests/agentic/test_opencode_sdk_adapter_integration.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Chat/QuestionCard.tsx`
- `internal/externalagentconfigs/store.go`
- `internal/externalagents/runtime.go`
- `internal/externalagents/send.go`
- `internal/httpapi/ai_routes.go`
- `internal/app/app.go`

## Recommended Design

1. Keep OpenCode execution behind the existing bounded executor interface.
   - Do not move sidecar process ownership into HTTP handlers or the send
     service.

2. Extend the Go config model only as far as this slice needs.
   - Preserve the OpenCode-managed subset of `settingsManagedBlock` in typed Go
     form.
   - Do not broaden into full Claude settings ownership here.

3. Add an explicit pending-question registry beside approvals in
   `internal/externalagents.Runtime`.
   - Key question state by `toolCallId`.
   - Persist question responses into the live chat and run outputs the same way
     approval responses already persist tool-result messages.

4. Keep the OpenCode adapter bridge local to the adapter edge.
   - Reuse the checked-in Node sidecar for SDK transport.
   - Keep run ownership, persistence, and route behavior in Go.

5. Seed `sessionId` from the latest same-chat external run for OpenCode.
   - Do not keep OpenCode chat continuity as an implicit Python-only behavior.

## Landing Order

1. Add this focused plan doc.
2. Extend external-agent config parsing for the OpenCode-managed settings block.
3. Add runtime question registration and `respondExternalAgentQuestion`.
4. Land the OpenCode executor and runtime config writer.
5. Seed OpenCode `sessionId` continuity in the send path.
6. Update the Phase 12 docs with completed work and the remaining Claude gap.

## Verification Targets

- `./scripts/go.sh test ./internal/externalagentconfigs ./internal/externalagents ./internal/httpapi`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Open Questions

- whether the OpenCode runtime config should already write Setta MCP auth and
  agentic headers in this slice
  - recommendation: no, not until the Go external-agent runtime owns the
    required auth/header minting path; keep this slice bounded to execution,
    approvals, questions, and session continuity
- whether the OpenCode sidecar should move out of the Python tree in this same
  landing
  - recommendation: no, keep the adapter bridge reuse explicit in this slice
    and defer path relocation until the adapter surface is proven in Go

## Expected Remaining Gap After This Slice

After this OpenCode landing, the remaining Phase 12 work should be:

- Claude Code execution
- broader OpenCode and Codex MCP/tool-result parity
- any deferred external-agent auth/header config work needed for MCP parity
- any remaining websocket/event fanout closeout for active external-agent runs
