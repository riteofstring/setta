# Setta MCP System

Setta exposes its agent surface through the Model Context Protocol (MCP). The backend runs a FastMCP-compatible server, the chat stack aggregates multiple MCP servers (including Setta) through `MultiMCPClient`, and the React UI streams the resulting conversations. Tool names are namespaced when the chat manager calls tools so multiple servers can coexist.

## Server runtime (`backend/setta/mcp/server.py`)
- `SettaFastMCP` subclasses `mcp.server.fastmcp.FastMCP` and is mounted under `/mcp` by `SettaFastAPIState`. The FastAPI app registers an SSE endpoint at `/mcp/messages/` so MCP clients can stream requests and responses over Server-Sent Events.
- The constructor wires together Setta-specific state: it loads the canonical <-> temporary ID map from the database (`dbe.read_temporary_id_map()`), stores a reference to the FastAPI state object, and broadcasts a `SettaNotification` once the server is ready so the UI can show "MCP Server Ready".
- Tool registration happens immediately via `add_setta_tools()`. Functions decorated with `@setta_init_tool` become always-on "init" tools, while `@setta_tool` registrations are marked as "discoverable". The `SettaToolType` annotation is injected into each tool's metadata so clients can split the sets.
- `setta_id_transformer` wraps every tool callable so we can (a) inject `setta_state` when the function asks for it and (b) transparently convert between canonical IDs and the temporary IDs that LLMs see. After each call we persist the latest ID map to keep the client and server aligned.
- A BM25 search index is built over every discoverable tool so the server can answer `search_and_unlock_mcp_tools` for external MCP clients. The chat manager builds its own aggregated search index across all configured servers.
- `SettaTool` extends the default FastMCP `Tool` class. When a function is registered we extract its docstring through `docstring_parser`, propagate parameter descriptions into the JSON schema, and honor any `setta_state`/context kwargs. Tool execution catches exceptions and re-raises them as `ToolError` so clients see structured failures.

## Tool decorators (`backend/setta/mcp/tool_setup.py` and friends)
- `@setta_tool` stores the decorated callable in the `SETTA_MCP_TOOLS` list. Use it for discoverable tools that the chat manager will unlock via search.
- `@setta_init_tool` stores the callable in `SETTA_INIT_MCP_TOOLS`. These tools (for example `setta.read_file_range`, `setta.list_mcp_tools`, and `setta.search_and_unlock_mcp_tools`) are seeded into every chat session automatically; the chat manager intercepts the search tool call to run aggregated search across servers.
- `project_state_registry.project_state_tool` lets any `BaseProjectManager` coroutine become an MCP tool. The decorator inspects the method's Pydantic request model, builds a standalone async function whose signature mirrors that schema (minus any fields tagged with `json_schema_extra[settaMcpHidden]`), and routes calls back through the correct project manager instance. This keeps project-specific tools consistent with the rest of our MCP surface.
- All tool decorators preserve docstrings, so investing in clear docblocks pays off twice: parameter descriptions show up in the MCP schema, and the BM25 index becomes more accurate.

## Tool search tags and categories
- Every tool can carry `searchTags` and `searchCategory` inside `SettaToolAnnotations`. These are used by both the server search index and the chat manager's aggregated search/preunlocking.
- Explicit tags and category are attached via `attach_tool_search_tags`/`attach_tool_search_category` in `project_state_tool` or by manually decorating tool functions.
- Derived metadata comes from the tool name for Setta tools: `_derive_search_tags` expands common synonyms (for example `create` -> `add`, `new`, `insert`) and `_derive_search_category` matches token keywords (for example `terminal`, `chat`, `params`) to a category.
- During registration we merge explicit and derived tags, normalize them to lowercase, and prefer the explicit category when provided. The final values are stored on the MCP tool annotations.
- For external MCP tools without annotations, `MultiMCPClient` normalizes them to `SettaToolAnnotations` with `settaToolType=discoverable` and empty tags/categories, so they are searchable by name and description only.

