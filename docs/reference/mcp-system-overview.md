# Setta MCP System

Setta exposes its agent surface through the Model Context Protocol (MCP). The active MCP transport/runtime is Go-owned under `internal/mcpx` and `internal/tools`, the app mounts that Go server under `/mcp`, and the React UI plus the managed-chat runtime consume that Go-owned surface.

## Server runtime (`internal/mcpx`)
- The active MCP server/runtime lives in `internal/mcpx/server.go` and is mounted by the Go app under `/mcp`.
- The constructor wires together the Go-owned providers for project state, docs loading, Python-package inspection, terminal history, agent profiles/runs, UI-setting reveals, and canonical↔temporary ID translation.
- Tool registration happens through `defaultToolDefinitions()` in `internal/mcpx/server.go`. Each built-in tool is described by a `tools.Spec`, registered through `internal/tools.Registry`, and exposed with explicit input/output schemas plus normalized metadata.
- Calls run through the Go ID-translation and scope-enforcement path before the tool handler executes, so the same registered metadata drives temporary-id handling, target resolution, and blocked-result shaping.
- A search index is built over every discoverable tool from the Go registry. The index blends tool names, descriptions, metadata tags/categories, and schema text. The server-side `search_mcp_tools` helper queries this index for external MCP clients, while the internal managed chat runtime runs its own local multi-server search. The `list_mcp_tools` init tool uses the same registry for a cheap listing.
- Tool execution surfaces structured `code`/`message` failures through the Go MCP error path.

## Tool catalog and metadata (`internal/mcpx` and `internal/tools`)
- `defaultToolDefinitions()` in `internal/mcpx/server.go` is the source of truth for the built-in Go MCP tool catalog.
- `internal/tools/registry.go` validates tool names and metadata, rejects duplicates, and keeps the registered catalog sorted for listing and search.
- `internal/mcpx/tool_catalog.go` builds the same Go-owned tool payloads for CLI/tool-introspection paths, so the live server and offline tool catalog stay aligned.
- MCP tool catalog/metadata ownership is Go-side under `internal/mcpx` and
  `internal/tools`; the Python `backend/setta/mcp/*` files are
  client/annotation helpers for the package surface.

## Tool search tags and categories
- Every tool can carry `SearchTags` and `SearchCategory` in `internal/tools.Metadata`.
- Explicit tags/category are declared on each `tools.Spec`; `internal/tools/metadata.go` also derives additional search tags and a fallback category from the tool name.
- Registration normalizes tags/categories once, and `internal/tools/search.go` indexes those normalized values together with tool names, descriptions, and schema text for `search_mcp_tools`.

## Tool metadata surface
- The active Go MCP metadata under the `setta` namespace includes `toolKind`, `accessType`, `idPathsByType`, optional `resultIdPathsByType`, optional `defaultTargetSingletonSection`, `searchTags`, `searchCategory`, optional `resultFilter`, and optional `toolArgumentPreview`.
- `internal/mcpx/server.go` derives SDK `readOnlyHint`/`idempotentHint` annotations from read-only access metadata.
- Scope enforcement, result filtering, and managed tool-preview streaming all consume this same normalized Go metadata.

## UI setting tools and reveal flow
- Setta exposes UI-setting tools as discoverable MCP tools:
  - `search_ui_settings(query, limit, sourceFilter, projectConfigId?)`
  - `get_ui_setting_value(settingId, projectConfigId?)`
  - `set_ui_setting_value(settingId, value, revealAfterSet, durationMs, projectConfigId?)`
  - `reveal_ui_setting(settingId, sectionIdToActivate, durationMs, projectConfigId?)`
- Canonical setting ids are stable:
  - Core settings: `core.*` (for example `core.project.name`)
  - Plugin settings: `plugin::<pluginId>::<localSettingId>` (for example `plugin::setta-watch-code::files`)
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
- Optional: `chatId` (associates follow/highlight state with a specific chat/run).
- Optional: `shareSessionId` (constrains deployment/share-scoped tool routing to the active session).
- Optional: `runId` (used by workflow child chats when calling `report_state_machine_signal`).
- Optional: `frontendAffinityToken` (routes UI-setting reveal requests back to the originating frontend when multiple frontends are connected).
- Optional: `allowUnscoped=true` (project-level access; used by Project Chat).

Ways to provide agentic context:
- MCP meta (`projectConfigId`, `shareSessionId`, `chatId`, `runId`, `sectionId`, `frontendAffinityToken`, `allowUnscoped`).
- Request headers (`x-setta-project-config-id`, `x-setta-chat-id`,
  `x-setta-run-id`, `x-setta-section-id`, `x-setta-frontend-affinity-token`,
  `x-setta-allow-unscoped`, `X-Share-Session-Id`).
- `/__setta__/tools/call` request body (`agenticContext` object).
- Persistent sessions can also call the init tool `set_agentic_context` once per
  session.

