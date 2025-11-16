**Key Findings**
- `backend/setta/mcp/chat_manager.py:1-377` hardcodes Anthropic’s client, message types, thinking configs, and prompt-caching. The streaming loop consumes Anthropic-specific SSE events and feeds those objects straight into the DB and websocket payloads, so nothing else can plug in without rewriting the whole manager.
- The persisted schema in `backend/setta/types/chat_messages.py:5-77` stores actual `anthropic.types` models inside `ChatMessage.content`, and websocket chunks are literal Anthropic `RawContentBlock*` events. Because the DB schema mirrors the SDK’s runtime classes, we can’t deserialize chats without the Anthropic package, and we can’t emit OpenAI-compatible tool call deltas or editor events.
- `backend/setta/mcp/client.py:5-150` exposes tools to the LLM using `anthropic.types.ToolParam`, so even the MCP bridge is tied to Anthropic. Tool invocations always return `ChatMessage` objects pretending to be users, which is incompatible with OpenAI/Portkey’s `{"role": "tool"}` messages.
- The frontend pipeline assumes Anthropic structures end-to-end: `frontend/src/state/actions/ai.ts:101-206` switches on Anthropic chunk types, `ProjectChatCore.tsx:326-420` renders anthropic-only content types (text/thinking/tool_use), and `consolidateAssistantMessages` injects fake `streaming_into_code_block` items. Any difference in stream schema or tool call semantics will break rendering.
- API-key handling is just two inputs wired to `.env` (`frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx:1-59`, `backend/setta/routers/ai.py:85-128`). The UI has a hard-coded Anthropic/OpenAI model list (`frontend/src/utils/constants.ts:138-158`) and no concept of Portkey API keys, provider virtual keys, or per-model routing. The codebase never loads keys automatically (the watcher code in `backend/setta/project_state/base_project_manager.py:1619-1643` is commented out).

**Refactor Plan**
- **Backend LLM abstraction + self-hosted Portkey gateway**
  - Create a `setta/llm` package with a `PortkeyClient` wrapper that maps our own `LLMMessage` and `LLMToolCall` dataclasses to the OpenAI-compatible API exposed by the **self-hosted** Portkey gateway (`npx @portkey-ai/gateway` exposes `client.chat.completions.create(..., stream=True)` and chunk iteration). Because we run the gateway locally, we only need provider keys (OpenAI, Anthropic, etc.)—there is no Portkey cloud API key in this flow.
  - Replace `ChatManager` with an `LLMOrchestrator` that converts stored chats into OpenAI-style `{role, content}` arrays, attaches a tool list, and streams chunks. Handle `choices[0].delta` events (text, `tool_calls[].function.arguments`, `tool_calls[].id`) plus `response.completed` events, and normalize them into backend-defined `LLMStreamEvent` types before broadcasting.
  - Use a pluggable interface so we can later swap Portkey for a different gateway. The orchestrator should own retry/backoff and support cancel tokens for `/stop_llm_chat`.

- **Tool + MCP plumbing**
  - Extend `MCPClient` to expose a Portkey-compatible JSON schema (`{"type": "function", "function": {"name": ..., "parameters": ...}}`) instead of `anthropic.types.ToolParam` so any LLM that speaks OpenAI tool-calls understands our MCP tools (`backend/setta/mcp/client.py` rework).
  - When Portkey streams a tool call delta, accumulate the `arguments` JSON, call `session.call_tool`, and immediately stream back a `tool_output` event with the same tool_call_id. Persist tool outputs as structured objects rather than pretending they are user messages.
  - Keep the bespoke file-editing helpers (`str_replace_editor`, `startStreamingInto`, `stopStreamingInto`, etc.) but expose them to the LLM by registering them in MCP and documenting them in the system prompt.

- **Chat data model + persistence**
  - Redefine `ChatMessage` to store our own `LLMText`, `LLMToolCall`, `LLMToolResult`, and optional `LLMReasoning` blocks rather than Anthropic SDK objects. Migrate or wipe `setta_files/chats/*.json` because backward compatibility isn’t required.
  - Update tests in `tests/project_state/chats/test_chats.py` to create messages through the new schema (no Anthropic import) and re-run `python -m unittest discover`.
  - Introduce conversion helpers so the frontend can request either the normalized history or raw stream events, and make `FullMessageStop` contain plain JSON payloads.

- **Websocket + frontend streaming**
  - Define a backend `LLMStreamEvent` union (message_started, text_delta, tool_call_delta, tool_result, response_completed) and emit only those from `WMHFrontendSender` instead of raw Anthropic events.
  - Rewrite `frontend/src/state/actions/ai.ts` to consume the new event schema, update message state immutably, and stream text into sections only when the delta is `text_delta` and a `streamTarget` is active. This also lets us handle tool call args exactly like the OpenAI schema without string hacks.
  - Refactor `ProjectChatCore.tsx` to render the new normalized message content. Drop Anthropic-only UI such as the reasoning “signature” spinner unless the chosen model returns `thinking`; otherwise show generic tool-call accordions and streaming text blocks.

