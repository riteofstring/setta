# Chat LLM Selection Plan

## Background
- The legacy `userSelectedLLM` field only lived in frontend state, so selections disappeared on refresh and exported chats could not be replayed elsewhere.
- The refactor introduced full `LLMConfig` objects in `backend/setta/types/llm_config.py` and now stores the exact config with every chat, but the UI/config management story still mixes static data and unfinished hydration logic.
- Our dropdown must stay intuitive even when multiple configs expose the same `model` name (e.g., a hosted `gpt-4o` vs. a local mirror), and the system has to stay reproducible when projects move across machines.

## Goals
- Persist the full provider/model/base-url/api-key/parameter payload for every chat so exports/imports, audits, and analytics remain deterministic.
- Keep the frontend selection surface simple while clearly disambiguating duplicate model names and highlighting temporary configs that originate from chat history.
- Let users add/edit configs and API keys from the UI, automatically hydrate dropdowns from `/llm/config`, and react to watcher events without manual refreshes.

## Strategy
- Always store the full `LLMConfig` used for a chat rather than just a config id or model string. `/getLLMResponse` accepts a config id, but the backend resolves it to a concrete `LLMConfig` and persists the resolved copy on the chat record.
- `merge_chat_llm_configs` injects the stored configs into the `/llm/config` response (flagged as `temporary`). The frontend dropdown can therefore display the exact provider/model that each transcript used, and temporary entries can be badged/promoted.
- `/llm/config` and `/llm/apiKeys` own the source of truth for providers and secrets. The Zustand AI store holds `allLLMConfigs`, API keys, and load flags; components should hydrate through `loadLLMConfig`/`loadLLMApiKeys` and respond to backend broadcasts when the config watcher reloads disk changes.

## Current Status

### Completed Work
- Chat persistence stores the resolved `LLMConfig` object with every transcript via `LLMChatManager.get_or_create_chat` and `backend/setta/project_state/chats/save.py`, so each chat carries the exact provider/model/base-url/api-key parameters that produced it.
- `LLMChatManager.build_llm_params` uses the stored config snapshot when constructing LiteLLM payloads, keeping streaming replays deterministic even if the on-disk config later changes.
- `/llm/config` and `/llm/apiKeys` now serve Pydantic models backed by the DBE helpers in `backend/setta/llm/config.py`; writes sanitize ids/temporary entries, `.env` updates trigger `load_dotenv(..., override=True)`, and watchers broadcast websocket updates.
- `LLMConfigWatcher` and `DotEnvWatcher` (wired up in `backend/setta/server_state.py`) watch the DBE-managed files, reload `LLMChatManager`, and push `LLMConfigUpdated`/`LLMApiKeysUpdated` events immediately on startup and whenever disk edits occur.
- The Zustand AI store (`frontend/src/state/definitions.ts`) holds `allLLMConfigs`, API keys, and per-chat selections; `ProjectChat.tsx` renders grouped dropdown entries sourced from `/llm/config`, filters out configs whose `api_key_env` is missing from `/llm/apiKeys`, and passes the chosen id back to `submitMessage`.
- Temporary configs injected via `merge_chat_llm_configs` are marked `temporary`, exposed to the frontend, and stripped by `save_llm_config` before writing `setta_files/llm_config.json`, so historic providers are visible without polluting the canonical file.
- `useHydrateLLMState` triggers `loadLLMConfig`/`loadLLMApiKeys` for both ProjectChat and ProjectLLMSettings, and `state/actions/websocketReceive.ts` feeds the websocket events into the store so the UI stays up to date.

### Remaining Work
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx` still relies on static `MODEL_GROUPS`/`C.LLM_API_KEY_NAMES` and only edits API keys. We need a real CRUD surface that reads/writes `/llm/config` + `/llm/apiKeys`, letting users add/edit providers, models, base URLs, env var names, and parameters. (Still intentionally deferred until the chat pipeline settles.)
- Surface the `temporary` flag in the dropdown/settings, badge chat-derived entries (“from chat history”), and offer a promote/edit flow so users can convert them into durable providers instead of silently reusing them forever.
- When we build chat export/import or sharing flows, make sure the stored `LLMConfig` blob and config ids are copied alongside the transcript so collaborators receive the exact provider parameters (the data is already persisted, but the export path still needs to consume it).
- Add explicit backend tests for `_strip_temporary_configs` and watcher reload behavior, plus frontend coverage or at least a documented manual test plan that exercises config selection, API-key filtering, and persistence of the resolved config per chat.
