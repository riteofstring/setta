# Prompt Caching Expansion Plan

Goal: reduce token spend by caching every static chunk of the LLM payload (system prompt, invariant conversation history, long context/tool payloads) and optionally short-circuiting identical requests via the LiteLLM completion cache.

## 1. Config Surface
- Extend the chat LLM config to expose `cache_system_message`, `cache_history_indexes` (list of ints or negative indices), `cache_ttl_seconds` (optional) and `enable_completion_cache`.
- Document defaults (e.g., cache system prompt on, history indexes empty, TTL unset, completion cache off) and update any schema validators/types.
- Thread these fields through `merge_chat_llm_configs` so existing saved chats inherit the defaults.

## 2. Dynamic Injection Points
- Update `_maybe_apply_cache_prompting` to consult the new config instead of unconditionally caching only the system message.
- Build `cache_control_injection_points` dynamically:
  - Always include the system message when `cache_system_message` is True.
  - Translate any configured indexes into `{"location": "message", "index": idx}` entries so we can flag specific history messages (negative indexes map from the end).
  - When a TTL is set, add `{"type": "ephemeral", "ttl": "<Ns>"}` to each injected block (LiteLLM only applies the first TTL, so order system message first).
- Preserve explicitly provided `cache_control_injection_points` in the request to avoid overriding user overrides.

## 3. Auto-detect Cacheable History
- When building the `messages` array, detect “stale” history (e.g., every user/assistant pair before the newest user turn) and, if no explicit indexes were provided, automatically target those messages for caching in addition to the system prompt.
- Ensure we don’t attempt to cache the most recent user message (it changes each turn).
- Consider tagging lengthy tool definitions or other static payloads by injecting `cache_control` directly if the provider requires it (future extension once we know which models need this).

## 4. Completion-level Cache (Optional)
- Add support for LiteLLM’s request cache by instantiating `litellm.Cache` (in-memory or redis based on configuration) when `enable_completion_cache` is true.
- Pass `caching=True` and the cache instance to `litellm.acompletion`; use a deterministic cache key (model id + llm_config_id + hash of request payload without api_key) so identical calls are reused.
- Provide knobs for TTL/size if we expose redis/backends later; start with in-memory defaults.

## 5. Tests and Docs
- Expand `CachePromptingTests` to exercise:
  - Multi-index injection generation.
  - TTL propagation.
  - Respecting pre-set `cache_control_injection_points`.
- Add tests (likely with mocks) proving that enabling completion cache passes the cache object/caching flag into `litellm.acompletion`.
- Update README/LLM configuration docs with a “Prompt Caching” section describing the new options, recommended TTLs, and how they interact with provider support.

Deliverables: config/schema updates, smarter injection logic, optional completion cache wiring, regression tests, and docs so users can tune caching to their cost profile.
