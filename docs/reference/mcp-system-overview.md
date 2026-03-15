# Setta MCP System

Setta exposes its agent surface through the Model Context Protocol (MCP). The active MCP transport/runtime is Go-owned under `internal/mcpx` and `internal/tools`, the app mounts that Go server under `/mcp`, and the React UI plus the managed-chat runtime consume that Go-owned surface.

## Server runtime (`internal/mcpx`)
- The active MCP server/runtime lives in `internal/mcpx/server.go` and is mounted by the Go app under `/mcp`.
- The constructor wires together Setta-specific state: it loads the canonical ↔ temporary ID map from the database (`dbe.read_temporary_id_map()`), stores a reference to the FastAPI state object, and broadcasts a `SettaNotification` once the server is ready so the UI can show “MCP Server Ready”.
- Tool registration happens immediately via `add_setta_tools()`. Functions decorated with `@setta_init_tool` become always-on “init” tools, while `@setta_tool` registrations are marked as “discoverable”. The `SettaToolType` annotation is injected into each tool’s metadata so clients can split the sets.
- `setta_id_transformer` wraps every tool callable so we can transparently convert between canonical IDs and the temporary IDs that LLMs see. After each call we persist the latest ID map to keep the client and server aligned.
- A BM25 search index is built over every discoverable tool on demand. The index blends tool names, docstrings, parameter descriptions, and search tags/categories. The server-side `search_mcp_tools` helper queries this index for external MCP clients, while the internal managed chat runtime runs its own local search across all configured servers and returns tool references when tool search is enabled. The `list_mcp_tools` init tool uses the same registry for a cheap listing.
- When a function is registered we extract its docstring through `docstring_parser` and propagate parameter descriptions into the JSON schema. Tool execution catches exceptions and re-raises them as `ToolError` so clients see structured failures.

## Tool decorators (`backend/setta/mcp/tool_setup.py` and friends)
- `@setta_tool` stores the decorated callable in the `SETTA_MCP_TOOLS` list. Use it for discoverable tools that should live in the main tool catalog.
- `@setta_init_tool` stores the callable in `SETTA_INIT_MCP_TOOLS`. These tools (for example `read_file_range` and `list_mcp_tools`) are injected into every MCP server session automatically, while the managed chat runtime intercepts `setta__search_mcp_tools` locally for multi-server search.
- `project_state_registry.project_state_tool` lets any `BaseProjectManager` coroutine become an MCP tool. The decorator inspects the method’s Pydantic request model, builds a standalone async function whose signature mirrors that schema (minus any fields tagged with `json_schema_extra[settaMcpHidden]`), and routes calls back through the correct project manager instance. This keeps project-specific tools consistent with the rest of our MCP surface.
- All tool decorators preserve docstrings, so investing in clear docblocks pays off twice: parameter descriptions show up in the MCP schema, and the BM25 index becomes more accurate.

## Tool search tags and categories
- Every tool can carry `searchTags` and `searchCategory` inside `SettaToolAnnotations`. These are used by the BM25 index so search terms match better.
- Explicit tags and category are attached via `attach_tool_search_tags`/`attach_tool_search_category` in `project_state_tool` or by manually decorating tool functions.
- Derived metadata comes from the tool name: `_derive_search_tags` expands common synonyms (for example `create` -> `add`, `new`, `insert`) and `_derive_search_category` matches token keywords (for example `terminal`, `chat`, `params`) to a category.
- During registration we merge explicit and derived tags, normalize them to lowercase, and prefer the explicit category when provided. The final values are stored on the MCP tool annotations and returned in `search_mcp_tools` results.

## Tool runtime policy
- Tools can also declare `ToolRuntimePolicyMetadata`, currently used for:
  - `requiresLLM`
  - `startsRun`
- The Go MCP runtime enforces these annotations before the tool body runs.
- `requiresLLM` checks the active runtime/deployment policy before execution.
- `startsRun` performs a request-scoped pending run-start authorization so
  single-run deployment limits and run permissions are reserved before the tool
  launches work.
