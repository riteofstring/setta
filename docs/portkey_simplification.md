# Portkey Backend Simplification Findings & Plan

## What’s in place
- Chat calls now flow `ChatManager` → `AsyncPortkey` directly. Provider-scoped clients are cached per project/provider, payloads are OpenAI-style with the `provider` field/extra headers, and a small adapter maps streamed chunks to `LLMStreamEvent`s.
- Provider routing leans on Portkey SDK settings (`provider`, `base_url`, api key) instead of custom `x-portkey-provider` headers.
- Config validation uses the Portkey SDK: gateway health probes call Portkey `get`, provider tests call `models.list()` with provider-specific headers/keys, and we surface missing-authorization hints.
- Config still centers on gateway URL + providers/models/presets; presets remain the UX surface for common providers.
- Preset catalog now includes Google Gemini, Mistral, and xAI (Grok) alongside OpenAI and Anthropic to prefill the editor dropdowns.

## Simplification direction (provider-keys-first)
- Keep a single Portkey touchpoint: reuse the provider-scoped `AsyncPortkey` clients inside `ChatManager` and keep the adapter minimal.
- Stream mapping is thin: OpenAI-format deltas map straight to `LLMStreamEvent` types; only convert the deltas/tool calls/finish reasons we need.
- Validation runs through the SDK: `models.list()` and gateway health via Portkey so runtime and probes share the same auth/base URL setup.
- Presets remain the UX focus; broaden catalog as needed without reintroducing routing complexity.

## Open items to confirm/decide
- Portkey routing with provider keys: confirm the minimal fields we can pass (likely `api_key`, `base_url`/gateway URL, and a `provider`/similar flag) so we can drop custom `x-portkey-provider` headers.
- Chunk shapes: if Portkey always emits OpenAI-format deltas, the adapter stays tiny; if provider-specific shapes appear, we may need a narrow switch but still inside `ChatManager`.
- Preset breadth: expanding presets to Google/xAI/etc. aligns with the UX goal of populated dropdowns—confirm this expectation for the frontend.

## Proposed plan
1) Maintain the flattened stack: keep `ChatManager` + Portkey SDK only.
2) Tighten config propagation: favor provider/base_url/api_key + `provider` flag, prune any leftover header plumbing if it resurfaces.
3) Extend preset catalog (Google/xAI/etc.) to improve dropdown coverage when ready.
