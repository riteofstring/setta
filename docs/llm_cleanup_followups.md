# LLM cleanup follow-ups

Pending items to simplify and harden the Portkey-centric stack (builds on `docs/llm_refactor_plan.md`).

## Open issues
- Project-scoped selection is ignored on the frontend; only `providers` are rendered, so `project_configs` and `default_project_config_id` never surface.
- Stop/cancel flow leaves chats marked as streaming because `/stopLLMChat` cancels the task without emitting a completion/cancel event the UI can observe.
- Bad selections or deep-think requests surface as 500s; `resolve_model_selection` and `_build_request_params` failures are not mapped to 400s.
- Provider resolution quietly falls back when a `project_config_id` is unknown; this can route through the wrong provider/credentials.
- Config validation results lack project context and may probe duplicate provider IDs from different project configs, making failures ambiguous in the UI.
- Preset diffing lives in both frontend and backend, increasing drift risk and making persisted JSON sensitive to UI-side changes.
- Config watcher reloads corrupt JSON without guardrails, leaving ChatManager and app state stale with no notification.
- Test gaps: no coverage for project-scoped selection/UI plumbing, stop/cancel behavior, watcher error handling, or `TEST_LLM_CONFIG` result shapes.

## Proposed actions
- Make provider/model options and defaults project-aware on the frontend (respect `project_configs` and `default_project_config_id`).
- Emit a completion/cancel chunk (or update chatDetails in the stop route response) when `/stopLLMChat` fires so `waitingForResponse` clears immediately.
- Catch selection/parameter validation errors in `route_get_llm_response`, return 400s with clear detail, and fail fast on unknown `project_config_id`.
- Include `projectConfigId` in validation results (`TEST_LLM_CONFIG`) and dedupe probes per scoped provider to pinpoint failures in settings UI.
- Centralize preset merge/diff on the backend; have the frontend send full provider payloads (with `preset_id`) and let the server slim/serialize.
- Add error handling to the config watcher: detect JSON parse failures, keep the previous config active, and broadcast an error notification.
- Backfill tests for project-aware selections, cancel/stop lifecycle, watcher error surfacing, and validation payloads.
