# Portkey Backend Simplification Findings & Plan

## What’s in place
- We run three layers per LLM call: `ChatManager` → `LLMOrchestrator` → `PortkeyClient`. Orchestrator just normalizes history; `PortkeyClient` re-wraps the Portkey SDK and manually parses streamed chunks into `LLMStreamEvent`s. We hand-build payloads instead of leaning on Portkey defaults.
- Provider routing is duplicated: `ChatManager._build_default_request_params` and `config_test.py` add `x-portkey-provider`/auth headers and use raw `requests` probes. None of this uses Portkey’s own provider selection; we only bolt routing on via headers/base_url.
- Config is verbose: `config_store.py`/presets manage diff/override logic, but runtime only needs gateway URL, provider IDs, API keys, base URLs, and model IDs. Presets cover OpenAI/Anthropic; “wide variety” providers aren’t represented yet.

## Simplification direction (provider-keys-first)
- Collapse to a single Portkey touchpoint: build `AsyncPortkey` per provider (api_key=provider key, base_url=gateway or provider URL, plus provider identifier if Portkey supports it) and call `chat.completions.create` directly. Fold `PortkeyClient` + `LLMOrchestrator` into `ChatManager`.
- Keep stream mapping minimal: Portkey already emits OpenAI-style chunks; only a thin adapter should emit `LLMStreamEvent` (text/tool_call/complete). No separate payload builder layer.
- Move validation to the SDK: instantiate provider-scoped Portkey clients and call `models.list()` (and gateway health) instead of raw `requests` + header guessing, so probes mirror runtime behavior.
- Lean on presets for UX: ship richer presets (OpenAI, Anthropic, Google, xAI, etc.) with default models so the frontend can stay dropdown-driven; advanced users can still edit JSON for overrides. Backend treats presets as data only, not complexity in the call path.

## Open items to confirm/decide
- Portkey routing with provider keys: confirm the minimal fields we can pass (likely `api_key`, `base_url`/gateway URL, and a `provider`/similar flag) so we can drop custom `x-portkey-provider` headers.
- Chunk shapes: if Portkey always emits OpenAI-format deltas, the adapter stays tiny; if provider-specific shapes appear, we may need a narrow switch but still inside `ChatManager`.
- Preset breadth: expanding presets to Google/xAI/etc. aligns with the UX goal of populated dropdowns—confirm this expectation for the frontend.

## Proposed plan
1) Flatten the call stack: remove `PortkeyClient` + `LLMOrchestrator` and call Portkey directly inside `ChatManager` with provider-scoped clients; keep only a minimal chunk-to-`LLMStreamEvent` adapter.
2) Simplify config usage: use provider keys/Base URLs directly; drop header injection logic where possible and rely on Portkey’s provider field/virtual key if available.
3) Replace validation with SDK calls: use Portkey client health/models listing for gateway/provider checks; remove raw `requests` probes and duplicated header logic.
4) Enrich presets: add model lists for additional providers (Google, xAI, etc.) so the frontend can stay simple; keep JSON editable for advanced overrides.
