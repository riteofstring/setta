# Setta MCP System

Setta exposes its agent surface through the Model Context Protocol (MCP). The backend runs a FastMCP-compatible server, the chat stack consumes it through an internal MCP client, and the React UI streams the resulting conversations. This document captures how the major pieces fit together and how third-party tools can take advantage of the server.

## Server runtime (`backend/setta/mcp/server.py`)
- `SettaFastMCP` subclasses `mcp.server.fastmcp.FastMCP` and is mounted under `/mcp` by `SettaFastAPIState`. The FastAPI app registers an SSE endpoint at `/mcp/messages/` so MCP clients can stream requests and responses over Server-Sent Events.
- The constructor wires together Setta-specific state: it loads the canonical ↔ temporary ID map from the database (`dbe.read_temporary_id_map()`), stores a reference to the FastAPI state object, and broadcasts a `SettaNotification` once the server is ready so the UI can show “MCP Server Ready”.
- Tool registration happens immediately via `add_setta_tools()`. Functions decorated with `@setta_init_tool` become always-on “init” tools, while `@setta_tool` registrations are marked as “discoverable”. The `SettaToolType` annotation is injected into each tool’s metadata so clients can split the sets.
- `setta_id_transformer` wraps every tool callable so we can transparently convert between canonical IDs and the temporary IDs that LLMs see. After each call we persist the latest ID map to keep the client and server aligned.
- A BM25 search index is built over every discoverable tool on demand. The index blends tool names, docstrings, parameter descriptions, and search tags/categories. The server-side `search_mcp_tools` helper queries this index for external MCP clients, while the internal chat manager runs its own local search across all configured servers and returns tool references when tool search is enabled. The `list_mcp_tools` init tool uses the same registry for a cheap listing.
- When a function is registered we extract its docstring through `docstring_parser` and propagate parameter descriptions into the JSON schema. Tool execution catches exceptions and re-raises them as `ToolError` so clients see structured failures.

## Tool decorators (`backend/setta/mcp/tool_setup.py` and friends)
- `@setta_tool` stores the decorated callable in the `SETTA_MCP_TOOLS` list. Use it for discoverable tools that should live in the main tool catalog.
- `@setta_init_tool` stores the callable in `SETTA_INIT_MCP_TOOLS`. These tools (for example `read_file_range` and `list_mcp_tools`) are injected into every MCP server session automatically, while the chat manager intercepts `setta__search_mcp_tools` locally for multi-server search.
- `project_state_registry.project_state_tool` lets any `BaseProjectManager` coroutine become an MCP tool. The decorator inspects the method’s Pydantic request model, builds a standalone async function whose signature mirrors that schema (minus any fields tagged with `json_schema_extra[settaMcpHidden]`), and routes calls back through the correct project manager instance. This keeps project-specific tools consistent with the rest of our MCP surface.
- All tool decorators preserve docstrings, so investing in clear docblocks pays off twice: parameter descriptions show up in the MCP schema, and the BM25 index becomes more accurate.

## Tool search tags and categories
- Every tool can carry `searchTags` and `searchCategory` inside `SettaToolAnnotations`. These are used by the BM25 index so search terms match better.
- Explicit tags and category are attached via `attach_tool_search_tags`/`attach_tool_search_category` in `project_state_tool` or by manually decorating tool functions.
- Derived metadata comes from the tool name: `_derive_search_tags` expands common synonyms (for example `create` -> `add`, `new`, `insert`) and `_derive_search_category` matches token keywords (for example `terminal`, `chat`, `params`) to a category.
- During registration we merge explicit and derived tags, normalize them to lowercase, and prefer the explicit category when provided. The final values are stored on the MCP tool annotations and returned in `search_mcp_tools` results.

## UI setting tools and reveal flow
- Setta now exposes UI-setting tools as discoverable MCP tools:
  - `search_ui_settings(query, limit, sourceFilter, projectConfigId?)`
  - `get_ui_setting_value(settingId, projectConfigId?)`
  - `set_ui_setting_value(settingId, value, revealAfterSet, durationMs, projectConfigId?)`
  - `reveal_ui_setting(settingId, sectionIdToActivate, durationMs, projectConfigId?)`
