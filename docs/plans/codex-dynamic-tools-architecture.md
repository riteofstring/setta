# Codex Dynamic Tools Architecture

This branch targets the smallest useful no-setup agent-control experience:
Setta-hosted Codex should be able to call Setta capabilities directly from the
chat workflow.

## Decision Summary

| Area | Decision |
| --- | --- |
| Initial harness | Support Codex app-server only. |
| Core integration | Use Codex `thread/start.dynamicTools` and handle `item/tool/call`. |
| CLI | Do not build a CLI for the core Codex integration. Keep CLI as a possible future fallback/debug surface. |
| Skills | Do not require `SKILL.md` for the core Codex integration. Use skills later only for reusable workflow guidance. |
| MCP | Do not require MCP for the Setta-hosted Codex path. Use MCP later only when a harness needs it. |
| Large tool surface | Use a small visible tool set and mark long-tail tools with `deferLoading`. |
| Future harnesses | Design the Setta capability shape so Claude/OpenHands/OpenCode adapters can be extracted later, but do not build them now. |

## Product Goal

The user should be able to open Setta chat and ask Codex to inspect or control
Setta without installing skills, configuring MCP, or putting a CLI on PATH.

The runtime shape is:

```text
Setta renderer
  -> Setta Go backend/session orchestrator
      -> Codex app-server
          -> thread/start(dynamicTools=[...])
          -> turn/start(user message)
          -> item/tool/call
              -> Setta tool handler
              -> Codex dynamic tool response
```

This only applies when Setta owns the Codex app-server session. If a user opens
Codex independently in a terminal, Setta cannot inject `dynamicTools` into that
session. That separate scenario can be handled later with MCP, skills, or a CLI
fallback.

## Current Branch Baseline

The `setta-3` base already has useful pieces:

- Codex app-server integration for chat turns.
- `experimentalApi` enabled during Codex initialization.
- `item/tool/call` registered as a supported server request.
- `internal/chat/agent_tools.go`, which defines an `AgentToolRegistry`,
  schema metadata, permission metadata, audit metadata, and handlers.
- `internal/chat/codex_harness_requests.go`, which dispatches
  `item/tool/call` to the registered tool handler and records a dynamic-tool
  run item.

The missing Codex-first work is:

- advertise registered Setta tools on `thread/start` as `dynamicTools`;
- define the first useful Setta tool set;
- decide visible vs deferred exposure for each tool;
- test the complete chat path through the production app workflow.

## Near-Term Scope

Implement only what is needed for Setta-hosted Codex:

1. Convert registered Setta agent tools into Codex `dynamicTools`.
2. Include those specs when starting a new Codex thread.
3. Keep resumed-thread behavior explicit. If Codex requires dynamic tools again
   on resume or settings update, implement the documented app-server path rather
   than relying on silent assumptions.
4. Route Codex dynamic tool calls through the existing `AgentToolRegistry`.
5. Add focused deterministic E2E coverage through Electron/main/preload/
   renderer/HTTP/store paths.

Do not implement generic Claude, OpenHands, OpenCode, MCP, skills, or CLI
infrastructure in this branch.

## Capability Shape

Setta should own a small app capability description independent of Codex's wire
format. The existing `AgentTool` shape is the right local starting point:

```text
AgentTool
  name
  namespace
  input schema
  output schema
  permission requirements
  audit metadata
  handler
```

For Codex, map each registered tool to:

```text
DynamicToolSpec
  namespace: "setta"
  name
  description
  inputSchema
  deferLoading
```

Keep the namespace stable as `setta`. Tool names should be short,
task-oriented, and compatible with Codex dynamic tool validation. Prefer names
like `workspace_context`, `conversation_list`, or `conversation_open` over raw
HTTP endpoint names.

## Tool Exposure

Do not expose the whole backend API as always-visible tools.

Use three categories:

| Category | Exposure | Guidance |
| --- | --- | --- |
| Current context | Visible | Small, safe, frequently useful read tools. |
| Common actions | Visible only if few and clear | Operations Codex should naturally reach for in most Setta chats. |
| Long-tail actions | Deferred | Tools that are specific, uncommon, mutating, or schema-heavy. |

Deferred tools use `deferLoading: true`. Codex keeps them registered, excludes
them from the ordinary model-facing tool list, and can surface them through
`tool_search` when available.

Descriptions matter because deferred tools are searched by name, namespace,
description, and schema terms. Tool descriptions should be precise and include
the domain words a user or agent is likely to use.

## What Not To Build Now

Avoid these in the Codex-first branch:

- A Setta CLI as the primary agent API.
- A Setta skill as a required setup step.
- An MCP server as the primary Codex integration path.
- A generic cross-harness abstraction layer.
- A raw `invoke_any_backend_endpoint` tool.
- A large always-visible tool catalog.
- Heuristic routing from user text to backend calls.

The implementation should be direct and typed. Codex should call named tools
with JSON-schema-validated inputs, and Setta should fail loudly when a tool is
unknown, unavailable, or malformed.

## Future Harness Path

The long-term architecture is still a capability layer with harness adapters,
but only Codex should be built now:

```text
Setta capability registry
  -> Codex adapter: dynamicTools
  -> Claude adapter later: Agent SDK tools / in-process MCP
  -> OpenHands adapter later: SDK ToolDefinitions
  -> OpenCode adapter later: plugin/custom-tool or MCP bridge
  -> CLI fallback later: setta --json style commands
```

When another harness becomes real product work, refactor from the working Codex
implementation. Do not pre-build adapters without a tested harness target.

## Verification Requirements

Because this work touches Codex harness behavior, provider protocol handling,
event streaming, dynamic tool calls, and chat workflows, deterministic E2E app
workflow coverage is required.

The focused test should prove:

- Setta opens a temporary workspace.
- The user creates or opens a chat.
- Setta starts a Codex thread with dynamic tool specs.
- A scripted Codex/app-server harness calls a registered `setta` dynamic tool.
- Setta dispatches to the handler and records the dynamic-tool run item.
- The dynamic tool response is returned to Codex.
- The assistant output streams/completes normally.
- Unsupported tools fail loudly and surface a useful run item/error.

If live Codex E2E tests are relevant and `OPENAI_API_KEY` is present in `.env`,
run them. If the key is absent, report that live-provider tests were skipped;
do not treat the skip as proof of provider integration.

## Implementation Notes

- Preserve generated-contract ownership rules. If protocol schema or
  generator-owned inputs change, regenerate outputs instead of editing generated
  files manually.
- Keep dynamic tool specs generated from registered Setta tools, not duplicated
  in a separate hardcoded list.
- Keep approval and audit metadata attached to the tool definition. The run
  transcript should show what tool ran, what arguments were used, whether it
  succeeded, and what result Codex received.
- Prefer read-only tools for the first slice. Add mutating tools only when their
  permission and approval behavior is explicit.
- Treat Codex `dynamicTools` as experimental app-server API. The adapter should
  be narrow enough to update if the upstream protocol changes.
