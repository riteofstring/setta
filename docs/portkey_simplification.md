# Portkey Backend Simplification Findings & Plan

## What’s in place
- Chat calls now flow `ChatManager` → `AsyncPortkey` directly. Provider-scoped clients are cached per project/provider, payloads are OpenAI-style with the `provider` field/extra headers, and a small adapter maps streamed chunks to `LLMStreamEvent`s.
- Provider routing leans on Portkey SDK settings (`provider`, `base_url`, api key) instead of custom `x-portkey-provider` headers.
- Config validation uses the Portkey SDK: gateway health probes call Portkey `get`, provider tests call `models.list()` with provider-specific headers/keys, and we surface missing-authorization hints.
- Config still centers on gateway URL + providers/models/presets; presets remain the UX surface for common providers.
- Preset catalog now includes Google Gemini, Mistral, and xAI (Grok) alongside OpenAI and Anthropic to prefill the editor dropdowns.
- Regression test codifies the minimal payload + OpenAI delta mapping so we keep the thin adapter: `tests/llm/test_chat_manager_simplification.py` asserts the provider-flagged payload and openai-style chunk parsing.

## Simplification direction (provider-keys-first)
- Keep a single Portkey touchpoint: reuse the provider-scoped `AsyncPortkey` clients inside `ChatManager` and keep the adapter minimal.
- Stream mapping is thin: OpenAI-format deltas map straight to `LLMStreamEvent` types; only convert the deltas/tool calls/finish reasons we need.
- Validation runs through the SDK: `models.list()` and gateway health via Portkey so runtime and probes share the same auth/base URL setup.
- Presets remain the UX focus; broaden catalog as needed without reintroducing routing complexity.

## Status of open items
- **Portkey routing with provider keys:** Confirmed—stay on minimal fields (`api_key`, `base_url`/gateway URL, `provider`), no `x-portkey-provider` header, OpenAI-shaped payloads.
- **Chunk shapes:** Still to verify against real streams; if provider-specific shapes show up we’ll add a narrow switch inside `ChatManager`, otherwise keep the thin adapter.
- **Preset breadth:** Pending decision on how wide the catalog should go (Google/xAI/etc. already present); align with frontend UX expectations.

## Proposed plan
1) Maintain the flattened stack: keep `ChatManager` + Portkey SDK only.
2) Tighten config propagation: favor provider/base_url/api_key + `provider` flag, prune any leftover header plumbing if it resurfaces.
3) Extend preset catalog (Google/xAI/etc.) to improve dropdown coverage when ready.
