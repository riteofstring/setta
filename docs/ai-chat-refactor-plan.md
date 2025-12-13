# AI/Chat/MCP Refactor Plan (LLM-first)

## Goals
- Support every provider we care about through the shared LLM client, including streamed deltas and streamed tool calls.
- Keep chat persistence, transport, and UI agnostic to vendor-specific payloads.
- Route all automated edits through deterministic MCP tools so Setta can apply file changes safely.
- Offer a modern settings experience for multiple providers, models, base URLs, and API-key storage.
- Embrace the new architecture; no backward compatibility with the Anthropic stack is required.

## Strategy & Architecture
- **LLM client** – `backend/setta/llm/llm_chat_manager.py` is the single entry point for chat, streaming, tool calls, cancellation, and per-chat parameter overrides. It always speaks the OpenAI-style schema so any supported provider fits.
- **Chat session & persistence** – Chats store provider-agnostic message structures (`System|User|Assistant|ToolChatMessage`) plus the exact `LLMConfig` that produced them. Streaming sessions merge in-flight deltas with persisted history before returning data to the frontend.
- **Transport** – WebSocket payloads are normalized to a compact envelope (`MessageStart`, `MessageDelta`, `ToolCallDelta`, `ToolResult`, `MessageStop`, `MessageFinalized`) so the frontend reducer never has to care about the upstream vendor.
- **MCP & tool routing** – Python tools register through the global `SETTA_MCP_TOOLS` decorator, the MCP server advertises schemas/IDs, and LLM tool calls are bridged via `MCPClient.call_tool` so every invocation flows through the same audited channel.
- **File editing pipeline** – We will grow a deterministic library of read/insert/replace/apply_patch operations that acquire DBE locks, validate schema expectations, and emit structured errors back to the LLM when conflicts occur.
- **Configuration UX** – Provider/model/base-url/api-key data lives in `setta_files/llm_config.json` and `.env`. The backend exposes CRUD routes plus a watcher so the frontend can manage configs, promote temporary entries, and pick a model per chat.

## Current Status

### Completed Work
#### Backend + Streaming
- Chat persistence now stores OpenAI-style message types plus resolved config snapshots via `backend/setta/types/chat_messages.py` and `backend/setta/project_state/chats/save.py`, so each transcript carries the provider/model/base-url/api-key metadata that produced it.
- `backend/setta/llm/llm_chat_manager.py` owns the streaming lifecycle: `_build_llm_request_payload` normalizes stored messages, `process_query` drives `litellm.acompletion`, `_handle_text_deltas`/`_handle_tool_call_deltas` merge streaming chunks, task cancellation flows through `request_stop_streaming`, and `route_get_llm_chat` merges persisted history with `get_current_stream()` before responding.
- Transport is standardized through `backend/setta/types/chat_stream_events.py` and `WMHFrontendSender.send_streaming_response`; `frontend/src/state/actions/ai.ts` together with `ProjectChatCore.tsx` rebuild assistant bubbles, tool-call accordions, and stop-button state from `MessageStart`, `MessageDelta`, `ToolCallDelta`, `ToolResult`, `MessageStop`, and `MessageFinalized` events.
- Reasoning support lives in `_collect_stream_entries`/`_iter_thinking_payloads`, which fold provider-specific `thinking_blocks` or `reasoning_content` into deterministic thinking deltas, `_should_persist_partial_message` so cancellations still save meaningful drafts, and `_apply_request_overrides`, which only enables the `deepThink` high-reasoning flag for supported OpenAI/Anthropic/Google families.

#### MCP & Tooling
- `backend/setta/mcp/tool_setup.py` now distinguishes always-on vs discoverable tools, `SettaFastMCP` registers them with UUID transforms, builds a bm25 `ToolSearchIndex`, and `MCPClient._update_tool_cache` caches matching `ChatCompletionToolParam`s so `LLMChatManager` can append init tools or newly unlocked ones to each request.
- `backend/setta/mcp/tools/project_state_registry.py` exposes `@project_state_tool`, and `backend/setta/project_state/base_project_manager.py` now decorates `set_section_sizes` plus the init-only `get_latest_project_state` so we already exercise the deterministic MCP bridge with real project mutations.
- `search_and_unlock_mcp_tools` indexes tool names/descriptions/parameter docs (see `tests/mcp/test_tool_search.py`), `list_mcp_tools` enumerates every registered tool name for quick discovery, and `LLMChatManager._build_search_tool_chat_message` parses the JSON payload, updates the chat-local `ChatToolState`, and summarizes which tool definitions were added to the session.
- Deterministic helpers now live under `backend/setta/mcp/tools/`, including the workspace-aware `read_file_range` (with direct coverage in `tests/mcp/test_file_read_tool.py`) plus legacy utilities such as `getInstalledPythonPackages` and `getTerminalOutput`. Tool-call deltas stream through `ToolCallDeltaEvent`, and executions route through `MCPClient.call_tool` before persisting `ToolChatMessage`s.
- Tool-call arguments/results stored in chat history now re-use the canonical→temporary map before serialization, and the ID conversion helpers handle deeply nested Pydantic models (see `tests/mcp/test_id_conversion.py`) so both the LLM and UI only ever see the temporary integer identifiers.

#### Config & Persistence
- `backend/setta/types/llm_config.py` enforces ids derived from JSON keys, while `merge_chat_llm_configs` deduplicates chat history into temporary configs and `save_llm_config` sanitizes writes (dropping inline ids and temporary entries) before `DBE.write_llm_config` persists canonical JSON.
- `DBE` now provides locked helpers for `llm_config.json` and `.env`, and dedicated watchers (`LLMConfigWatcher`, `DotEnvWatcher`) reload configs/API keys into `LLMChatManager`, emit websocket updates, and fire immediately on startup.
- `filter_env_vars_for_config` trims the process env down to the keys referenced by the current configs, so REST routes and `LLMChatManager` only expose populated keys and avoid leaking unrelated environment variables.