- Canonical setting ids are stable:
  - Core settings: `core.*` (for example `core.watch_code.enabled`)
  - Plugin settings: `plugin::<pluginId>::<localSettingId>`
- `set_ui_setting_value` validates input against each setting’s `valueSchema`, enforces read-only/writable semantics, and performs compare-and-set style writes (`expected_old_value`) to avoid stale clobbers.
- `reveal_ui_setting` (and `set_ui_setting_value(..., revealAfterSet=true)`) dispatches a `UISettingReveal` websocket message to a selected frontend and waits for a `UISettingRevealResult` acknowledgement.
- Right-pane reveals require section context. If no section is active, pass `sectionIdToActivate`; otherwise reveal returns a structured failure instead of guessing.
- Reveal failures and validation issues are surfaced as typed UI-setting error codes (`setting_not_found`, `setting_read_only`, `invalid_value_type`, `invalid_value_range_or_enum`, `plugin_unavailable`, `mutation_failed`).

## Agentic context + scope enforcement
Most Setta MCP tools are scope-enforced by default. Calls that lack agentic
context return a `CallToolResult` error with `structuredContent.error="ScopeViolation"`
instead of executing unscoped.

Agentic context inputs:
- Required: `projectConfigId`.
- Required unless unscoped: `sectionId` (the Chat section id).
- Optional: `chatId` (used to associate follow/highlight state with a specific chat/run).
- Optional: `frontendAffinityToken` (used to route UI-setting reveal requests back to the originating frontend when multiple frontends are connected).
- Optional: `allowUnscoped=true` (project-level access; used by Project Chat).

Ways to provide agentic context:
- MCP meta (`projectConfigId`, `chatId`, `sectionId`, `frontendAffinityToken`, `allowUnscoped`).
- Request headers (`x-setta-project-config-id`, `x-setta-chat-id`,
  `x-setta-section-id`, `x-setta-frontend-affinity-token`,
  `x-setta-allow-unscoped`).
- `/__setta__/tools/call` request body (`agenticContext` object).
- Persistent sessions can also call the init tool `set_agentic_context` once per
  session.

Tool enforcement details:
- Tools declare access metadata (`accessType`: `read`/`write`/`structural` and
  `idPathsByType`) via `backend/setta/mcp/tool_metadata.py`.
- The server extracts target ids from tool arguments, maps `codeObj` ids to
  section ids when possible, and blocks out-of-scope calls. Blocked results
  include `blockedSectionIds`, `targetSectionIds`, and `missingEdgesCanonical`
  hints so the UI can suggest which agentic edges to create.
- Some tools are allowed to run without context (for example `list_mcp_tools`
  and `search_mcp_tools`); keep this set intentionally small.
- Some tool results are scope-filtered instead of blocked (for example project
  state summaries and LSP diagnostics).

## Frontend affinity routing
- On websocket connect, each frontend receives a `FrontendIdentity` message with a `frontendAffinityToken`.
- The app includes that token when creating AI runs (`/getLLMResponse`) and MCP tool calls (`/__setta__/tools/call`) so reveal-capable tools can target the correct frontend.
- In IDE mode, reveal routing is strict:
  - If exactly one eligible frontend is connected, reveal can proceed without an explicit token.
  - If multiple eligible frontends are connected and no affinity token resolves, reveal fails closed with an ambiguity error.
- In share/app mode, routing is additionally constrained by the active `shareSessionId`.

## MCP client (`backend/setta/mcp/client.py`)
- `MultiMCPClient` maintains a `ClientSession` per configured MCP server (SSE, Streamable HTTP, or stdio). Once connected it calls `list_tools()`, converts each tool into an OpenAI-compatible definition, and splits the cache into `init_tool_definitions` and `discoverable_tool_definitions` based on `SettaToolType` when available.
- Tool names are always namespaced as `<serverId>__<toolName>`. The client keeps a routing map so `call_tool` can strip the prefix and send the request to the correct server/session.
- Tools without Setta annotations are accepted and treated as discoverable; they still appear in the namespaced registry.
- `run_stdio_bridge` allows Setta’s MCP server to look like a `stdio` transport. `python -m setta.mcp.client --backend http://127.0.0.1:8000/mcp` pipes stdin/stdout to the SSE connection, which means third-party MCP orchestrators (OpenAI, Claude Desktop, Cursor, etc.) can act as if Setta were a local MCP tool host.
- The command-line options (`--backend`, `--verbose`) make the bridge easy to embed in shell scripts or automation. Because the connection uses only SSE, the bridge works across machines as long as the HTTP endpoint is reachable.

