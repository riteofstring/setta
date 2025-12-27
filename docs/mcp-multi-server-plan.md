# Multi-MCP Tool Access Plan

## Goal
Allow LLMChatManager to expose tools from multiple MCP servers defined in `llm_config.json`, with global defaults and per-LLM overrides, and always namespaced tool names.

## Decisions
- Global MCP server registry with per-LLM overrides.
- Always namespace tool names (no unprefixed legacy names).
- No backward compatibility: existing `llm_config.json` must be updated.

## MCP Python SDK Notes (latest)
- Clients use `ClientSession` with transports such as `streamablehttp_client`, `sse_client`, or `stdio_client`.
- Each session must `await session.initialize()` before `list_tools()` or `call_tool()`.
- Tool discovery and execution are done through `list_tools()` and `call_tool()` on the session.

## Proposed Config Shape
Add global MCP server configuration plus per-LLM selection:

```json
{
  "configs": {
    "claude-sonnet": {
      "model": "claude-sonnet-4-5-20250929",
      "provider": "anthropic",
      "api_key_env": "ANTHROPIC_API_KEY",
      "mcpServerIds": ["setta", "github"]
    }
  },
  "mcpServers": {
    "setta": {
      "transport": "sse",
      "url": "http://localhost:8000/mcp"
    },
    "github": {
      "transport": "streamable_http",
      "url": "http://localhost:9000/mcp"
    }
  },
  "defaultMcpServerIds": ["setta"],
  "default_config_id": "claude-sonnet"
}
```

Rules:
- If `LLMConfig.mcpServerIds` is `null`, fall back to `defaultMcpServerIds`.
- If `LLMConfig.mcpServerIds` is an empty list, the LLM gets no MCP tools.
- Always namespace tool names as `<serverId>__<toolName>`.

## Architecture

### 1) MultiMCPClient
Replace `MCPClient` with a multi-server client that:
- Maintains a `ClientSession` per server using MCP SDK transports.
- Calls `initialize()` and `list_tools()` for each session.
- Builds a namespaced tool registry:
  - `tool_definitions`: `{namespaced_name: ChatCompletionToolParam}`
  - `tool_metadata`: `{namespaced_name: ToolAnnotations | None}`
  - `routing`: `{namespaced_name: (server_id, tool_name)}`
- Accepts tools with missing annotations (treat as discoverable by default).
- Provides `call_tool(namespaced_name, args)` that routes to the correct session.

### 2) Tool Namespacing
- Format: `<serverId>__<toolName>`.
- All tool presentation and tool calls in LLM payload use namespaced names.
- LLM prompt should reference namespaced tools and explain the prefix.

### 3) Search/Unlock Flow
Introduce a local search/unlock tool (virtual tool):
- Add a local `search_and_unlock_mcp_tools` definition to the tool list.
- Execute it inside `LLMChatManager` (no MCP roundtrip).
- Search index should include all discoverable tools from the selected servers.
- Return namespaced tool names so unlock works consistently.

### 4) LLMChatManager Integration
- Resolve the selected server IDs for the chat's `LLMConfig`.
- Filter tool definitions to those servers (plus the local search tool).
- Update pre-unlock logic to use the aggregated discoverable tool map.
- Route tool calls through MultiMCPClient using namespaced names.

### 5) System Prompt Updates
Update `backend/setta/mcp/system_prompt.md` to:
- Explain namespacing (server prefix).
- Keep the rule to use `search_and_unlock_mcp_tools` when unsure.

## Implementation Steps
1) **Types + Config**
   - Add `MCPServerConfig` and fields in `AllLLMConfigs` and `LLMConfig`.
   - Update example config in `backend/setta/llm/example_config.py`.
   - Regenerate frontend types: `source activate.sh && cd frontend && pnpm generate`.

2) **MultiMCPClient**
   - Implement session lifecycle with `AsyncExitStack` per server.
   - Connect and cache tools for all configured servers.
   - Add namespaced tool definition mapping and routing logic.

3) **LLMChatManager + ToolPreunlocker**
   - Select server IDs per LLM config (default or override).
   - Build tool lists from the aggregated registry.
   - Update pre-unlock scoring to handle namespaced tool names.

4) **Local Search/Unlock Tool**
   - Add a virtual tool definition and a handler in `LLMChatManager`.
   - Build a local search index from aggregated tool metadata.

5) **Prompt and Docs**
   - Update `system_prompt.md` and any MCP overview docs to reflect namespacing.

6) **Tests**
   - Add unit tests for namespaced routing, server selection precedence, and search results.

## Risks
- Tool name collisions are resolved by namespacing; ensure all call sites use the namespaced form.
- Config changes are breaking; existing configs must be updated as part of rollout.

