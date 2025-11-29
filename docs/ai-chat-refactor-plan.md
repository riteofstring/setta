# AI/Chat/MCP Refactor Plan (LiteLLM-first)

## Goals
- Support any LLM via `litellm` (local or remote), including streaming tokens and streaming tool calls.
- Frontend chat UI consumes provider-agnostic streaming events and can drive Setta via MCP tools.
- Robust text/file editing tools (read ranges, apply patch, insert/replace) to modify project files accurately.
- Modern provider/key/config UI (multi-provider, base URLs, env-var storage).
- Drop Anthropic-only assumptions; no backward compatibility required.

## Current Issues
- Backend is hard-wired to Anthropic types/events and caches (`AsyncAnthropic`, `Raw*Event`), and stores Anthropic content blocks in chat records.
- WebSocket payloads and frontend reducers assume Anthropic streaming event shapes.
- MCP layer is thin: only two Python tools, plus an Anthropic-specific text editor shim; TS “@SETTA_MCP_TOOL” helpers aren’t wired to the MCP server.
- File-edit tooling is brittle (string replace) and not schema-validated.
- Model/API key UX is Anthropic/OpenAI-only; `apiKeysInitialLoadComplete` never flips; no base_url or per-provider config.

## Proposed Architecture
- **LLM client**: New `litellm`-backed service with OpenAI-compatible message/tool_call schema. Single entry point handles chat, streaming, tool calls, and provider params (temperature, max_tokens, reasoning/thinking when supported).
- **Chat session layer**: Owns chat metadata, persistence, and merging with in-flight streams. Stores provider-agnostic message structures (role/content, tool_calls, tool_results).
- **Transport**: WebSocket streaming with a compact event envelope (`message_start`, `delta`, `tool_call_delta`, `tool_result`, `message_stop`, `message_finalized`) independent of Anthropic.
- **MCP/tool router**: Keep MCP wiring lightweight by exposing a simple global `SETTA_MCP_TOOLS` list/decorator while the MCP server stays responsible for discovery, JSON schemas, and ID↔UUID translation wrappers. LiteLLM tool calls should always be bridged through our running MCP client (`MCPClient.call_tool`) instead of resolving Python callables directly; the MCP session already knows every registered tool by name and can route requests for us.
- **File edit pipeline**: Deterministic tools: read-range, apply unified diff/patch, insert-at-line, replace-range. Use DBE locks/backups to avoid corruption.
- **Config layer**: Backend endpoints for listing/saving LLM configs (provider, model id, base_url, api_key env var name); frontend UI to manage multiple providers and select model per chat.

## Backend Changes
- Replace `ChatManager` with `LitellmChatManager`:
  - Map Setta chat history to `litellm.acompletion(..., stream=True, tools=...)`.
  - Normalize responses (OpenAI-like deltas) and emit streaming events via WebSocket.
  - Handle tool calls: parse `tool_calls`, route to MCP, stream tool results back.
  - Persist final messages and tool results in provider-agnostic format; drop Anthropic-specific caches/thinking blocks unless mapped to provider params.
- Redefine chat schemas (`backend/setta/types/chat_messages.py`) to OpenAI-style messages, tool_calls, and tool_results. Migrate DB read/write accordingly; allow wiping old chats.
- Redesign WebSocket payloads to new event types and update `WMHFrontendSender`.
- Keep MCP tool registration lightweight: expose core tools through the global `SETTA_MCP_TOOLS` list/decorator and let the MCP server keep handling schema generation plus Setta state/UUID translation wrappers. LiteLLM tool calls should proxy through `MCPClient.call_tool` (which already routes by name) rather than a bespoke registry/lookup in the chat manager.
- Remove/replace Anthropic text editor shim; rely on our patch/insert tools.
- Add config endpoints: list/save LLM providers/models, read/write API keys from `.env` (name/value), list available models (optional static list or litellm config).

## Frontend Changes
- Update streaming handling in `state/actions/ai.ts` and `websocketReceive.ts` to consume new event shapes (text deltas, tool_call deltas, tool_results, finalized message).
- Simplify chat state: provider-agnostic message model; handle tool call display and result insertion.
- Chat UI: show active tool calls, streamed text, and final messages; support stop request.
- Settings UI: manage multiple providers/models/base URLs and API keys; remove `apiKeysInitialLoadComplete` gate; allow per-chat model selection.
- Remove Anthropic-only model lists; pull models from config or static curated sets per provider.

