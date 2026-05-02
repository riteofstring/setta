# Backward Compatibility Shim Removal Plan

## Context

This note records pre-existing backward-compatibility surfaces found while
reviewing the diff from `0249ccf86a55d2452efcaeb601d2f8e8e543f35e` to the
current branch. The current product direction does not require backward
compatibility, legacy support, transitional code, dual paths, or migrations, so
these should be removed in focused follow-up work.

## Removal Targets

### MCP Legacy SSE Transport Selection

- Owner: `internal/mcpx`
- Surface: `internal/mcpx/server_tool_registration.go`
- Current behavior: `newHTTPHandler` still creates both an SSE handler and a
  Streamable HTTP handler, then routes GET requests and `sessionid` query
  requests through `shouldUseLegacySSEHandler`.
- Removal direction: keep only the current Streamable HTTP transport at `/mcp`
  and delete the legacy SSE request classifier and tests that assert legacy SSE
  behavior.

### Legacy Codex Managed Config Repair

- Owner: `internal/app`, `internal/externalagentconfigs`
- Surface: `internal/app/app_ai_defaults_test.go` and
  `internal/externalagentconfigs/service_test.go`
- Current behavior: startup and external-agent config reconciliation still
  include tests for repairing a legacy Codex canonical config transport.
- Removal direction: delete the repair behavior and the repair tests. Current
  config should be created canonically, and stale legacy config should fail
  loudly or be ignored only if the owning config loader already has a
  fail-closed policy.

### ReactFlow-Compatible GPU Flow Class Surface

- Owner: `frontend/src/gpuFlow`
- Surface: `frontend/src/gpuFlow/reactFlowCompatibility.ts`
- Current behavior: GPU flow still exports ReactFlow class names/selectors so
  older project CSS, browser tests, and automation selectors keep working.
- Removal direction: replace call sites with Setta-owned GPU flow class names
  and selectors, then remove the ReactFlow compatibility constants and any tests
  that depend on those names.

### Chat History Compatibility Filtering

- Owner: `frontend/src/state/actions/chatHistory.ts` and project chat views
- Surface: `ChatHistoryCompatibility` and callers under project chat and chat
  section surfaces.
- Current behavior: hydration filters chat history through compatibility
  metadata so mixed-engine or ambiguous historical chats can remain visible or
  blocked with compatibility-specific states.
- Removal direction: rely on current authoritative run provenance only. Delete
  compatibility filters, compatibility-specific warning states, and historical
  compatibility integration tests.

## Notes

- Several legacy mentions in tests are reject-only guardrails rather than
  compatibility shims, for example removed-key rejection and old route absence
  tests. Keep those unless the rejected input class itself is no longer useful
  to test.
- Remove one owner surface at a time and run the owning package tests after each
  deletion.
