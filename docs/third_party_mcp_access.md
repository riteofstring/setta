# Third-Party MCP Access Plan

This note captures how to let other MCP-capable coding agents (Codex CLI, Claude Code, Cursor, etc.) use Setta's deterministic MCP tools while the backend is running locally.

## Current Architecture
- `SettaFastMCP` mounts an SSE transport at `/mcp` (`backend/setta/mcp/server.py`), exposing every tool registered through `@setta_init_tool`, `@setta_tool`, and `@project_state_tool`.
- `SettaFastAPIState` starts both the server and the in-process `MCPClient` when the backend boots (`backend/setta/server_state.py:182-213`), so tool metadata already exists and is queryable via `list_tools`.
- The chat manager simply streams those definitions to the configured LLM (`backend/setta/llm/llm_chat_manager.py:366-435`). No extra server work is needed to service additional MCP clients.

## Goal
Allow external LLM applications to call Setta's MCP tools without embedding Setta itself. We want the flow: start the Setta backend → point Codex/Claude Code at a lightweight proxy → ask them to edit files via Setta's tools.

## Bridge Strategy

| Concern | Plan |
| --- | --- |
| **Transport mismatch** | Codex/Claude spawn MCP servers that read/write JSON-RPC over stdio. Setta's server speaks MCP over HTTP/SSE. We need a thin stdio↔︎SSE adapter that runs alongside the backend. |
| **Session lifecycle** | The adapter opens `mcp.client.sse.sse_client()` to `http://127.0.0.1:8000/mcp` (or whatever `C.BACKEND` is). It forwards initialization, `list_tools`, `call_tool`, streaming responses, and notifications verbatim between the stdio host and the SSE connection. |
| **Project context** | Tools that need `projectConfigId` already expose it in their schemas, and init tools like `get_latest_project_state` return a usable id. The adapter can fetch the id at startup (or prompt the operator) and inject it before forwarding tool calls. |
| **Security** | `/mcp` currently has no auth. If we care about scoping, the adapter can enforce a shared token or only bind to `localhost`. Longer term we could add auth to `handle_mcp_connection`. |

## Adapter Outline
1. **Entry point** – Add `backend/setta/mcp/stdio_bridge.py` exporting `python -m setta.mcp.stdio_bridge --backend http://127.0.0.1:8000/mcp`.
2. **Setup** – Inside `main`, concurrently:
   - Open the stdio transport via `mcp.server.stdio.stdio_server()`, which yields `(read_stream, write_stream)` connected to Codex/Claude.
   - Open the SSE transport via `mcp.client.sse.sse_client(url=args.backend)` and wrap it with `ClientSession`.
3. **Initialization handshake** – Wait for the first `initialize` request from stdio, forward it to the backend session (calling `ClientSession.initialize()`), and relay the response + `InitializedNotification` back to the stdio host.
4. **Request proxying** – For every subsequent `JSONRPC` request from stdio (tool calls, list tools, etc.), call the same method on the backend session and stream the result back. Mirror streaming tool deltas/logging notifications by listening to the SSE client’s message handler.
5. **Project context helper** – If the stdio host does not supply `projectConfigId`, fetch it via `get_latest_project_state` on bridge startup and merge it into every tool invocation so project-aware tools keep working.

## Example Codex/Claude Configuration
Once the adapter exists, Codex CLI could reference it in `codex_config.toml`:

```toml
[mcp_servers.setta]
command = "python"
args = ["-m", "setta.mcp.stdio_bridge", "--backend", "http://127.0.0.1:8000/mcp"]
```

Claude Code uses the same schema (command + args). After launching Setta's backend (`pnpm start` or `pnpm startr`), run Codex/Claude in another terminal; they will discover tools like `read_file_range`, `search_and_unlock_mcp_tools`, and every `@project_state_tool`.

## Next Steps
1. Implement the stdio bridge module plus a small CLI wrapper (`argparse` is enough).
2. Smoke test by:
   - Starting the backend.
   - Running the adapter.
   - Launching Codex CLI with a config entry pointing to the adapter.
   - Calling `list_mcp_tools` and `read_file_range` through Codex to ensure round trips succeed.
3. Document the workflow (backend start command, adapter invocation, Codex config snippet) in `README.md` or `docs/ai-chat-refactor-plan.md`.
4. Determine whether we also need authentication or per-session logging before exposing the endpoint broadly.

This approach keeps all tool registration logic unchanged while enabling any MCP-capable application to reuse Setta’s deterministic automation surface.
