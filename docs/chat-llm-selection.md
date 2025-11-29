# Chat LLM Selection Plan

## Background
- `userSelectedLLM` currently lives only in frontend state, so a browser refresh or sharing a chat loses the selection.
- Chats need to stay reproducible when exported/imported, regardless of local LiteLLM config differences.
- The frontend dropdown must stay intuitive even when multiple LiteLLM config entries share the same `model` value.

## Storage Options Considered
1. **Store only a `model` string on each `Chat`.**
   - ✅ Simple, aligns with how the dropdown is labeled today.
   - ❌ Ambiguous whenever two providers expose identical `model` names (e.g., hosted vs. local `gpt-4o`).
   - ❌ Lacks base URL, API key env var, and tuned params (temperature, reasoning), so replays are incomplete.

2. **Store a LiteLLM config id reference.**
   - ✅ Keeps history tied to a specific config entry while the project stays local.
   - ❌ Not portable: if someone opens the project without that config entry, we can no longer resolve the id.

3. **Store the full `LLMConfig` used by the chat.**
   - ✅ Captures provider, model, base URL, key env var, and tuning params exactly as used.
   - ✅ Chat exports/imports remain deterministic; we can still render metadata even when the current LiteLLM config diverges.
   - ✅ Allows side-by-side comparisons of new vs. legacy configs.
   - ❌ Slightly larger payloads, but still tiny relative to chat transcript size.

## Proposal
- Remove `userSelectedLLM` from the frontend store once the backend `Chat` model includes a `llm_config` (the full stored config) field.
- Persist that exact config to keep chats portable; avoid storing config ids that may not exist on another machine.
- When loading chats, automatically merge each chat’s stored `LLMConfig` into the config response (flagged as `temporary`) so the dropdown always exposes the exact provider/model a transcript used even if the saved config file no longer contains it.

## Frontend Dropdown Rules
- Populate dropdown options from the merged LiteLLM config set returned by `/llm/config`. That payload already includes stored chat configs marked as `temporary`, so every chat always has something selectable.
- Label each option with the `model` name; when duplicates occur, append the config label in parentheses, e.g. `gpt-4o (my special config)`.
- Selecting an option sends its config id to the backend so the resolved `LLMConfig` can be persisted on the chat; the id itself is not stored long-term.
- When viewing an existing chat, default to the config id embedded in the chat’s stored `LLMConfig` (or the generated temporary id). If the entry is marked `temporary`, surface that in the UI rather than inventing a “missing” placeholder.

## Benefits
- Chats remain portable, auditable, and reproducible without depending on local config files.
- Frontend UX stays simple while still reflecting duplicate models unambiguously.
- Backend decisions (LiteLLM payloads, auditing, analytics) can reason about the exact provider settings used for every assistant response.
- Temporary configs replace brittle heuristic matching, so stale chats keep working without any guesswork.

## Status
- Backend chat persistence now records the exact `llmConfig: LLMConfig` value used for each chat, `LitellmChatManager.get_or_create_chat` requires a config id, and `create_new_chat` stores the resolved config on every new chat (tests enforce passing a config when creating chats).
- LiteLLM config models were renamed to `AllLLMConfigs`/`LLMConfig`, and `/llm/config` plus the Zustand store now speak that shape (including `default_config_id` resolution) so the frontend can look up config ids deterministically.
- `/getLLMResponse` accepts `llmConfigId`, and the frontend resolves the id for the user’s dropdown choice before sending a chat request, so the backend can capture which config entry the user attempted to use even when that config diverges later (the id is used only to fetch the resolved `LLMConfig`, not persisted).
- LiteLLM payload construction now reads the stored `LLMConfig` directly, so chats remain portable even if a config id is missing locally.
- `LLMConfig` entries now carry stable ids and a `temporary` flag, `merge_chat_llm_configs` merges every stored chat config into the returned config set, `save_litellm_config` strips temporaries before writing to disk, and the old `llmConfigMatching.ts` heuristics have been deleted.
- The chat dropdown is now populated from live `/llm/config` data (filtered by available API keys), with provider/base URL context appended to duplicate model names, but the ongoing `ProjectChat.tsx` cleanup still needs to hook the selection back up to stored chats.

## Next Steps
1. Surface a clear badge/state for `temporary` entries (e.g., “from chat history”) and decide whether the user can promote them into permanent configs or just view them.
2. Keep the stored `LLMConfig` (and any upcoming UI metadata) flowing through chat export/import paths so collaborators always see the provenance, including the generated ids.
3. Add automated coverage for `_strip_temporary_configs`/`merge_chat_llm_configs` and finish the `ProjectChat.tsx` wiring so selection + submission use the merged config ids end to end.