- If the tool fails before it commits the start, the pending authorization is
  rolled back automatically.
- Tools that successfully start work must commit the pending authorization
  themselves; `run_agent_profile` and `invoke_linked_chat` both opt into this
  flow.

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
- Optional: `linkedChatInvocationDepth` and
  `linkedChatInvocationChainSectionIds` (used to bound nested
  `invoke_linked_chat` calls).

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

## Linked chat invocation
- `invoke_linked_chat(targetSectionId, prompt)` is a discoverable Setta MCP tool
  implemented in `backend/setta/mcp/tools/agentic_tools.py`.
- It is intended for direct `chat_chat` agentic edges only; admission goes
  through `admit_linked_chat_section_invocation`.
- The tool requires section-scoped agentic context. Missing section context is
  rejected before admission.
- Nested linked-chat calls are bounded:
  - maximum depth is one nested hop
  - the caller chain is tracked to reject cycles
- Target chat bindings are reused/persisted before the run starts so the target
  section remains the source of truth for future invocations.
- The tool also participates in runtime policy enforcement:
  - `requiresLLM=true`
  - `startsRun=true`

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

## Managed chat runtime (`backend/setta/llm/agent_runner.py` + `backend/setta/routers/ai.py`)
- `route_get_llm_response`, `route_get_llm_chat`, and `route_stop_llm_chat` in `backend/setta/routers/ai.py` are the main managed-chat HTTP entrypoints. The send route validates `sectionId`/`allowUnscoped`, branch edits, and `continueFromChatId`, resolves the selected engine/profile, and starts the background run through `AgentRunner`.
- `AgentRunner` is the managed Setta-LLM orchestrator that those routes invoke. It persists agent runs, streams litellm responses, manages `thinking` overrides, keeps per-run live chat state in memory, and communicates back to the UI via `WMHFrontendSender`.
- Managed chat hydration now comes from persisted agent runs plus live overlays, not a separate `setta_files/chats/` store. `build_chat_state_from_run(...)` reconstructs chat state from the latest run, and `route_get_llm_chat` overlays `AgentRunner.get_live_chat_state(...)` while a run is still active.
- `AgentRunner` always includes the full tool catalog in each request. For Anthropic tool search, it marks non-search tools with `defer_loading` and exposes a local search tool that returns tool references to load the exact tools needed.
- Tool names are always namespaced as `<serverId>__<toolName>` so the prompt never contains ambiguous tool names.
- The first request for a chat injects the active `projectConfigId` into the system prompt (if available). Project summaries are fetched only when the model calls `get_latest_project_state_summary`.
- `setta__search_mcp_tools` is handled inside `AgentRunner` (no MCP round-trip). It searches the aggregated tool registry and returns namespaced results so tool references stay consistent across servers.
- When the LLM emits a tool call, `_dispatch_tool_call` routes namespaced tool calls through `MultiMCPClient.call_tool`. Arguments are sanitized via `convert_existing_canonical_ids_to_temporary` before being logged or persisted, and the results are streamed back to the UI as `ToolResultEvent`s.
- Streaming deltas (`MessageStartEvent`, `MessageDeltaEvent`, `ToolCallDeltaEvent`, etc.) are forwarded to the websocket handler so the frontend can animate assistant text, thinking traces, and tool execution progress in real time.
- The system prompt that anchors every chat request lives at `backend/setta/mcp/system_prompt.md`. `AgentRunner` loads this file at startup, trims it, and injects it as the first message in every completion request.

