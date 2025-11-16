**Guiding Principles**
- This initiative is a full-stack overhaul, not a piecemeal patch. Prefer deleting brittle Anthropic-era code and rewriting around the new abstractions instead of layering compatibility shims.
- "No backwards compatibility" refers to the legacy Anthropic stack: we can break old chats/config formats or delete unused code without worrying about old consumers, but the new Portkey paths can evolve freely without temporary bridges to the old world.
- Favor cohesive modules (e.g., `setta.llm.*`, config stores, orchestrator) even if it means moving large chunks of logic or renaming APIs; the end goal is a maintainable Portkey-first stack.

**Key Findings**
- Streaming cancellation now works end-to-end, but partial assistant/tool-call buffers are still ephemeral—if the backend crashes mid-stream we lose those deltas because they are not persisted anywhere outside the active task.
- Deep-thinking / per-model parameterization is not hooked up. `_build_request_params` returns `None`, the `supports_reasoning` flag inside the config is unused, and there is no `TEST_LLM_CONFIG` or other validation route to ensure the Portkey gateway is reachable with the provided provider keys.
- The backend never reloads runtime state when `setta_files/llm_config.json` changes—the watcher only broadcasts to the UI—so the orchestrator would continue using stale credentials even after the user saves new ones. We also removed the old chat tests (`tests/project_state/chats/test_chats.py`) without replacing them, leaving the new `setta.llm` models, Portkey adapter, and chat persistence flows completely untested.

**Completed So Far**
- **Backend abstraction:** Added `backend/setta/llm/models.py`, `portkey_client.py`, and `orchestrator.py`, replacing Anthropic-specific types with normalized `LLMMessage`, `LLMStreamEvent`, and a pluggable `LLMGateway`. `backend/setta/mcp/chat_manager.py` now streams via the orchestrator and accumulates tool calls/results with structured events.
- **Tool + persistence overhaul:** `backend/setta/mcp/client.py` emits OpenAI-compatible tool definitions, `ChatMessage`/`Chat` in `backend/setta/types/chat_messages.py` now persist neutral content blocks, and websocket payloads send serialized `LLMStreamEvent`s instead of Anthropic SDK objects. Tool results are broadcast immediately and stored as `LLMToolResultBlock`s.
- **Frontend event pipeline:** `frontend/src/state/actions/ai.ts`, `ProjectChatCore.tsx`, and related helpers consume the new message_started/text_delta/tool_call/tool_result events, push deltas into code/text sections via `streamInto`, and drop all Anthropic chunk handling and fake blocks.
- **Gateway config UX:** Introduced `backend/setta/llm/config_store.py`, `config_watch.py`, and `backend/setta/types/llm_config.py`, plus GET/SET routes in `backend/setta/routers/ai.py`. The frontend exposes the Config editor (`ProjectLLMSettings.tsx`), listens for `LLMConfigUpdated` websocket events, and surfaces provider/model presets via `backend/setta/llm/presets.py` and the new `GET_LLM_PRESETS` endpoint. `.env`-based API-key plumbing and hard-coded `MODEL_GROUPS` were removed in favor of the persisted JSON config.
- **Baseline cleanup:** Removed noisy debug prints from `/getLLMResponse`, trimmed websocket console spam, and taught the AI store to clear stale `userSelectedLLM` values whenever the config drops a model so the UI never references deleted entries after a save.
- **Server wiring:** `SettaFastAPIState` now loads `llm_config.json`, keeps the parsed `LLMConfig` on the app state, and injects it into `ChatManager`, which spins up the `PortkeyClient` targeting the configured gateway URL. The next steps are to thread provider/model selections and keys into that orchestrator path.
- **Provider-aware orchestration:** `ChatManager.process_query` resolves `{providerId, modelId}` via `resolve_model_selection`, builds a provider-scoped `PortkeyClient` that carries API keys/base URLs/extra headers/default parameters, and streams each response with the concrete model ID instead of the legacy plain string.
- **Provider-scoped Portkey clients:** `ChatManager` now caches orchestrators per provider so chatting with OpenAI vs Anthropic uses the correct API key, base URL, and headers immediately after the config reloads—no more sharing the first client for every provider.
- **Model defaults + reasoning toggle:** `_build_request_params` finally merges each model’s `default_parameters` and attaches Portkey’s `reasoning` payload whenever Deep Thinking is enabled on a model that declares `supports_reasoning`, so the gateway receives the right knobs automatically.
- **Config selection guardrails:** Introduced `resolve_model_selection` so every chat request fails fast when a provider/model ID is missing, paving the way for credential-aware orchestration without silent fallbacks.
- **Provider-aware chat selection:** `/getLLMResponse` now requires a `{ providerId, modelId }` payload, `ChatManager` accepts the structured selection, and the legacy plain `model` string has been removed so future work can locate provider credentials.
- **Frontend provider selection:** The chat combobox now tracks `{ providerId, modelId }`, serializing the pair with helper utilities so `/getLLMResponse` always receives the provider context instead of the legacy `model_id`.
- **Persisted model selections:** Chats now store their provider/model pair in `Chat.modelSelection`, `GET_LLM_CHAT` returns that selection, and the AI store restores the saved combo so resuming a chat reuses the original credentials automatically.
- **Live config reloads:** `register_llm_config_watch` now reloads the JSON, notifies `SettaFastAPIState`, and resets `ChatManager` so new providers/keys are honored immediately without restarting the backend.
- **Default model auto-selection:** The AI store now reuses an existing provider/model choice only when it still exists in the config and otherwise auto-selects the first provider default (`default_model_id`) so the UI always has a concrete selection once the config loads.
- **Streaming lifecycle + cancellation:** `ChatManager` now tracks every in-flight Portkey task, exposes `is_waiting_for_response`/`get_current_stream`, and lets `/stopLLMChat` cancel the active task so the frontend stop button halts generation immediately.

