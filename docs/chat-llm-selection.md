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

3. **Store a full `LLMConfig` snapshot on the chat.**
   - ✅ Captures provider, model, base URL, key env var, and tuning params exactly as used.
   - ✅ Chat exports/imports remain deterministic; we can still render metadata even when the current LiteLLM config diverges.
   - ✅ Allows side-by-side comparisons of new vs. legacy configs.
   - ❌ Slightly larger payloads, but still tiny relative to chat transcript size.

## Proposal
- Remove `userSelectedLLM` from the frontend store once the backend `Chat` model includes a `llm_config` (full snapshot) field.
- Persist both the snapshot and, optionally, a `configId` string solely for convenience when the id exists locally.
- When loading chats, prefer the active config entry (matched by id). If missing, display the stored snapshot as a “stale config” badge but keep the chat functional.

## Frontend Dropdown Rules
- Populate dropdown options from live LiteLLM config entries (those exposed by `/llm/config`).
- Label each option with the `model` name; when duplicates occur, append the config label in parentheses, e.g. `gpt-4o (my special config)`.
- Selecting an option sets both the `configId` (if any) and the resolved snapshot passed to the backend when the chat starts.
- When viewing an existing chat:
  - If its `configId` still exists, pre-select that option.
  - If not, insert a disabled option that shows the stored model + config label (marked as “missing locally”) so the user understands the provenance.

## Benefits
- Chats remain portable, auditable, and reproducible without depending on local config files.
- Frontend UX stays simple while still reflecting duplicate models unambiguously.
- Backend decisions (LiteLLM payloads, auditing, analytics) can reason about the exact provider settings used for every assistant response.

## Status
- Backend chat persistence now includes an `llmConfig: LLMConfig` snapshot, `LitellmChatManager.get_or_create_chat` requires a config id, and `create_new_chat` stores the resolved snapshot on every new chat (tests enforce passing a config when creating chats).
- LiteLLM config models were renamed to `AllLLMConfigs`/`LLMConfig`, and `/llm/config` plus the Zustand store now speak that shape (including `default_config_id` resolution) so the frontend can look up config ids deterministically.
- `/getLLMResponse` accepts `llmConfigId`, and the frontend resolves the id for the user’s dropdown choice before sending a chat request, so the backend can capture which config entry the user attempted to use even when the snapshot diverges later.

## Next Steps
1. Persist a `llmConfigId` (when known) alongside the snapshot on each `Chat`, and update `_build_litellm_request_payload` to read that id instead of the current placeholder so LiteLLM invokes the exact provider/model that created the chat.
2. Replace the `userSelectedLLM: string` store field with a selection that points at a config id (or stored snapshot), and hydrate it from the chat metadata so reloads don’t fall back to the default model.
3. Update the chat pane dropdown/UI to render the live config list, show duplicate model names with config labels, and surface the “stale config” badge whenever the stored snapshot no longer matches an active config entry.
4. Ensure chat exports/imports include both the stored snapshot and optional `llmConfigId`, so collaboration and restores keep the provider context intact.