## LLM configuration (`setta_files/llm_config.json`)
- All provider definitions live in `setta_files/llm_config.json`. The `DBE` helper reads and writes the file, while `LLMConfigWatcher` sits on top of `SpecificFileWatcher` so it can push websocket updates whenever someone edits the JSON by hand.
- The schema comes from `setta.types.llm_config.AllLLMConfigs`: each entry defines `model`, `provider`, optional `base_url`, arbitrary `other_params`, `api_key_env`, and optional `mcpServerIds` (null uses defaults, empty disables MCP tools).
- `mcpServers` defines the global MCP server registry (transport + connection settings), and `defaultMcpServerIds` selects the default server set when a config does not override it.
- A pre-populated `setta_files/llm_config.example.json` ships with a Claude Sonnet 4.5 example config. Copy it to `llm_config.json` (or copy individual entries) and then replace the API keys/env var names with ones available in your `.env`.
- Saving configs through the REST route (`route_set_llm_config`) strips transient fields before writing to disk, while manual edits benefit from validation because the watcher simply calls `load_llm_config` and only broadcasts when parsing succeeds.
- `llm_config.json` stays in `setta_files/`, while managed key values are stored in workspace `.env` (`./.env`). Setta tracks managed ownership with `SETTA_MANAGED_LLM_API_KEY_NAMES`, and both `DotEnvWatcher` and `LLMConfigWatcher` sync key snapshots into runtime + websocket state (`LLMApiKeysUpdated`) with revision/corruption metadata.

## Frontend chat interface (`frontend/src/components/Panes/Overview/ProjectLevelAI`)
- The Overview `Project AI Chat` tab now renders `ProjectChatManager`, which is
  a window manager for project-chat instances rather than the only chat host.
- `ProjectChat.tsx` still hydrates LLM/API-key state and switches between active
  chat (`ProjectChatCore`), chat history (`ProjectChatHistory`), and
  session-local auxiliary views (`Skills`, `MCP`, `Slash Commands`, and `AI Settings`).
- `UnifiedChatSurface` is the shared host abstraction used by workspace windows,
  standalone project-chat routes, standalone section routes, and standalone
  window-space routes.
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
- Project-chat windowing and window-space behavior is documented in
  `docs/reference/project-chat-windowing.md`.

## Third-party access
- Because Setta speaks standard MCP over SSE, any MCP-compatible client can point at `http://<host>:<port>/mcp` and call `initialize`, `list_tools`, and `call_tool` just like it would against Cursor, Claude, or OpenAI’s tool hosts. Authentication is handled upstream (Setta runs behind whatever protections you configure), so the MCP surface itself simply expects the HTTP socket to be authorized. Most tools also require agentic context (see above) so tool calls are scope-enforced.
- The recommended path for outside applications is to run the stdio bridge:

  ```bash
  source activate.sh
  python -m setta.mcp.client --backend http://127.0.0.1:8000/mcp
  ```

  The resulting process behaves like any other MCP server binary on stdin/stdout, meaning you can register Setta inside clients such as the OpenAI Desktop app or Anthropic’s tools without writing glue code.
- Third parties that already speak SSE can also skip the bridge and connect directly. The server exposes `GET /mcp` for the MCP session and `POST /mcp/messages/` as the channel FastMCP uses to forward client-to-server payloads. Once connected, they receive the same tool list (`list_mcp_tools` and `search_mcp_tools` included), the same doc-enriched schemas, and the same ID translation guarantees that the internal managed chat runtime relies on.
- External clients can optionally call `search_mcp_tools` to get shortlists of relevant tools. The server-side search results use un-namespaced tool names, so external clients should call tools by those names.

## When to touch what
- Adding or modifying tools → update `backend/setta/mcp/tools/*` or annotate project manager methods with `@project_state_tool`. Keep docstrings up to date so discovery remains accurate.
- Changing how MCP calls are streamed to the UI for managed chats → edit `backend/setta/llm/agent_runner.py`, `backend/setta/routers/ai.py`, and the websocket reducers in `frontend/src/state/actions/ai.ts`.
- Adapting the chat UI → adjust the components in `frontend/src/components/Panes/Overview/ProjectLevelAI/`.
- Integrating a new external MCP consumer → either script against `python -m setta.mcp.client` or write a native SSE client that emulates what `MultiMCPClient` already does (initialize, cache tools, call tools, reconnect on failure).

With these pieces in mind you should be able to trace any MCP request end-to-end, from a user prompt in the UI (or an external orchestrator) through the Setta FastMCP server and back again.