## Multi-server MCP client (`backend/setta/mcp/multi_client.py`)
- `MultiMCPClient` owns one `MCPServerClient` per server id from `mcp_servers` in `setta_files/llm_config.json`.
- Each server client connects via SSE (`mcp.client.sse.sse_client`) or stdio (`mcp.client.stdio.stdio_client`), initializes the session, and caches `init` vs `discoverable` tool definitions plus normalized annotations.
- The aggregated tool cache is namespaced as `<server_id>.<tool_name>` for both definitions and annotations; `tool_cache_version` increments whenever caches are rebuilt so the chat manager can refresh its search index.
- `call_tool(namespaced_name, args)` splits the namespace and routes the call to the correct server client.

## Stdio bridge (`backend/setta/mcp/client.py`)
- `MCPClient` is a thin SSE client used by the CLI bridge, not the chat manager.
- `python -m setta.mcp.client --backend http://127.0.0.1:8000/mcp` exposes Setta's MCP server over stdin/stdout so third-party MCP hosts can treat it like a local binary.
- The bridge forwards MCP messages between stdio and the SSE connection without applying namespacing.

## LLM chat manager (`backend/setta/llm/llm_chat_manager.py`)
- `LLMChatManager` is the orchestrator that the FastAPI routes invoke. It persists chats, streams litellm responses, manages `deepThink` overrides, and communicates back to the UI via `WMHFrontendSender`.
- Every chat keeps a `ChatToolState`. When a chat starts we seed it with namespaced `MultiMCPClient.init_tool_definitions` so the LLM always sees `<server_id>.<tool_name>` functions.
- `search_and_unlock_mcp_tools` is handled directly in `LLMChatManager` when the tool name is namespaced (for example `setta.search_and_unlock_mcp_tools`). It builds a BM25 index across the merged discoverable tools (names, descriptions, tags, categories), returns namespaced results, and unlocks the selected tool schemas in the chat state.
- `ToolPreunlocker` scores discoverable tools using the latest user message plus section categories from the project summary, then pre-unlocks the top matches (currently up to 2) so common workflows do not need a search round-trip.
- When the LLM emits a tool call, `_dispatch_tool_call` routes it through `MultiMCPClient.call_tool` after validating the namespaced tool name. The aggregated search tool is intercepted locally; other calls are forwarded to the owning server. Follow/preview behavior only runs when tool annotations include those metadata (Setta tools).
- Streaming deltas (`MessageStartEvent`, `MessageDeltaEvent`, `ToolCallDeltaEvent`, etc.) are forwarded to the websocket handler so the frontend can animate assistant text, thinking traces, and tool execution progress in real time.
- Chat persistence happens entirely inside `setta_files/chats/`. `DBE.write_chat` saves each conversation as `<chat_id>.json`, so the UI can reload transcripts or delete them without hitting an external database. `setta_files/temporary_id_map.json` is updated in lockstep so replaying chats keeps ID mappings intact.
- The system prompt that anchors every chat request lives at `backend/setta/mcp/system_prompt.md`. `LLMChatManager` loads this file at startup, trims it, and injects it as the first message in every completion request. It explicitly describes namespaced tool calls.