#### Frontend
- `useAIStore` tracks configs, API keys, per-chat details, pending chats, and tool-call argument buffers; `state/actions/ai.ts` handles REST calls (`route_get_llm_response`, `/stopLLMChat`, `/llm/*`), optimistic user messaging, reducer updates for each streaming event, and reconciliation of tool results.
- `ProjectChat.tsx` wires chat creation/history toggles, the deep-think control, and a provider-grouped combobox that filters configs whose `api_key_env` is not currently loaded, keeping chat selection scoped to the pane.
- `ProjectChatCore.tsx` fetches chat history on demand, keeps pending chats inside `pendingChatDetails`, reuses the shared reducer state, and drives `ChatInput`, whose stop button maps to `route_stop_llm_chat` while submissions call `submitMessage` with the selected config id.
- `useHydrateLLMState` plus the websocket handler in `state/actions/websocketReceive.ts` keep configs/API keys synchronized for both `ProjectChat` and `ProjectLLMSettings`, so dropdowns and previews update as soon as watchers or API responses change.

#### Testing
- Chat serialization and storage are covered by `tests/types/test_chat_messages.py` and `tests/project_state/chats/test_chats.py`, ensuring assistant payloads convert tool-call arguments to JSON and chat persistence deduplicates message ids.
- Config logic is validated in `tests/llm/test_config.py`, which exercises `merge_chat_llm_configs`, AllLLMConfigs validation, and sanitized writes via `save_llm_config`/`load_llm_config`.
- MCP helpers have direct coverage in `tests/mcp/test_file_read_tool.py` and `tests/mcp/test_tool_search.py`, and `tests/test_llm_chat_manager_streaming.py` verifies the thinking-delta fallback logic used when providers omit indexes.

### Outstanding Work
#### Backend / LLM Integration
- `_dispatch_tool_call` now injects the chat id and `projectConfigId` for every tool invocation, but we still need a structured way to attach richer context (selected section ids, code bindings, etc.) once the frontend surfaces that data so write-capable tools know exactly which project entities they should touch.
- Config writes currently accept whatever `/llm/config` or `/llm/apiKeys` payloads provide. Duplicate ids are now prevented by validation, but we still need to validate the referenced API keys/URLs, surface actionable errors, and tighten the REST responses instead of silently truncating bad data.

#### MCP & File Editing
- Only read/search-style tools exist today. We still need deterministic write primitives (insert-at-line, replace-range, apply unified diff/patch, append, etc.) that acquire DBE locks/backups, validate offsets, and return structured errors.
- Tool docstrings and schemas exist but remain thin; we should flesh out descriptions/examples so the LLM can ground arguments without hallucinating.
- Expand the MCP surface area beyond file-read/package/terminal helpers (e.g., project metadata and search utilities) so LLMs have the context they need before we rely on automated edits.

#### MCP Tool Discovery & Search Plan
1. **Surface the existing tool metadata (complete)** – Decorators plus `SettaFastMCP` already expose name/description/schema payloads in OpenAI form for both SSE clients and the LLM adapter.
2. **Seed boot tools vs. discoverable tools (complete)** – `SettaFastMCP` labels init vs discoverable tools, `MCPClient` caches both lists, and `LLMChatManager` includes only the init set until search unlocks more.
3. **Persist per-chat tool state (partially complete)** – Runtime `ChatToolState` objects now remember unlocked definitions for the lifetime of the process, but we still need to serialize those lists with each chat and hydrate them when the server restarts so search results survive reconnects.
4. **Persist unlocked search results (todo)** – Save the chat-local tool list (including newly discovered entries) so reloading a chat or restarting the server keeps the same discoverable tool set without re-running search.
5. **Document and test (todo)** – Search scoring has coverage, but we still need tests for the chat-manager tool-state transitions, the summarized tool-result messaging, and docs (plan + MCP README) so future tools provide the metadata the search service consumes.

#### Frontend & Config UX
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx` still relies on static `MODEL_GROUPS`/`C.LLM_API_KEY_NAMES` and only edits API keys. We need real forms powered by `/llm/config` + `/llm/apiKeys` so users can add/edit providers, models, base URLs, env vars, and other params. (Still intentionally deferred until the chat pipeline stabilizes.)
- Neither the dropdown nor settings pane surface the `temporary` flag from `merge_chat_llm_configs`, so users cannot see which configs came from chat history or promote them into durable entries.

#### Observability & Testing
- `tests/test_llm_chat_manager_streaming.py` only covers the thinking-delta collection helper. We still need targeted tests for payload construction, chunk handling, tool-call parsing, cancellation, MessageDelta emissions, and MCP dispatch error paths.
- Config helpers (`_strip_temporary_configs`, watcher reload flows) and the deterministic MCP tools we add next still need coverage, along with regression tests for chat-tool state persistence once it lands.
- Provide integration or documented manual smoke tests that exercise end-to-end streaming, MCP tool execution, config reloads, and stop requests so we can gate releases on something stronger than the current targeted MCP tests.

## File Editing Strategy
- Defer additional write-capable MCP tools until the new LLM + config plumbing is stable, but keep the target shape in mind: read-range, insert-at-line, replace-range, and apply unified diff are the primitives we will expose.
- Every tool should operate on UTF-8 text, leverage workspace-relative paths, and take explicit start/end offsets instead of “find and replace” guesses. When a tool can’t fulfill its contract it must return a structured error that the LLM can reason about.
- Guard all write operations with DBE locks/backups to prevent corruption, and emit high-signal error events over the WebSocket channel whenever contention or validation failures occur.