## LLM chat manager (`backend/setta/llm/llm_chat_manager.py`)
- `LLMChatManager` is the orchestrator that the FastAPI routes invoke. It persists chats, streams litellm responses, manages `thinking` overrides, and communicates back to the UI via `WMHFrontendSender`.
- `LLMChatManager` always includes the full tool catalog in each request. For Anthropic tool search, it marks non-search tools with `defer_loading` and exposes a local search tool that returns tool references to load the exact tools needed.
- Tool names are always namespaced as `<serverId>__<toolName>` so the prompt never contains ambiguous tool names.
- The first request for a chat injects the active `projectConfigId` into the system prompt (if available). Project summaries are fetched only when the model calls `get_latest_project_state_summary`.
- `setta__search_mcp_tools` is handled inside `LLMChatManager` (no MCP round-trip). It searches the aggregated tool registry and returns namespaced results so tool references stay consistent across servers.
- When the LLM emits a tool call, `_dispatch_tool_call` routes namespaced tool calls through `MultiMCPClient.call_tool`. Arguments are sanitized via `convert_existing_canonical_ids_to_temporary` before being logged or persisted, and the results are streamed back to the UI as `ToolResultEvent`s.
- Streaming deltas (`MessageStartEvent`, `MessageDeltaEvent`, `ToolCallDeltaEvent`, etc.) are forwarded to the websocket handler so the frontend can animate assistant text, thinking traces, and tool execution progress in real time.
- Chat persistence happens entirely inside `setta_files/chats/`. `DBE.write_chat` saves each conversation as `<chat_id>.json`, so the UI can reload transcripts or delete them without hitting an external database. `setta_files/temporary_id_map.json` is updated in lockstep so replaying chats keeps ID mappings intact.
- The system prompt that anchors every chat request lives at `backend/setta/mcp/system_prompt.md`. `LLMChatManager` loads this file at startup, trims it, and injects it as the first message in every completion request.

## LLM configuration (`setta_files/llm_config.json`)
- All provider definitions live in `setta_files/llm_config.json`. The `DBE` helper reads and writes the file, while `LLMConfigWatcher` sits on top of `SpecificFileWatcher` so it can push websocket updates whenever someone edits the JSON by hand.
- The schema comes from `setta.types.llm_config.AllLLMConfigs`: each entry defines `model`, `provider`, optional `base_url`, arbitrary `other_params`, `api_key_env`, and optional `mcpServerIds` (null uses defaults, empty disables MCP tools).
- `mcpServers` defines the global MCP server registry (transport + connection settings), and `defaultMcpServerIds` selects the default server set when a config does not override it.
- A pre-populated `setta_files/llm_config.example.json` ships with a Claude Sonnet 4.5 example config. Copy it to `llm_config.json` (or copy individual entries) and then replace the API keys/env var names with ones available in your `.env`.
- Saving configs through the REST route (`route_set_llm_config`) strips transient fields before writing to disk, while manual edits benefit from validation because the watcher simply calls `load_llm_config` and only broadcasts when parsing succeeds.
- `llm_config.json` stays in `setta_files/`, while managed key values are stored in workspace `.env` (`./.env`). Setta tracks managed ownership with `SETTA_MANAGED_LLM_API_KEY_NAMES`, and both `DotEnvWatcher` and `LLMConfigWatcher` sync key snapshots into runtime + websocket state (`LLMApiKeysUpdated`) with revision/corruption metadata.

