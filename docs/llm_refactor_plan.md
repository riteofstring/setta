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
- Layer the chat pipeline: Portkey transport adapter → stream state machine (status, tool-call accumulation, cancellation) → persistence/metadata; centralize request-context building (credentials, headers, defaults).
- Normalize config/preset merging in one module with a minimal API (`load/save`, payload conversions, `add_preset`, `resolve_selection`, `validate_request`) and explicit project scoping.
- Centralize frontend streaming status updates and selection/config sanitization in shared helpers instead of scattered chunk handlers.
- Broaden tests to cover state-machine flows (happy path, cancel, tool-call completion, snapshot interval) and config normalization (preset overrides, project scoping, reasoning/credential validation).

**Completed Highlights**
- Neutral LLM models + Portkey adapter with provider-scoped clients and selection guardrails.
- Persisted chat state: structured content blocks, stream status, tool results, reconnection hydration, and stop/cancel support.
- Config UX + presets + validation: editor, GET/SET/TEST endpoints, project-scoped configs, default selection/gating, and inline error surfacing.
- Deep thinking + model defaults enforced per-model with reasoning payloads.
- Gateway bundling + dev auto-start helper for local Portkey.
- Frontend selection gating and streaming pipeline for message/text/tool events.
- Notifications/logging for LLM/config failures.
- Tests/docs: adapter + persistence + config suites; Portkey config workflow documented.

**Note**
- Immediate regressions to fix before continuing the refactor are tracked in `docs/llm_simplification_plan.md`.
