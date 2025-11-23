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
- ✅ Replaced `backend/setta/types/chat_messages.py` with OpenAI-style message/tool schemas and a provider-agnostic streaming envelope (breaking Anthropic Raw* usage so downstream layers can now be refactored).
- ✅ Added `litellm` as a backend dependency and introduced `backend/setta/llm/config.py`, which reads/writes `setta_files/llm_config.json` with model/provider/base_url/api-key-env defaults so the new chat manager has a file-driven source of truth.
- ✅ Deleted the Anthropic-specific `ChatManager` and replaced it with the new `backend/setta/llm/litellm_chat_manager.py` entry point, so upcoming work can build the litellm streaming/tool-call pipeline without legacy shims (methods fail fast until implemented).
- ✅ Rewired chat persistence helpers/tests to the new message schema and hooked `LitellmChatManager` to them, so chats can now be created, appended, listed, and deleted without any Anthropic-only assumptions.
- ✅ Expanded the LiteLLM config surface to a typed dict and taught `LitellmChatManager` how to serialize stored chat/tool data into the OpenAI-compatible payload (`messages`, `tool_calls`, `image_url` blocks, env-var API keys, provider params). This unlocks end-to-end request construction once streaming is implemented.
- ✅ Shifted OpenAI payload serialization into `ChatMessage.to_openai_format()` and updated `image_url` content to the nested shape, allowing `LitellmChatManager` to consume the schema directly without bespoke helper functions.
- ✅ Implemented the initial LiteLLM streaming loop in `LitellmChatManager.process_query`, emitting provider-agnostic `message_start`/`message_delta`/`message_stop`/`message_finalized` events while persisting the assembled assistant message (tool-call deltas still pending).
- ✅ Extended the LiteLLM streaming loop to process tool-call deltas: chunks now populate assistant `tool_calls`, emit `tool_call_delta` events, and persist parsed arguments so MCP routing can be layered in next.
- ✅ Split streaming text handling into `_handle_text_deltas` to mirror `_handle_tool_call_deltas`, keeping the manager aligned with the new event model.
- ✅ Dropped the bespoke MCP tool registry in favor of a global `SETTA_MCP_TOOLS` list + decorator (kept lightweight inside `backend/setta/mcp/tool_setup.py`), keeping the MCP server as the sole source of truth for discovery and schema exposure.
- ✅ Introduced `backend/setta/types/chat_stream_events.py` as the single source for streaming event/delta models plus the `LLMStreamingResponse` envelope, and rewired the LiteLLM chat manager + WebSocket sender/types to consume it so no legacy Anthropic payload wrappers remain.
- ✅ Added the first structured MCP tool (`read_file_range`) with workspace-scoped streaming reads plus unit tests, clearing out the Anthropic string-replace shim so upcoming LiteLLM tool calls have a deterministic file-read primitive.
- ✅ Added `StreamingSession` tracking inside `LitellmChatManager`, enforcing that LiteLLM streams expose `CustomStreamWrapper` handles, registering session state for each chat, and cleaning up bookkeeping after completion so stop/waiting APIs can build on real session data.
