# Prompt Caching Expansion Plan

Goal: reduce token spend by caching every static chunk of the LLM payload (system prompt, invariant conversation history, long context/tool payloads) and optionally short-circuiting identical requests via the LiteLLM completion cache.

## 1. Config Surface
- Keep the chat LLM config schema unchanged; caching behavior is now entirely heuristic, so no extra knobs are required for the initial rollout.
- Document that system prompts and stale history will be cached automatically (unless callers explicitly set `cache_control_injection_points` on the request) so teams know what to expect without tweaking configs.
- Call out that we can revisit per-config or per-model overrides later if providers expose incompatible caching semantics, but for now the absence of config-level settings is intentional.

## 2. Dynamic Injection Points
- Update `_maybe_apply_cache_prompting` so it always builds `cache_control_injection_points` from heuristics (system prompt + stale history from Step 3) instead of a fixed system-only rule.
- Make sure we still skip the logic whenever the request already specifies `cache_control_injection_points`; callers can always override our defaults that way.
- Keep the system prompt first in the injection array so future TTL/priority tweaks are easy to add if we ever need them.

## 3. Auto-detect Cacheable History
- When building the `messages` array, detect “stale” history (e.g., every user/assistant pair before the newest user turn) and, if no explicit indexes were provided, automatically target those messages for caching in addition to the system prompt.
- Ensure we don’t attempt to cache the most recent user message (it changes each turn).
- Consider tagging lengthy tool definitions or other static payloads by injecting `cache_control` directly if the provider requires it (future extension once we know which models need this).

## 4. Completion-level Cache (Optional)
- Once prompt caching proves out, add LiteLLM’s request cache behind a global or per-environment toggle (no per-config field yet).
- Pass `caching=True` and a shared cache instance into `litellm.acompletion`, hashing the payload (minus api_key) with the model/config identifiers so identical calls reuse completions.
- Document that backend-wide toggle and sketch how we’d extend it with backend-specific TTL/size settings when we eventually wire up redis/external caches.

## 5. Tests and Docs
- Expand `CachePromptingTests` (or equivalent suites) to cover heuristic injection: system prompt is always cached first, stale history gets included automatically, and explicit `cache_control_injection_points` prevent overrides.
- Add tests proving we never target the latest user message for caching and that negative/edge-case histories (single message, tool-only chats, etc.) degrade gracefully.
- When we eventually add completion caching, include a mock-based test that asserts `litellm.acompletion` receives `caching=True` plus a cache instance.
- Update README/LLM config docs with a “Prompt Caching” section describing the default heuristic behavior, how to override it via request payloads, and how provider support/limitations factor in.

Deliverables: config/schema updates, smarter injection logic, optional completion cache wiring, regression tests, and docs so users can tune caching to their cost profile.