- **LLM configuration + gateway UX**
  - Replace `MODEL_GROUPS` with a dynamic list returned by the backend. Store self-hosted gateway configuration (gateway URL, provider/model mappings, and the raw provider API keys) in `setta_files/llm_config.json`. No Portkey cloud API key is required.
  - Add routes (e.g., `GET/SET_LLM_CONFIG`, `TEST_LLM_CONFIG`) that read/write this JSON, restart gateway clients, and surface validation errors. Use file-watcher support to push config edits to the frontend so users can edit keys in one place.
  - Redesign `ProjectLLMSettings` to let users add/edit/delete provider configs: fields for display name, model id, provider slug, provider API key, optional base URL/region, etc. Persist changes through the new routes rather than writing `.env` manually.

- **System prompt + instructions**
  - Rewrite `backend/setta/mcp/chat_manager.py:50-54` equivalent so the system prompt references Portkey, clarifies the available MCP tools, and explains the start/stop streaming contract. Because Portkey already supports arbitrary providers (per docs), expose provider/model metadata in the prompt so the LLM knows which tools exist.
  - Revisit the “Deep Thinking” toggle in `ProjectChat.tsx:31-123`. Map it to Portkey parameters (`reasoning`, `temperature`, `max_output_tokens`, etc.) only for models that support it; otherwise disable the switch.

- **Testing, observability, and clean-up**
- Remove `anthropic` from `pyproject.toml` and `uv.lock`, add `portkey-ai`. Add unit tests for the Portkey adapter (mocking the SDK) and integration tests that simulate streaming loops/two tool calls.
- Instrument the orchestrator with structured logs (model, provider, latency, tool latency) and surface failures to the frontend via notifications so users know when an API key or model fails.
- Document the migration in `docs/` (mention new config file, Portkey requirements, and how streaming/tool calls behave) and capture manual verification steps (e.g., `source activate.sh && python -m unittest discover tests`, `pnpm start`, send test chats).

**Progress**
- Deleted the Anthropic-specific `ChatManager` implementation and replaced it with the new `backend/setta/llm/orchestrator.py`, which streams via the (self-hosted) Portkey adapter using a pluggable `LLMGateway` protocol.
- Removed the Anthropic-backed `ChatMessage` schema plus chat persistence helpers/tests so we can redefine neutral message models.
- Dropped the `anthropic` dependency from `pyproject.toml` and `uv.lock`, so the project no longer installs the Anthropic SDK.
- Added `backend/setta/llm/models.py` with neutral `LLMMessage`, content blocks, and `LLMStreamEvent` dataclasses to anchor the new Portkey orchestrator and persistence layers.
- Introduced `backend/setta/llm/portkey_client.py`, which wraps the Portkey SDK and converts streaming chunks into our normalized `LLMStreamEvent` types so downstream orchestrator work can build on a single integration surface.
- Updated `backend/setta/mcp/client.py` to emit OpenAI-compatible `ToolDefinition` objects (via `tool_definition_from_mcp`) so the rest of the stack can consume MCP tools without any Anthropic SDK types.
- Restored `backend/setta/types/chat_messages.py` with the new normalized chat persistence schema that stores only our `LLM*` dataclasses and serializes websocket chunks as backend-defined `LLMStreamEvent` payloads, so persistence/websocket layers now match the Portkey abstraction.
- Wired `backend/setta/mcp/chat_manager.py` into the orchestrator so chats now stream via the normalized models, emitting events over the websocket and persisting the assistant response.
- Hooked the `ChatManager` stream into real MCP tool execution so Portkey `tool_calls` deltas trigger immediate `CallToolResult` invocations, normalized `ToolResultEvent`s are broadcast to the frontend, and the assistant transcript captures structured tool outputs.
- Rewrote `frontend/src/state/actions/ai.ts` to consume the generated `LLMStreamEvent` union, accumulate assistant messages/tool calls via the normalized block types, and push `TextDeltaEvent`s directly into section streaming, clearing out all Anthropic-specific chunk handlers.
- Added `backend/setta/llm/config_store.py` plus `setta_files/llm_config.json` to persist gateway URL + provider/model metadata, establishing the backend source of truth that will replace the frontend’s hard-coded `MODEL_GROUPS`.

Once this scaffolding is in place we can iterate on extras like diff previews for file edits or richer model catalogs, but the items above will fully sever the Anthropic dependency, centralize LLM orchestration around Portkey, and give users the configurable key management UI you asked for.