Tool enforcement details:
- Tools declare access metadata (`accessType`: `read`/`write`/`structural` and
  `idPathsByType`) through `internal/tools/metadata.go`.
- The server extracts target ids from tool arguments, maps `codeObj` ids to
  section ids when possible, and blocks out-of-scope calls. Blocked results
  include `blockedSectionIds`, `targetSectionIds`, and `missingEdgesCanonical`
  hints so the UI can suggest which agentic edges to create.
- Some tools are allowed to run without context (for example `list_mcp_tools`
  and `search_mcp_tools`); keep this set intentionally small.
- Some tool results are scope-filtered instead of blocked (for example project
  state summaries and LSP diagnostics).

## Linked chat edges
- Linked `chat_chat` edges participate in scoped chat context and
  executable-target discovery.
- The Go agentic MCP flow uses `run_agent_profile` plus
  `report_state_machine_signal`; linked chat edges remain project-state metadata.

## Frontend affinity routing
- On websocket connect, each frontend receives a `FrontendIdentity` message with a `frontendAffinityToken`.
- The app includes that token when creating AI runs (`/getLLMResponse`) and MCP tool calls (`/__setta__/tools/call`) so reveal-capable tools can target the correct frontend.
- In IDE mode, reveal routing is strict:
  - If exactly one eligible frontend is connected, reveal can proceed without an explicit token.
  - If multiple eligible frontends are connected and no affinity token resolves, reveal fails closed with an ambiguity error.
- In share/app mode, routing is additionally constrained by the active `shareSessionId`.

## Go MCP client (`internal/mcpx/client.go`)
- The active multi-server MCP client runtime is Go-owned under `internal/mcpx/client.go`.
- It maintains a session per configured MCP server (SSE, Streamable HTTP, or stdio), calls `list_tools`, and caches init/discoverable tool definitions plus runtime status for the managed-chat/runtime paths that still need outbound MCP client behavior.
- Tool names are always namespaced as `<serverId>__<toolName>`, and the client keeps a routing map so `call_tool` can strip the prefix and send the request to the correct server/session.
- Retry and reconnect behavior for configured external MCP servers lives in the
  Go client/runtime.

## Packaged stdio bridge (`internal/settacmd/mcp.go`, `internal/mcpx/stdio_bridge.go`)
- `setta mcp` (or the explicit `setta mcp bridge`) lets Setta’s Go MCP server look like a local `stdio` transport for third-party MCP orchestrators.
- The CLI resolves auth from either `--token` / `--bootstrap-url` or the current local session (`SETTA_SESSION_ID`, plus `SETTA_SESSIONS_ROOT` when running outside the session workspace), then forwards raw MCP JSON-RPC messages between stdin/stdout and the Go `/mcp` SSE endpoint.
- Because the bridge is transport-thin, external clients see the same tool catalog, schemas, and behavior that the Go-owned `/mcp` server already exposes.

## Managed chat runtime (`internal/httpapi/llm_routes.go`, `internal/managedchat`, and `internal/managedllm`)
- `RegisterLLMRoutes` exposes the IDE-only `getLLMResponse`, `getLLMChat`, and `stopLLMChat` handlers through the Go HTTP API.
- `internal/managedchat/service.go` validates send/hydrate/stop inputs, persists agent runs, and reconstructs chat state from persisted runs.
- `internal/managedchat/live_runtime.go` keeps the active in-memory overlay for running chats and broadcasts `LLMStreamingResponse` chunks over the frontend websocket.
- Provider execution, tool-call streaming, tool previews, and tool-result follow updates live under `internal/managedllm/*`.
- Tool names are always namespaced as `<serverId>__<toolName>` so the prompt never contains ambiguous tool names.
- Project summaries, tool catalogs, and MCP-tool dispatch stay on the Go side
  through `internal/tools` and `internal/mcpx`.

## LLM configuration (`setta_files/llm_config.json`)
- All provider definitions live in `setta_files/llm_config.json`.
- `internal/llmconfig/service.go` is the active read/write/validation owner, and `internal/httpapi/llm_routes.go` broadcasts `LLMConfigUpdated` and `LLMApiKeysUpdated` when config or managed keys change.
- `mcpServers` defines the global MCP server registry (transport + connection settings), and `defaultMcpServerIds` selects the default server set when a config does not override it.
- A pre-populated `setta_files/llm_config.example.json` still ships as a starter file.
- Managed key values live in workspace `.env` (`./.env`), and `internal/llmconfig/managed_api_keys.go` owns revisioned reads/writes plus process-env merging for runtime use.

## Frontend chat interface (`frontend/src/components/Panes/Overview/ProjectLevelAI`)
- The Overview `Project AI Chat` tab renders `ProjectChatManager`, which is
  a window manager for project-chat instances rather than the only chat host.