## Frontend chat interface (`frontend/src/components/Panes/Overview/ProjectLevelAI`)
- `ProjectChat.tsx` hydrates LLM/API-key state and now switches between active chat (`ProjectChatCore`), chat history (`ProjectChatHistory`), and session-local auxiliary views inside Project AI Chat itself (`Skills`, `MCP`, `Slash Commands`, and `AI Settings`).
- `ProjectChatCore` pulls chat details from the zustand `useAIStore`. `ChatMessageList`/`ChatMessage` filter out tool-only messages, stitch assistant streams together, and surface edit + branch switcher controls using branch metadata derived from agent runs.
- Empty-chat state includes a create-project starter action. It seeds a normal project-creation prompt when a codebase exists, and uses a question-first starter prompt when no codebase is detected (`projectChatStarterPrompts.ts`).
- `ProjectChatSkillsMcpViewer` now handles three aux surfaces:
  - `Skills`: discovery plus rendered/raw markdown preview, editability metadata, custom-skill create/save flows, and root-path reveal helpers.
  - `MCP`: configured MCP servers plus runtime status scoped by the active `chatId`/`engineConfigId` when present.
  - `Slash Commands`: built-in Setta commands, runtime native external-agent commands, and per-project custom prompt commands.
- The viewer calls `/getAppGenSkills`, `/getAppGenSkillContent`, `/upsertAppGenCustomSkill`, `/settaHomeInfo`, and `/mcpServerRuntimeStatus`, then optionally reveals roots in the OS file explorer through `/revealPathInOsFileExplorer`.
- `ChatInput` manages optimistic user submissions and attachments via `submitMessage`. `ChatMessageEditor` powers user-message edits and calls `submitEditedMessage`, which POSTs `/getLLMResponse` with `branchParentChatId`/`branchFromMessageId` to create a new branch chat. Pressing the send button while a response is inflight issues `/stopLLMChat`; the stop response includes `alreadyStopped`, `stoppedRunId`, and `stoppedMessageId` so the UI can reconcile interruption markers.
- Project chat slash-command handling now separates recognized commands from executable commands. This lets the composer keep temporarily unavailable external-agent native commands local, reload authority, and then retry resolution instead of sending the slash text as a normal prompt.
- Websocket payloads of type `LLMStreamingResponse` are handled in `state/actions/ai.ts`. The reducer updates each chat’s `messages`, `toolCallArguments`, and `waitingForResponse` flags so the React tree stays synchronized with whatever the `LLMChatManager` is emitting.

## Third-party access
- Because Setta speaks standard MCP over SSE, any MCP-compatible client can point at `http://<host>:<port>/mcp` and call `initialize`, `list_tools`, and `call_tool` just like it would against Cursor, Claude, or OpenAI’s tool hosts. Authentication is handled upstream (Setta runs behind whatever protections you configure), so the MCP surface itself simply expects the HTTP socket to be authorized. Most tools also require agentic context (see above) so tool calls are scope-enforced.
- The recommended path for outside applications is to run the stdio bridge:

  ```bash
  source activate.sh
  python -m setta.mcp.client --backend http://127.0.0.1:8000/mcp
  ```

  The resulting process behaves like any other MCP server binary on stdin/stdout, meaning you can register Setta inside clients such as the OpenAI Desktop app or Anthropic’s tools without writing glue code.
- Third parties that already speak SSE can also skip the bridge and connect directly. The server exposes `GET /mcp` for the MCP session and `POST /mcp/messages/` as the channel FastMCP uses to forward client-to-server payloads. Once connected, they receive the same tool list (`list_mcp_tools` and `search_mcp_tools` included), the same doc-enriched schemas, and the same ID translation guarantees that the internal chat manager relies on.
- External clients can optionally call `search_mcp_tools` to get shortlists of relevant tools. The server-side search results use un-namespaced tool names, so external clients should call tools by those names.

## When to touch what
- Adding or modifying tools → update `backend/setta/mcp/tools/*` or annotate project manager methods with `@project_state_tool`. Keep docstrings up to date so discovery remains accurate.
- Changing how MCP calls are streamed to the UI → edit `backend/setta/llm/llm_chat_manager.py` and the websocket reducers in `frontend/src/state/actions/ai.ts`.
- Adapting the chat UI → adjust the components in `frontend/src/components/Panes/Overview/ProjectLevelAI/`.
- Integrating a new external MCP consumer → either script against `python -m setta.mcp.client` or write a native SSE client that emulates what `MultiMCPClient` already does (initialize, cache tools, call tools, reconnect on failure).

With these pieces in mind you should be able to trace any MCP request end-to-end, from a user prompt in the UI (or an external orchestrator) through the Setta FastMCP server and back again.
