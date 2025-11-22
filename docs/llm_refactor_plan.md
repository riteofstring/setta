**Goal**
- Enable chatting with a wide range of LLMs (OpenAI, Anthropic, Google, Mistral, xAI, etc.) via Portkey.
- Let those LLMs invoke Setta MCP tools and stream tool calls/results live.
- Stream chats and tool outputs into the frontend when connected, while persisting transcripts for reconnects and headless runs.
- Make LLM configuration easy in the frontend (API keys, base URLs, presets) while still allowing raw JSON edits to `setta_files/llm_config.json`.

**Guiding Principles**
- Full-stack overhaul; prefer deleting legacy Anthropic-era paths over compatibility shims.
- Portkey-first design; cohesive modules (config, transport, state machine, persistence) beat piecemeal fixes.
- No backward compatibility guarantees for old chat/config formats.

**Current State**
- Portkey transport is wired end-to-end: provider/model selections are required, provider-scoped clients cache credentials, and gateway health/provider tests exist.
- Neutral LLM models and chat persistence are in place: messages store structured blocks, stream status is persisted, tool results are recorded, and reconnect hydration merges active streams.
- Config UX is live: preset-aware editor with GET/SET/TEST routes, project-scoped configs, default selection handling, and notification surfacing for failures.
- Deep thinking/reasoning requests respect per-model support and default parameters; chat requests validate credentials up front.
- Gateway assets ship with the package and a dev helper can auto-start the bundled gateway.

**Open Gaps (refactor scope)**
- Finalize UX polish and docs for the new pipeline (diagram + request → events → persistence example) and update README/DEV notes.
- Smoke the full-stack flow with the Portkey gateway (stream + tool calls + reconnect) and note any remaining edge regressions to close.
- Apply the shared streaming/config helpers wherever ad-hoc code remains (if any) and delete leftover legacy helpers once verified.

**Completed Highlights**
- Neutral LLM models + Portkey adapter with provider-scoped clients and selection guardrails.
- Persisted chat state: structured content blocks, stream status, tool results, reconnection hydration, and stop/cancel support.
- Config UX + presets + validation: editor, GET/SET/TEST endpoints, project-scoped configs, default selection/gating, and inline error surfacing.
- Deep thinking + model defaults enforced per-model with reasoning payloads.
- Gateway bundling + dev auto-start helper for local Portkey.
- Layered chat pipeline in place: centralized request-context builder, Portkey transport adapter, stream state machine, and persistence/metadata helpers.
- Frontend selection gating and streaming pipeline for message/text/tool events with shared helpers for config/selection sanitization.
- Notifications/logging for LLM/config failures.
- Broadened tests: stream state machine happy/error/tool-result paths, snapshot persistence interval, config normalization/validation, and watcher error handling; Portkey config workflow documented.

**Note**
- Immediate regressions to fix before continuing the refactor are tracked in `docs/llm_simplification_plan.md`.