## MCP/Tooling Enhancements
- Solidify TS “@SETTA_MCP_TOOL” story: either remove or reimplement as generated MCP tools from frontend helpers (if needed), but primary tooling keeps flowing through the backend `SETTA_MCP_TOOLS` list.
- Provide clear tool docs/descriptions for better LLM grounding.
- Ensure tool call arguments/returns are JSON-serializable and validated.

## File Editing Strategy
- Defer implementing new write-capable MCP tools until the rest of the AI/chat refactor is stable; the existing `read_file_range` tool is sufficient for interim testing.
- Prefer structured operations: read-range, insert-at-line, replace-range, apply unified diff.
- For streaming inserts into sections, reuse `start/stop` streaming semantics but backed by shared patch utilities.
- Guard writes with DBE locks; emit errors clearly to the LLM if conflicts occur.

## Data & Compatibility
- No backward compatibility required: acceptable to drop existing Anthropic-formatted chat history or migrate by best-effort if trivial.
- Remove unused Anthropic/Portkey artifacts once the new path is stable.

## Testing & Verification
- Backend unit tests: litellm client (stream/non-stream, tool calls), MCP tool schema validation, file-edit operations, chat persistence merge logic.
- Manual/CLI checks: end-to-end stream with tool call, file edit via tool, stop request handling.
- Keep `python -m unittest discover` as the backend test entry point.

## Milestones
1) Backend core: new chat schemas, litellm client, streaming events, MCP tool list + essential tools.  
2) Frontend streaming/UI: wire new event shapes, update chat components, tool call display.  
3) Config UI: provider/model/key management; per-chat model selection.  
4) File-edit robustness: patch/insert tools, locks, error surfacing; remove Anthropic editor shim.  
5) Cleanup + tests: drop old Anthropic codepaths, add tests and manual checklist.

## Progress
- ✅ Standardized chat persistence to the new OpenAI-style schema in `backend/setta/types/chat_messages.py`, including `ChatMessage.to_openai_format()` so LiteLLM always serializes messages/tool calls/image blocks from a single source of truth.
- ✅ Added the `litellm` dependency plus `backend/setta/llm/config.py`, and swapped the Anthropic `ChatManager` for `backend/setta/llm/litellm_chat_manager.py`, so all router entry points talk to the new manager/persistence stack.
- ✅ Built typed streaming envelopes in `backend/setta/types/chat_stream_events.py`, rewired the WebSocket sender, and updated `frontend/src/state/actions/ai.ts` to consume `message_start`/`delta`/`tool_call_delta` events while assembling assistant messages in the Zustand store.
- ✅ Implemented the LiteLLM streaming scaffolding (`ToolCallStreamState`, `_handle_text_deltas`, `_handle_tool_call_deltas`, `StreamingSession`) and bridged tool calls through `MCPClient.call_tool`, so streamed tool metadata is parsed and ready for MCP dispatch even though downstream wiring is still in progress.
- ✅ Fixed `_handle_text_deltas` so it no longer returns before emitting `MessageDeltaEvent` updates, restoring incremental assistant text streaming over the WebSocket transport.
- ✅ Replaced the bespoke MCP registry with the `SETTA_MCP_TOOLS` decorator, imported the MCP tools package from `server.py`, and introduced the tested `read_file_range` helper as the first deterministic building block for future file-edit tooling.
- ✅ Wired `/getLLMResponse`, `/getLLMChat`, and `/stopLLMChat` to the new Litellm manager by implementing waiting-state helpers, exposing the in-flight assistant message, and launching/cancelling per-chat asyncio tasks instead of opaque `BackgroundTasks`, so the frontend can hydrate active streams and stop them without 500s.
- ✅ Removed the ad-hoc `ChatMessage.metadata` blob so tool outputs and error flags will be modeled explicitly (via `role="tool"` messages) rather than smuggling data through untyped dicts.
- ✅ Swapped `MCPClient.available_tools` to native MCP `Tool` objects and inject them into the LiteLLM payload as OpenAI-style tool definitions, so models can finally emit structured tool calls.
- ✅ Broke the legacy `ChatMessage` model into `SystemChatMessage`, `UserChatMessage`, `AssistantChatMessage`, and `ToolChatMessage`, regenerated the discriminated unions, and synced the TS helpers so persistence, routers, and Litellm streaming all share the same typed schema.
- ✅ Broadcast MCP tool completions as `ToolResultEvent`s directly from `_dispatch_tool_call`, so every tool call now pushes a structured result over the websocket while still being persisted as `ToolChatMessage`s.
- ✅ Deleted the frontend-only `startStreamingInto`/`stopStreamingInto` shim and its UI hooks so future file editing must flow through backend MCP tools instead of mutating local state only.
- ✅ Dropped the bespoke frontend `toolResults` map and `/getLLMChat` filtering so `ToolChatMessage`s now live inline in both the backend and frontend chat history; the UI renders assistant tool calls (plus streamed argument deltas) without extra state.
- ✅ Registered `read_file_range` with `@setta_tool` so it flows through `SETTA_MCP_TOOLS` and is discoverable by LiteLLM/MCP clients without relying on Anthropic-era shims.
- ✅ Rebuilt the LiteLLM config layer with Pydantic models (`backend/setta/types/llm_config.py`), centralized provider resolution + payload building, and updated `LitellmChatManager` to consume those helpers so future CRUD endpoints can just read/write structured provider dictionaries.
- ✅ Added an `LLMConfigWatcher` that hooks into the existing file watcher stack, hot-reloads `setta_files/llm_config.json` inside `LitellmChatManager`, and surfaces validation errors over the websocket so backend/front stay aligned without a restart.
- ✅ Exposed `/llm/config` + `/llm/apiKeys` FastAPI routes backed by `SettaAPIRouter`, so the frontend can manage provider configs and `.env` secrets without touching the Anthropic-era endpoints; the old `/setLLMApiKeys` handler and helper were deleted.
- ✅ Hydrated the Zustand AI store with `llmConfig`, load/error flags, and the new `loadLLMConfig`/`loadLLMApiKeys` actions so the frontend can fetch provider metadata and `.env` secrets from the new LiteLLM endpoints.

