**Guiding Principles**
- This initiative is a full-stack overhaul, not a piecemeal patch. Prefer deleting brittle Anthropic-era code and rewriting around the new abstractions instead of layering compatibility shims.
- Backwards compatibility is explicitly out of scope: wipe or migrate old chat/state files, rip out unused watchers, and restructure modules freely to arrive at a cleaner architecture.
- Favor cohesive modules (e.g., `setta.llm.*`, config stores, orchestrator) even if it means moving large chunks of logic or renaming APIs; the end goal is a maintainable Portkey-first stack.

**Key Findings**
- `backend/setta/mcp/chat_manager.py` still instantiates a bare `PortkeyClient()` and throws away `project_config_id`, so the freshly added `setta_files/llm_config.json`, provider API keys, base URLs, and per-model defaults never influence the orchestrator. The frontend (`frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`) likewise stores only a plain `model_id`, meaning the backend cannot tell which provider or credentials to use when submitting a chat request.
- Streaming lifecycle plumbing remains stubbed out: `request_stop_streaming`, `is_waiting_for_response`, and `get_current_stream` raise `NotImplementedError`, so `/stopLLMChat` and `/getLLMChat` will fail as soon as the UI calls them. The orchestrator cannot be cancelled mid-flight, and partial assistant responses are not surfaced until they are fully persisted.
- Deep-thinking / per-model parameterization is not hooked up. `_build_request_params` returns `None`, the `supports_reasoning` flag inside the config is unused, and there is no `TEST_LLM_CONFIG` or other validation route to ensure the Portkey gateway is reachable with the provided provider keys.
- The backend never reloads runtime state when `setta_files/llm_config.json` changes—the watcher only broadcasts to the UI—so the orchestrator would continue using stale credentials even after the user saves new ones. We also removed the old chat tests (`tests/project_state/chats/test_chats.py`) without replacing them, leaving the new `setta.llm` models, Portkey adapter, and chat persistence flows completely untested.

**Completed So Far**
- **Backend abstraction:** Added `backend/setta/llm/models.py`, `portkey_client.py`, and `orchestrator.py`, replacing Anthropic-specific types with normalized `LLMMessage`, `LLMStreamEvent`, and a pluggable `LLMGateway`. `backend/setta/mcp/chat_manager.py` now streams via the orchestrator and accumulates tool calls/results with structured events.
- **Tool + persistence overhaul:** `backend/setta/mcp/client.py` emits OpenAI-compatible tool definitions, `ChatMessage`/`Chat` in `backend/setta/types/chat_messages.py` now persist neutral content blocks, and websocket payloads send serialized `LLMStreamEvent`s instead of Anthropic SDK objects. Tool results are broadcast immediately and stored as `LLMToolResultBlock`s.
- **Frontend event pipeline:** `frontend/src/state/actions/ai.ts`, `ProjectChatCore.tsx`, and related helpers consume the new message_started/text_delta/tool_call/tool_result events, push deltas into code/text sections via `streamInto`, and drop all Anthropic chunk handling and fake blocks.
- **Gateway config UX:** Introduced `backend/setta/llm/config_store.py`, `config_watch.py`, and `backend/setta/types/llm_config.py`, plus GET/SET routes in `backend/setta/routers/ai.py`. The frontend exposes the Config editor (`ProjectLLMSettings.tsx`), listens for `LLMConfigUpdated` websocket events, and surfaces provider/model presets via `backend/setta/llm/presets.py` and the new `GET_LLM_PRESETS` endpoint. `.env`-based API-key plumbing and hard-coded `MODEL_GROUPS` were removed in favor of the persisted JSON config.
- **Baseline cleanup:** Removed noisy debug prints from `/getLLMResponse`, trimmed websocket console spam, and taught the AI store to clear stale `userSelectedLLM` values whenever the config drops a model so the UI never references deleted entries after a save.
- **Server wiring:** `SettaFastAPIState` now loads `llm_config.json`, keeps the parsed `LLMConfig` on the app state, and injects it into `ChatManager`, which spins up the `PortkeyClient` targeting the configured gateway URL. The next steps are to thread provider/model selections and keys into that orchestrator path.
- **Provider-aware chat selection:** `/getLLMResponse` now requires a `{ providerId, modelId }` payload, `ChatManager` accepts the structured selection, and the legacy plain `model` string has been removed so future work can locate provider credentials.

**Remaining Work**
- **Wire the LLM config into orchestration**
  - Load `LLMConfig` when building `SettaFastAPIState`, pass it to `ChatManager`, and construct `PortkeyClient`s with the provider’s API key, base URL, headers, and `default_parameters`. Persist a mapping from chat requests to `{provider_id, model_id}` instead of the current plain string so the backend can locate the right credentials.
  - Honor `project_config_id` when we eventually scope configs per project, and use `default_model_id` to preselect a model when loading the UI.
  - Subscribe `ChatManager` to the `register_llm_config_watch` callback so it refreshes its cached config / gateway client whenever `llm_config.json` changes, not just when the frontend reloads.

- **Streaming lifecycle + cancellation**
  - Track in-flight assistant tasks per `chat_id`, buffering incremental `LLMMessage`s so `get_current_stream` and `is_waiting_for_response` can answer immediately and `/getLLMChat` no longer hits `NotImplementedError`.
  - Teach `request_stop_streaming`/`route_stop_llm_chat` how to cancel the asyncio task and propagate cancellation to the Portkey stream so the UI stop button works.
  - Persist partial assistant blocks (and pending tool calls) when cancellation or errors occur so we do not lose work between retries.

- **Deep-thinking and request parameters**
  - Make `ChatManager._build_request_params` respect the `deepThink` flag only for models whose config declares `supports_reasoning`, and merge each model’s `default_parameters` into the Portkey payload.
  - Surface validation/health data: add a `Route.TEST_LLM_CONFIG` endpoint that pings the configured gateway/providers, return structured errors, and show the status next to provider cards in `ProjectLLMSettings`.

- **Frontend follow-ups**
  - Update `ProjectChat.tsx` / the AI store so selections carry provider + model identifiers (and maybe display names), disable the “Send” button until a valid selection exists, and auto-pick each provider’s `default_model_id` after a config save.
  - Use the `supports_reasoning` flag to drive the Deep Thinking toggle (disable it for models that do not support reasoning, and show why).
  - Show inline errors / toast notifications when `loadLLMConfig` or `saveLLMConfig` fail, and surface the upcoming `TEST_LLM_CONFIG` results so users know whether the gateway is reachable.

- **Testing, docs, and cleanup**
  - Replace the deleted `tests/project_state/chats/test_chats.py` with new suites that cover `setta.llm` serialization, Portkey chunk normalization (mocking the SDK), MCP tool execution, and chat persistence round-trips (`python -m unittest discover tests`).
  - Document the new config file + Portkey gateway workflow in `docs/`/`README`, including manual verification steps (e.g., start the self-hosted gateway, run `pnpm start`, send a chat, verify tool streaming).
  - Remove remaining `.env`-centric constants/watchers once the config-driven flow is live, and add structured logging around `LLMOrchestrator` so failures (invalid API key, tool errors) are visible to both logs and frontend notifications.

Progress on the items above will fully activate the Portkey-powered stack: the UI already edits `setta_files/llm_config.json`, and the backend now has neutral LLM models, so wiring those configs into the orchestrator, cancelation flow, and validation/tests are the last major blockers.
