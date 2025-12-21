# MCP External Servers Plan

Goal: let the LLM chat manager access MCP tools from user-configured servers
in addition to the built-in Setta MCP server. Use namespacing to avoid tool
name collisions and support both SSE and stdio transports.

## Current State
- The chat manager uses `MultiMCPClient` seeded from `llm_config.json` and
  routes tool calls via namespaced tool names.
- `search_and_unlock_mcp_tools` is still served by Setta and only searches
  Setta-registered tools (aggregated search still pending).
- External tool annotations are normalized with default `SettaToolAnnotations`
  (discoverable type, empty tags/category, no follow/preview metadata).

## Proposed Config (setta_files/llm_config.json)

Add a top-level `mcp_servers` map keyed by server id.

Example:
```
{
  "configs": {
    "claude-sonnet": {
      "api_key_env": "ANTHROPIC_API_KEY",
      "model": "claude-sonnet-4-5-20250929",
      "provider": "anthropic"
    }
  },
  "default_config_id": "claude-sonnet",
  "mcp_servers": {
    "setta": {
      "label": "Setta MCP",
      "transport": "sse",
      "url": "http://127.0.0.1:8000/mcp",
      "headers": {}
    },
    "context7": {
      "label": "Context7",
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@upstash/context7-mcp",
        "--api-key",
        "${CONTEXT7_API_KEY}"
      ],
      "env": {},
      "cwd": null
    }
  }
}
```

Notes:
- Avoid embedding API keys directly; reference `.env` values with `${VAR}` or
  `api_key_env` style fields.
- All tools are accessed via namespaced names (including Setta), using the
  server id as the prefix (for example `setta.read_file_range`).

## Data Model Changes
- Add `MCPServerConfig` and `MCPServersConfig` models in
  `backend/setta/types/llm_config.py`.
- Extend `AllLLMConfigs` with `mcp_servers: dict[str, MCPServerConfig]`.
- Ensure `merge_chat_llm_configs` preserves `mcp_servers` as-is.
- Update `setta_files/llm_config.example.json` to include a `setta` entry and
  a commented context7 example if desired.

## Multi-Server MCP Client

Add a new client that manages multiple MCP connections:
- `MultiMCPClient` owns one `MCPServerClient` per server id.
- Each server client handles either:
  - SSE: use `mcp.client.sse.sse_client(url, headers=...)`.
  - stdio: spawn a subprocess and connect to it using MCP stdio transport
    (either `mcp.client.stdio` if available, or a small wrapper around
    `asyncio.create_subprocess_exec` with stdin/stdout pipes).
- Each server client caches tool definitions and annotations when connected.
- Expose a merged view:
  - `init_tool_definitions`, `discoverable_tool_definitions` are keyed by
    namespaced tool name: `<server_id>.<tool_name>`.
  - `tool_annotations_by_name` is also keyed by namespaced name. For tools
    without `SettaToolAnnotations`, default to:
    - `settaToolType = discoverable`
    - empty `searchTags`, `searchCategory = None`
    - no follow/preview metadata
- Provide a `call_tool(namespaced_name, args)` that routes to the correct
  server client after splitting the namespace.

## Tool Search and Unlocking

Move aggregated search into the chat manager:
- Build a BM25 index over the merged tool list (names + descriptions + tags).
- `search_and_unlock_mcp_tools` should be handled directly in
  `LLMChatManager` and not delegated to Setta's MCP server, so external tools
  are discoverable.
- The tool response should include namespaced tool names and the originating
  server id in the description if useful.
- Keep Setta's server-side `search_and_unlock_mcp_tools` for backward use by
  external clients, but the chat manager should use the aggregated path.

## Chat Manager Updates
- Seed `ChatToolState` with namespaced init tools from `MultiMCPClient`.
- Update tool call parsing and routing to accept namespaced tool names.
- Keep follow and preview logic intact when annotations exist (Setta tools);
  skip those behaviors for external tools.
- Update system prompt to mention namespacing and that tools may live under
  multiple servers.

## Config Reloading
- Extend `LLMConfigWatcher` to update MCP server config on reload.
- Update `DotEnvWatcher` or a helper to re-resolve `${ENV_VAR}` placeholders
  in headers/args/env and restart affected stdio processes as needed.
- Ensure changing `mcp_servers` triggers reconnects and tool cache refreshes.

## Security and Secrets
- Do not persist API keys in `llm_config.json`.
- Use `${ENV_VAR}` substitution for:
  - SSE headers (for example `Authorization: Bearer ${CTX7_TOKEN}`)
  - stdio args and env values.
- Consider masking secrets in logs.

## Scope and Phasing
1) Add data models + config parsing + example file updates. (done)
2) Implement `MultiMCPClient` with SSE support (namespaced tool caches). (done)
3) Add stdio transport support. (done)
4) Integrate into `LLMChatManager` and replace the single client. (done)
5) Add aggregated search/unlock and update the system prompt.
6) Document usage in `docs/mcp-system-overview.md`.

## Testing and Verification
- Manual:
  - Start backend, confirm Setta tools are namespaced and callable.
  - Configure a stdio MCP server (context7) and verify:
    - tools appear in search results,
    - `search_and_unlock_mcp_tools` unlocks namespaced tools,
    - tool calls route to the external server.
- Automated:
  - Unit tests for namespace parsing, merged tool cache, and config parsing.
  - If we add a test harness for stdio, use a small echo MCP server fixture.

## Open Questions
- Should we allow per-server enable/disable flags?
- How should the UI expose and edit `mcp_servers` (future work)?
