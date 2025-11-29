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
- Backend chat persistence now records `chat.llmConfig` (a full `LLMConfig`). `LLMChatManager.get_or_create_chat` requires a `llmConfigId`, resolves it, and saves the resolved config with the new chat so payloads stay portable even if the config entry later disappears from disk.
- LLM payload construction (`build_llm_params`) reads the stored config directly, so stream replays are deterministic and do not depend on local config state.
- `/llm/config` and `/llm/apiKeys` ship structured Pydantic models, and dedicated DBE helpers now read/write both `llm_config.json` and `.env` with file-locking, type validation, and `load_dotenv(..., override=True)` semantics. This means routers/watchers no longer hand-roll paths or JSON parsing.
- `LLMConfigWatcher` and `DotEnvWatcher` watch the DBE-managed files, reload `LLMChatManager`, and broadcast config/API-key updates whenever disk data changes. Both fire immediately on startup, so clients receive pushes instead of polling.
- The Zustand AI store exposes `allLLMConfigs`, API-key data, and helper actions to fetch them. `ProjectChat` already renders dropdown options from `allLLMConfigs`, filters entries that lack loaded API keys, and passes the selection back to `submitMessage`.
- Temporary configs are already created when loading chat metadata; `save_llm_config` trims them before writing to disk so exports stay clean.

### Remaining Work
- Automatically hydrate the AI store by calling `loadLLMApiKeys()` and `loadLLMConfig()` when the project loads or when the chat pane mounts. Today those actions exist but are never invoked, so `apiKeysInitialLoadComplete`/`llmConfigInitialLoadComplete` stay `false` and the chat UI never renders.
- Replace the static `MODEL_GROUPS`/`C.LLM_API_KEY_NAMES` logic in `ProjectLLMSettings.tsx` with views that read/write `/llm/config` and `/llm/apiKeys`, including controls for provider, model, base URL, API-key env var name, and other parameters.
- Surface `temporary` configs in the dropdown/settings with a clear badge (“from chat history”), and add an affordance to promote or discard them so duplicate chats do not pile up.
- Ensure chat export/import flows (and any upcoming sharing features) include the stored `LLMConfig` blob and generated ids so collaborators always see the exact provider parameters that produced a transcript.
- Add backend tests for `_strip_temporary_configs`, `merge_chat_llm_configs`, and config save/load flows, plus frontend coverage (or a documented manual test plan) for selecting configs, filtering by API-key availability, and persisting the resolved config per chat.
- Subscribe the frontend to the new config/API-key WebSocket broadcasts so the dropdown/settings refresh automatically when the backend reloads disk changes or another client edits configs.