## LLM configuration (`setta_files/llm_config.json`)
- All provider definitions live in `setta_files/llm_config.json`. The `DBE` helper reads and writes the file, while `LLMConfigWatcher` sits on top of `SpecificFileWatcher` so it can push websocket updates whenever someone edits the JSON by hand.
- The schema comes from `setta.types.llm_config.AllLLMConfigs`: each entry defines `model`, `provider`, optional `base_url`, arbitrary `other_params`, and the `api_key_env` Setta should look up inside `.env`.
- `mcp_servers` is a top-level map keyed by server id. Each entry is an `MCPServerConfig` with `transport` plus either `url`/`headers` (SSE) or `command`/`args`/`env`/`cwd` (stdio). The server id becomes the namespace prefix used in tool names.
- A pre-populated `setta_files/llm_config.example.json` ships with a Claude Sonnet 4.5 example config plus `mcp_servers` entries for Setta and a Context7 stdio server. Copy it to `llm_config.json` (or copy individual entries) and then replace the API keys/env var names with ones available in your `.env`.
- Saving configs through the REST route (`route_set_llm_config`) strips transient fields before writing to disk, while manual edits benefit from validation because the watcher simply calls `load_llm_config` and only broadcasts when parsing succeeds.
- `llm_config.json` stays in `setta_files/`, while `.env` lives in the project root (`./.env`). API keys never leave disk; `DotEnvWatcher` reloads them and `LLMChatManager._sync_api_keys` merges them into each chat request when needed.

## Frontend chat interface (`frontend/src/components/Panes/Overview/ProjectLevelAI`)
- `ProjectChat.tsx` hydrates the LLM config/API key state, lets the user pick a provider, and renders both `ProjectChatCore` and `ProjectLLMSettings` side-by-side.
- `ProjectChatCore` pulls chat details from the zustand `useAIStore`. The `MessageList`/`ChatMessage` components filter out tool-only messages and stitch the assistant stream together, while `ThinkingBox` animates the reasoning traces that arrive in `MessageThinkingDelta` chunks.
- `ChatInput` manages optimistic user submissions. It sends messages through `submitMessage`, which immediately appends the user message locally, POSTs `/getLLMResponse`, and refreshes the chat once the backend acknowledges the chat ID. Pressing the send button while a response is inflight issues `/stopLLMChat`, mirroring the backend's `request_stop_streaming`.
- Websocket payloads of type `LLMStreamingResponse` are handled in `state/actions/ai.ts`. The reducer updates each chat's `messages`, `toolCallArguments`, and `waitingForResponse` flags so the React tree stays synchronized with whatever the `LLMChatManager` is emitting.

## Third-party access
- External MCP clients can connect directly to `http://<host>:<port>/mcp` and call `initialize`, `list_tools`, and `call_tool` against Setta's server. Tool names are not namespaced in this mode; namespacing is only used by the internal `MultiMCPClient`.
- The recommended path for outside applications is to run the stdio bridge:

  ```bash
  source activate.sh
  python -m setta.mcp.client --backend http://127.0.0.1:8000/mcp
  ```

  The resulting process behaves like any other MCP server binary on stdin/stdout, meaning you can register Setta inside clients such as the OpenAI Desktop app or Anthropic's tools without writing glue code.
- Third parties that already speak SSE can also skip the bridge and connect directly. The server exposes `GET /mcp` for the MCP session and `POST /mcp/messages/` as the channel FastMCP uses to forward client-to-server payloads.
- Remember that discoverable tools stay locked until `search_and_unlock_mcp_tools` returns them. External clients should mimic the chat manager's flow by calling search with a natural-language query, merging the returned tool names, and then issuing `call_tool` with the matching schemas.

## When to touch what
- Adding or modifying tools -> update `backend/setta/mcp/tools/*` or annotate project manager methods with `@project_state_tool`. Keep docstrings up to date so discovery remains accurate.
- Updating multi-server routing or tool namespacing -> edit `backend/setta/mcp/multi_client.py`.
- Changing aggregated search, tool unlock behavior, or follow/preview handling -> edit `backend/setta/llm/llm_chat_manager.py` and `backend/setta/llm/tool_preunlocker.py`.
- Changing how MCP calls are streamed to the UI -> edit `backend/setta/llm/llm_chat_manager.py` and the websocket reducers in `frontend/src/state/actions/ai.ts`.
- Adapting the chat UI -> adjust the components in `frontend/src/components/Panes/Overview/ProjectLevelAI/`.
- Integrating a new external MCP consumer -> either script against `python -m setta.mcp.client` or write a native SSE client that emulates what Setta's MCP server already does (initialize, cache tools, call tools, reconnect on failure).