## Remaining Work

### Backend / LiteLLM integration
- Thread contextual args (e.g., `setta_chat_id`, `projectConfigId`) through MCP tool invocation so each call knows which chat/project it belongs to once LiteLLM requests a tool. Defer this until every other refactor task in this plan is complete so we only wire the final data shapes once.
- `deepThink` and `projectConfigId` parameters are ignored. Decide how they map to LiteLLM settings or MCP context and thread them through the request payload/tool arguments.
- `setta_files/llm_config.json` can be read/written via `load_litellm_config`, but there is no router exposing it. Add CRUD endpoints (and validation) so the frontend can manage provider/model/base_url/api-key-env selections.

### MCP tools & file editing
- Deterministic write operations (`insert`, `replace`, `apply_patch`, locking/backups) from the “File Editing Strategy” section are still unimplemented. We will defer these until the other refactor tasks are complete, then build them as MCP tools so LLMs can edit real files through vetted operations.
- Provide richer tool metadata: JSON schemas/descriptions are still minimal, making it hard for LiteLLM to ground requests.
- Make sure LiteLLM discovers tools through the MCP client rather than assuming hard-coded helpers—`MCPClient.available_tools` is ready but currently unused.

### Frontend / chat UI
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` wraps the entire pane in `apiKeysInitialLoadComplete && (…)`, but `apiKeysInitialLoadComplete` is never flipped anywhere in `frontend/src/state/definitions.ts`. The chat UI never renders until we hydrate API keys or remove that gate.
- The model picker and settings UI still rely on the static `MODEL_GROUPS` constant and hard-coded API key names; there is no surface for provider/base URL/model config or per-chat persistence. Hook these views up to the `/llm/config` endpoints instead of static data.
- Add a UX affordance (e.g., inline banners or alerts) for tool failures plus a stop button that calls `/stopLLMChat` now that the backend exposes cancellation.
- Chat history waits on backend `waitingForResponse` flags, but those values are never returned because the chat manager doesn’t track them yet. Once backend support exists, plumb the data into the history list/spinners.

### Configuration & API keys
- `loadLLMApiKeys` and `loadLLMConfig` exist but still need to run automatically (and receive watcher pushes/websocket broadcasts) so the Zustand store hydrates on startup instead of depending on manual button clicks.
- The backend now exposes `/llm/config`, but we still need frontend listeners (and ideally websocket broadcasts) so the UI consumes the hot-reloaded config instead of static `MODEL_GROUPS` data — the new Zustand fields are ready, they just need to be wired into the settings panes/model pickers.
- Persist per-chat provider/model selections server-side (or at least fetch defaults from the backend) so reloads keep context; `userSelectedLLM` is currently a client-only string.

### Testing & verification
- Add backend unit tests for `LitellmChatManager`: payload construction, streaming chunk handling, `MessageDeltaEvent` emission, tool call argument parsing, session cancellation, and WebSocket dispatch. None exist today.
- Add integration coverage (or a documented manual checklist) for end-to-end LiteLLM streaming with MCP tools, file-edit operations, and config persistence. Right now the only automated exercise is `tests/mcp/test_file_read_tool.py`.
