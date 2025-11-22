# LLM cleanup follow-ups

Pending items to simplify and harden the Portkey-centric stack (builds on `docs/llm_refactor_plan.md`).

## Progress
- Frontend model picker now respects `project_configs` and `default_project_config_id`, showing project-scoped provider/model options and defaults.
- Stop/cancel flow now emits a final cancel completion chunk so the UI clears `waitingForResponse` immediately after `/stopLLMChat`.
- `route_get_llm_response` now rejects unknown `project_config_id` and maps selection/parameter validation errors (including Deep Thinking) to 400s instead of 500s.
- `TEST_LLM_CONFIG` results now carry `projectConfigId` and dedupe probes per scoped provider so validation errors stay tied to the correct project.
- LLM config watcher now leaves the previous config in place on invalid JSON/validation errors and broadcasts an error notification to the UI.
- Frontend now sends full provider/model payloads (with `preset_id`) and relies on backend slimming, removing client-side preset diffing.

## Open issues
- Provider resolution quietly falls back when a `project_config_id` is unknown; this can route through the wrong provider/credentials.
- Test gaps: minimal coverage for project-scoped selection/UI plumbing, stop/cancel behavior, watcher error handling, and validation payloads beyond scoped dedupe.

## Proposed actions
- Harden provider resolution by failing loudly on unknown `project_config_id` in selection/route plumbing.
- Backfill tests for project-aware selections, cancel/stop lifecycle, watcher error surfacing, and validation payloads.
