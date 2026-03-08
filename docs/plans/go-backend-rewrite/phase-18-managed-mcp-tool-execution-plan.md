# Phase 18 Managed MCP Tool Execution Plan

## Purpose

This doc narrows Slice 3 of Phase 18 to the first bounded managed MCP tool
execution landing behind the already-landed OpenAI executor.

## Current Status

Already landed before this slice:

- Go-owned managed chat send, hydrate, and stop transport
- Go-owned managed live chat runtime and websocket chunk emission
- bounded OpenAI text streaming execution for managed `setta_llm` runs

Landed in this slice:

- provider tool definitions filtered by resolved MCP server IDs and the
  profile tool allowlist
- managed OpenAI tool-call streaming and follow-up request looping
- robust scoped Setta-tool invocation through per-call MCP request metadata
  instead of shared-session context mutation
- transcript persistence/replay for assistant `tool_calls` and tool-result
  messages with `tool_call_id`

Remaining bounded follow-ons after this slice:

- tool-preview / AI-follow parity only if a current managed caller still
  depends on those surfaces
- broader provider-native `thinking=true` defaults only if the active managed
  product surface still needs them beyond explicit config and early rejection

## Repo Findings

- `internal/mcpx.Client` keeps long-lived shared sessions per server
- `set_agentic_context` is session-scoped on the Setta MCP server
- using `set_agentic_context` from concurrent managed runs would let one run
  overwrite another run's scoped tool context
- `internal/mcpx.Server` already resolves scoped tool context from per-request
  `Meta`, and the Go SDK transport already carries `Params.Meta`
- the managed executor already receives the run's project/chat/section context,
  resolved MCP server IDs, and the full agent profile

## Recommended Design

1. Extend the Go MCP client with explicit per-call `meta` support instead of
   mutating session-scoped context.
2. Build OpenAI tool definitions from the existing MCP client descriptor cache,
   filtered by:
   - resolved `MCPServerIDs`
   - normalized profile tool allowlist
   - explicit completion-report tool rules
3. Execute tool calls through the existing MCP client with explicit per-call
   scoped metadata for Setta tools.
4. Keep the landing bounded:
   - OpenAI chat-completions only
   - tool-call streaming and tool-result follow-up loops
   - no tool-argument preview deltas
   - no AI-follow tool-result updates
   - no new provider adapters

## Why This Boundary

- it avoids the shared-session race without introducing a second local-only
  tool transport
- it reuses the existing MCP transport and descriptor caches instead of adding
  provider-owned tool registries
- it keeps managed tool execution inside explicit runtime boundaries:
  `agentruns` owns run lifecycle, `managedllm` owns provider semantics, and
  `mcpx` owns tool transport

## Implementation Plan

1. Add `CallToolWithMeta` support to `internal/mcpx.Client` and the underlying
   SDK session wrapper.
2. Extend `internal/managedllm.Executor` to:
   - build bounded OpenAI tool definitions from the MCP descriptor cache
   - normalize the profile tool allowlist against resolved server IDs
   - parse streamed OpenAI tool-call deltas
   - execute tool calls sequentially through MCP
   - append tool-result messages and continue provider turns until the model
     returns a non-tool final assistant response
3. Extend transcript parsing so persisted managed chat history can round-trip:
   - assistant messages with `tool_calls`
   - tool-result messages with `tool_call_id`
4. Add focused tests for:
   - per-call MCP meta propagation
   - allowlist filtering
   - tool-call streaming and provider follow-up requests
   - real app managed chat execution through a Setta MCP tool

## Non-Goals

- Anthropic or non-OpenAI managed tool execution
- session-scoped MCP context mutation
- AI-follow tool-result parity
- tool-argument preview streaming parity
- managed `thinking=true` behavior changes

## Decisions Made

- keep scoped Setta tool context on the per-call MCP request `meta` path
  because the shared Go MCP client intentionally reuses long-lived sessions
- build provider-visible tool definitions from the MCP descriptor cache plus
  resolved `MCPServerIDs` instead of inventing a second tool registry
- keep the first managed tool landing bounded to OpenAI chat-completions and
  sequential tool execution until a broader product need appears

## Verification

- `./scripts/go.sh test ./internal/app ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/httpapi ./internal/managedchat -run 'Test(AppServesManaged(ChatSendThroughManagedExecutor|ChatToolCallThroughInternalMCPClient)|Executor|Client|RuntimeStopRun|RuntimeStartRun|ServiceRunSubAgent|RegisterAIRoutes|ServiceGetChatUsesConcreteLiveRuntimeOverlay)' -count=1`

## Progress Notes

- 2026-03-09: repo inspection confirmed that session-scoped
  `set_agentic_context` would race across concurrent managed runs because the
  Go MCP client reuses long-lived sessions per server.
- 2026-03-09: landed `CallToolWithMeta` in `internal/mcpx.Client` so managed
  Setta tool calls can carry scoped runtime metadata per request.
- 2026-03-09: landed bounded OpenAI tool-call streaming and follow-up looping
  in `internal/managedllm`, including persisted `tool_calls` and tool-result
  transcript support.
- 2026-03-09: landed real IDE app coverage proving a managed chat can execute
  the internal Setta completion-report tool through the shared MCP client.
- 2026-03-09: the adjacent managed reasoning follow-on then landed explicit
  preflight validation and route-level `thinking_unsupported` behavior so
  unsupported `thinking=true` sends no longer fail asynchronously after run
  start.

## Next Recommended Step

Use this slice as the new managed baseline:

- resolve managed `thinking=true` through explicit provider-native config or a
  bounded product decision if the active product surface still needs more than
  the landed explicit-config / early-reject behavior
- add tool-preview / AI-follow parity only if the active frontend surface
  still has a concrete dependency on it
- otherwise rerank the adjacent transcription-session runtime slice
