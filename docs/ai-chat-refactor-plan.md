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
- Chat persistence now uses the OpenAI-style schema in `backend/setta/types/chat_messages.py`, including explicit assistant, user, system, and tool-role records plus helper methods for LLM payloads. Each chat stores the exact `LLMConfig` (id, model, provider, base URL, env var, params) that generated its transcript.
- The Anthropic chat manager was replaced with `LLMChatManager`, which builds request payloads, runs the streaming completion flow, hydrates streaming sessions, and supports stop requests via asyncio task cancellation.
- Streaming envelopes (`backend/setta/types/chat_stream_events.py`) flow through `WMHFrontendSender` and are consumed by `frontend/src/state/actions/ai.ts`/`ProjectChatCore.tsx`, so the UI now renders text deltas, tool-call deltas, tool results, and finalized messages in real time.
- Streaming delta handling now normalizes provider-specific `thinking_blocks`/`reasoning_content` in one pass and streams entries as they arrive, which keeps the assistant transcript readable even when providers omit indexes or split thinking/text payloads across custom fields.
- Recent bugfixes: assistant messages without tool calls now serialize safely before invoking LiteLLM, and the frontend guards against stale `waitingForResponse` states so second messages no longer disappear when REST responses race with streaming events.
- The `deepThink` toggle now feeds internal heuristics for reasoning support: we bypass LiteLLM’s spotty metadata, recognize OpenAI/Anthropic/Google providers directly, and always emit the thinking blocks/`reasoning_content` stream so the UI shows every vendor’s reasoning traces without manual tweaks.

#### MCP & Tooling
- The MCP registry now flows through dedicated decorators: `setta_init_tool` feeds the boot-time `SETTA_INIT_MCP_TOOLS` list while `setta_tool` feeds the discoverable `SETTA_MCP_TOOLS` registry, and `backend/setta/mcp/client.py` now splits the advertised definitions into init vs discoverable `ChatCompletionToolParam`s that downstream clients can consume directly.
- Tool calls are streamed as deltas, executed via `MCPClient.call_tool`, persisted as `ToolChatMessage`s, and echoed back to the frontend through `ToolResultEvent`s so the UI can render argument progress and results without custom maps.
- `backend/setta/mcp/tools/file_read.py` established the first deterministic helper (`read_file_range`) that uses workspace-aware paths, validation, and consistent JSON output.
- `SettaFastMCP.list_registered_tools()` now exposes the running server's tool metadata, and the existing `search_mcp_tools` MCP helper already consumes it (with a placeholder heuristic) so discovery logic no longer needs another registry layer.
- `search_mcp_tools` now builds a BM25 index (via `bm25s`) for all registered tools when the MCP server starts, tokenizes tool descriptions/parameter metadata once, and serves ranked tool definitions directly from that cache so queries only pay the retrieval cost while still returning full schemas.

#### Config & Persistence
- `backend/setta/types/llm_config.py` defines `LLMConfig`/`AllLLMConfigs`, including `temporary` entries. `merge_chat_llm_configs` injects stored chat configs so `/llm/config` always exposes the providers used by historic chats, and now deduplicates equivalent configs so every chat that used the same provider/model combo no longer spawns another dropdown entry.
- `backend/setta/types/llm_config.py` defines `LLMConfig`/`AllLLMConfigs`, including `temporary` entries. `merge_chat_llm_configs` injects stored chat configs so `/llm/config` always exposes the providers used by historic chats, and now deduplicates equivalent configs so every chat that used the same provider/model combo no longer spawns another dropdown entry. Config ids are now derived exclusively from the JSON keys, and persistence strips redundant inline `id` fields so the config file can’t drift out of sync.
- Dedicated DBE helpers (`read_llm_config`, `write_llm_config`, `read_dot_env`, `write_dot_env`, `reload_dot_env`) now own the persistence and process-environment reloading for both `setta_files/llm_config.json` and `.env`, ensuring JSON validation, file-locking, and `load_dotenv(..., override=True)` semantics live in one place.
- `LLMConfigWatcher` and `DotEnvWatcher` both listen to the DBE-managed paths, fire immediately on startup, reload their respective state into `LLMChatManager`, and broadcast config/API-key snapshots so every client hears about disk edits without polling.
- The frontend Zustand store gained `allLLMConfigs`, API-key state, and the `loadLLMConfig`/`loadLLMApiKeys` actions so UI panes can hydrate from those new routes once invoked.

#### Frontend
- Streaming reducers were rewritten in `frontend/src/state/actions/ai.ts` to handle the new event envelope, assemble assistant messages incrementally, and stream tool-call arguments/results into the store.
- `ProjectChatCore` renders provider-agnostic chat bubbles, tool-call accordions, and a stop button wired to `/stopLLMChat`. Chat selection moved out of global state so panes encapsulate their current chat id and "deep think" toggle.
- Chat creation now keeps the backend as the source of truth for IDs: the frontend submits `null` for brand-new chats, tracks `chatId` across three states (`undefined` pre-send, `null` while pending, string when confirmed), and ignores late responses if the user navigated elsewhere, eliminating the race where a completed request would override a different chat selection.
- Optimistic chat state mirrors pending submissions locally: `pendingChatDetails` stores in-flight user messages, the UI renders those messages plus the response spinner immediately (even before the backend assigns a chat id), and failures automatically roll back the optimistic entry so the transcript never “jumps”.
- The model picker uses data from `allLLMConfigs` (once loaded), hides entries whose API keys are missing, and enforces per-message validation before dispatching `/getLLMResponse`.
- `ProjectChat` and `ProjectLLMSettings` now share a hydration hook that fires `loadLLMConfig()`/`loadLLMApiKeys()` as soon as either pane mounts, so the gating flags flip without requiring a full-app bootstrap.
- The frontend now listens for `LLMConfigUpdated` and `LLMApiKeysUpdated` websocket events so config/API-key edits propagate instantly without manual reloads.