- `ProjectChat.tsx` still hydrates LLM/API-key state and switches between active
  chat (`ProjectChatCore`), chat history (`ProjectChatHistory`), and
  session-local auxiliary views (`Skills`, `MCP`, `Slash Commands`, and `AI Settings`).
- `UnifiedChatSurface` is the shared host abstraction used by workspace windows,
  standalone project-chat routes, standalone section routes, and standalone
  window-space routes.
- `ProjectChatCore` pulls chat details from the zustand `useAIStore`. `ChatMessageList`/`ChatMessage` filter out tool-only messages, stitch assistant streams together, and surface edit + branch switcher controls using branch metadata derived from agent runs.
- Empty-chat state includes a create-project starter action. It seeds a normal project-creation prompt when a codebase exists, and uses a question-first starter prompt when no codebase is detected (`projectChatStarterPrompts.ts`).
- `ProjectChatSkillsMcpViewer` handles three aux surfaces:
  - `Skills`: discovery plus rendered/raw markdown preview, editability metadata, custom-skill create/save flows, and root-path reveal helpers.
  - `MCP`: configured MCP servers plus runtime status scoped by the active `chatId`/`engineConfigId` when present.
  - `Slash Commands`: built-in Setta commands, runtime native external-agent commands, and per-project custom prompt commands.
- The viewer calls `/getAppGenSkills`, `/getAppGenSkillContent`, `/upsertAppGenCustomSkill`, `/settaHomeInfo`, and `/mcpServerRuntimeStatus`, then optionally reveals roots in the OS file explorer through `/revealPathInOsFileExplorer`.
- `ChatInput` manages optimistic user submissions and attachments via `submitMessage`. `ChatMessageEditor` powers user-message edits and calls `submitEditedMessage`, which POSTs `/getLLMResponse` with `branchParentChatId`/`branchFromMessageId` to create a new branch chat. Pressing the send button while a response is inflight issues `/stopLLMChat`; the stop response includes `alreadyStopped`, `stoppedRunId`, and `stoppedMessageId` so the UI can reconcile interruption markers.
- Project chat slash-command handling separates recognized commands from
  executable commands. This lets the composer keep temporarily unavailable
  external-agent native commands local, reload authority, and then retry
  resolution instead of sending the slash text as a normal prompt.
- Websocket payloads of type `LLMStreamingResponse` are handled in `state/actions/ai.ts`. The reducer updates each chat’s `messages`, `toolCallArguments`, and `waitingForResponse` flags so the React tree stays synchronized with whatever the `LLMChatManager` is emitting.
- Project-chat windowing and window-space behavior is documented in
  `docs/reference/project-chat-windowing.md`.

## Third-party access
- Because Setta speaks standard MCP over SSE, any MCP-compatible client can point at `http://<host>:<port>/mcp` and call `initialize`, `list_tools`, and `call_tool` just like it would against Cursor, Claude, or OpenAI’s tool hosts. Authentication is handled upstream (Setta runs behind whatever protections you configure), so the MCP surface itself simply expects the HTTP socket to be authorized. Most tools also require agentic context (see above) so tool calls are scope-enforced.
- The recommended path for outside applications is to run the stdio bridge:

  ```bash
  setta mcp --backend http://127.0.0.1:8000/mcp
  ```

  The resulting process behaves like any other MCP server binary on stdin/stdout, meaning you can register Setta inside clients such as the OpenAI Desktop app or Anthropic’s tools without writing glue code.
- Third parties that already speak SSE can also skip the bridge and connect directly. The server exposes `GET /mcp` for the initial SSE session, then returns an `endpoint` event that names the session message endpoint (the Go SDK uses the same `/mcp` path with a `sessionid` query parameter). Once connected, they receive the same tool list (`list_mcp_tools` and `search_mcp_tools` included), the same doc-enriched schemas, and the same ID translation guarantees that the internal managed chat runtime relies on.
- External clients can optionally call `search_mcp_tools` to get shortlists of relevant tools. The server-side search results use un-namespaced tool names, so external clients should call tools by those names.

## When to touch what
- Adding or modifying tools → update `internal/mcpx/server.go` or the focused helper files under `internal/mcpx/*_tools.go`, plus `internal/tools/*` when metadata/search behavior changes.
- Changing how MCP calls are streamed to the UI for managed chats → edit `internal/managedllm`, `internal/managedchat/live_runtime.go`, `internal/httpapi/llm_routes.go`, and the websocket reducers in `frontend/src/state/actions/ai.ts`.
- Adapting the chat UI → adjust the components in `frontend/src/components/Panes/Overview/ProjectLevelAI/`.
- Integrating a new external MCP consumer → either script against `setta mcp` or write a native SSE client against `/mcp`.

With these pieces in mind you should be able to trace any MCP request end-to-end, from a user prompt in the UI (or an external orchestrator) through the Go Setta MCP server and back again.