**Remaining Work**
- **Project-scoped configs**
  - Honor `project_config_id` when we eventually scope configs per project, and use `default_model_id` to preselect a model when loading the UI.

- **Preset-driven configuration UX**
  - Ship a canonical preset catalog derived from `backend/setta/llm/presets.py` and expose it to both backend and frontend so we can auto-generate a "default" config for popular providers (OpenAI, Anthropic, etc.) without asking the user to retype model metadata.
  - Extend the config editor to let users pick a preset (or multiple models within one) and only supply credentials/overrides; saving would materialize the preset’s models into `llm_config.json`, but the workflow becomes "select preset, paste API key" instead of hand-authoring every entry.
  - Support partial specs in `llm_config.json`: allow providers/models to reference a preset ID and only persist the fields the user overrides (e.g., API key, renamed display label, custom defaults). When the backend loads the config it can hydrate the full provider/model definition from the preset + overrides, so the file stays small while still being explicit about local changes.
  - Allow per-model overrides (display name, deep-thinking flag, default parameters) while still referencing the preset base, so we maintain a single source for standard IDs yet give power users flexibility.
  - Provide an optional `resetToPreset`/`addPreset` action that can rebuild the config from presets plus user overrides, ensuring new preset releases flow into existing installs without manual JSON surgery.

- **Streaming lifecycle + cancellation**
  - Persist partial assistant blocks (and pending tool calls) when cancellation or errors occur so we do not lose work between retries.

- **Deep-thinking and request parameters**
  - Make `ChatManager._build_request_params` respect the `deepThink` flag only for models whose config declares `supports_reasoning`, and merge each model’s `default_parameters` into the Portkey payload.
  - Surface validation/health data: add a `Route.TEST_LLM_CONFIG` endpoint that pings the configured gateway/providers, return structured errors, and show the status next to provider cards in `ProjectLLMSettings`.

- **Frontend follow-ups**
  - Update `ProjectChat.tsx` / the AI store so selections carry provider + model identifiers (and maybe display names) and disable the “Send” button until a valid selection exists.
  - Use the `supports_reasoning` flag to drive the Deep Thinking toggle (disable it for models that do not support reasoning, and show why).
  - Show inline errors / toast notifications when `loadLLMConfig` or `saveLLMConfig` fail, and surface the upcoming `TEST_LLM_CONFIG` results so users know whether the gateway is reachable.

- **Testing, docs, and cleanup**
  - Replace the deleted `tests/project_state/chats/test_chats.py` with new suites that cover `setta.llm` serialization, Portkey chunk normalization (mocking the SDK), MCP tool execution, and chat persistence round-trips (`python -m unittest discover tests`).
  - Document the new config file + Portkey gateway workflow in `docs/`/`README`, including manual verification steps (e.g., start the self-hosted gateway, run `pnpm start`, send a chat, verify tool streaming).
  - Remove remaining `.env`-centric constants/watchers once the config-driven flow is live, and add structured logging around `LLMOrchestrator` so failures (invalid API key, tool errors) are visible to both logs and frontend notifications.

Progress on the items above will fully activate the Portkey-powered stack: the UI already edits `setta_files/llm_config.json`, and the backend now has neutral LLM models, so wiring those configs into the orchestrator, cancelation flow, and validation/tests are the last major blockers.