#### Testing
- Added regression tests for assistant message serialization (covering tool-call argument JSON conversion and the tool-call-less path) and refreshed the chat storage tests to assert against real `LLMConfig` instances. Added targeted coverage for `merge_chat_llm_configs` so duplicate chat configs collapse to a single temporary entry. `tests/mcp/test_tool_search.py` now exercises the BM25-backed `search_mcp_tools` helper against realistic tool metadata so discovery regressions are caught locally. The full backend unittest suite now runs cleanly.

### Outstanding Work
#### Backend / LLM Integration
- Thread contextual information (chat id, `projectConfigId`, and any future section metadata) through MCP tool invocations so every tool can reason about the active project/chat without guessing. **Explicitly defer this until later in the refactor so we can focus on the other backend items first, even if tooling stays blind to context for now.**
- Harden config ingestion: reject duplicate IDs or incomplete entries in `/llm/config`, validate referenced API keys, and ensure `merge_chat_llm_configs` never persists `temporary` configs back to disk while still surfacing them to clients.

#### MCP & File Editing
- Build the deterministic write tools (insert-at-line, replace-range, apply unified diff/patch, append, etc.), wrap them with DBE-backed locks/backups, and expose them through MCP so LLMs edit files safely.
- Flesh out tool documentation and JSON schemas so the LLM has enough structure to ground tool-call arguments; `read_file_range` proves the plumbing but still needs richer metadata/examples.
- Expand the MCP surface area beyond the initial file-read helper (e.g., project metadata, search utilities) so LLMs have the context they need before we rely on automated edits.

#### MCP Tool Discovery & Search Plan
1. **Surface the existing tool metadata** – Lean on the new `SETTA_INIT_MCP_TOOLS`/`SETTA_MCP_TOOLS` decorators plus `SettaMCPServer` storage, and expose the already-collected (name, description, schema) data in a normalized OpenAI-style shape for both the SSE server and the LLM client so we avoid building an extra registry layer.
2. **Seed boot tools vs. discoverable tools** – Lightweight primitives (search, `read_file_range`, etc.) now live in `SETTA_INIT_MCP_TOOLS` so they ship with the first LLM request, while the BM25 index and `search_mcp_tools` only traverse `SETTA_MCP_TOOLS` and new matches extend the discoverable list as chats unlock them. The MCP client now exposes both lists of `ChatCompletionToolParam`s so the chat manager can send only the boot set to new LLM requests.
3. **Persist per-chat tool state** – Track which tool definitions each chat has unlocked, include only those definitions in `_build_llm_request_payload`, and hydrate the state when loading chats so reconnections do not lose context. Chat-local tool state now mirrors the boot tools the client exposes, retaining unlocked discoverables per chat (persistence still TBD).
4. **Handle search results** – When the search tool runs, parse its returned definitions, merge them into the chat’s tool state, dedupe by name, and persist the expanded state before the next LLM call.
5. **Document and test** – Search scoring now has unit coverage via `tests/mcp/test_tool_search.py`. Still need tests for the chat-manager tool-state transitions and the summarized tool-result messaging, plus documentation of the discovery flow in this plan (and, later, the MCP README) so future tools register the metadata the search service consumes.

#### Frontend & Config UX
- Replace the static `MODEL_GROUPS`/`C.LLM_API_KEY_NAMES` usage in `ProjectLLMSettings.tsx` with data from `/llm/config` and `/llm/apiKeys`, including forms for provider/model/base URL/api-key env var management. Leveraging the backend schema will also unblock multi-provider support. **Intentionally defer this work until the end of the refactor so we can focus on the chat pipeline first—even if that leaves the existing settings view in a broken state meanwhile.**
- Surface `temporary` configs (those injected from chat history) inside the dropdown/settings, give them a badge such as “from chat history”, and provide an affordance to promote/edit them so users know whether a chat references a transient model.

#### Observability & Testing
- Add backend unit tests around `LLMChatManager` (payload construction, streaming chunk handling, tool-call parsing, cancellation, and MessageDelta emissions) plus failure-path coverage for MCP dispatch.
- Cover the config helpers (`merge_chat_llm_configs`, `_strip_temporary_configs`, load/save flows) and the deterministic MCP tools (`read_file_range` today, write tools later).
- Provide integration or manual smoke tests that exercise end-to-end streaming, MCP tool execution, config reloads, and stop requests so we can gate releases on something stronger than the current targeted MCP unit tests.

## File Editing Strategy
- Defer additional write-capable MCP tools until the new LLM + config plumbing is stable, but keep the target shape in mind: read-range, insert-at-line, replace-range, and apply unified diff are the primitives we will expose.
- Every tool should operate on UTF-8 text, leverage workspace-relative paths, and take explicit start/end offsets instead of “find and replace” guesses. When a tool can’t fulfill its contract it must return a structured error that the LLM can reason about.
- Guard all write operations with DBE locks/backups to prevent corruption, and emit high-signal error events over the WebSocket channel whenever contention or validation failures occur.
