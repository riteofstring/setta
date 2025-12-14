Overall

- The architecture is directionally good (central config + context propagation + structured failure helper + UI-facing log events), but it’s not consistently applied yet, and a few choices create either silent
failures or duplicate logging.
- docs/backend-logging-plan.md had a duplicated item “3”; this has been fixed.

Progress Update (Refactor Work)

- Added `spawn_background_task(...)` to unify “run in context + log failures” for background tasks (backend/setta/logging/tasks.py).
- Migrated the highest-impact “fire and forget” task entrypoints to the new helper:
    - File watchers (backend/setta/file_watchers/specific_file_watcher.py, backend/setta/file_watchers/lsp.py).
    - JSON source reload scheduling (backend/setta/project_state/jsonSource/jsonSource.py).
    - MCP/LSP startup tasks (backend/setta/server_state.py, backend/setta/mcp/server.py).
    - Listener hot reload watcher and listener callback scheduler (backend/setta/api/listener.py, backend/setta/api/scheduling.py).
    - Debounced autosave scheduling (backend/setta/utils/async_debouncer.py).
    - CLI “run code” subprocess tasks (backend/setta/websockets/connect.py).
    - LLM streaming tasks (backend/setta/llm/llm_chat_manager.py).
- Removed duplicate failure logging in HTTP routes by switching to the “log + broadcast” helper (backend/setta/routers/ai.py, backend/setta/routers/projects.py).
- Normalized websocket identifiers: keep generated `websocket_id` and record the manager id as `connection_id` (backend/setta/routers/websocket.py).
- Converted “string-only” autosave failures into structured failures with tracebacks (backend/setta/project_state/base_project_manager.py).
- Cleaned up a few Ruff items called out in this doc (backend/setta/server.py, backend/setta/websockets/msg_handlers/frontend_receiver.py).
- Deleted unused logging scaffolding (context-model helpers + model-to-log serialization) to keep the logging patterns consistent and reduce mental overhead:
    - Removed `ProjectContextModel` / `attach_*_context_models` / `get_project_id_from_payload` (backend/setta/logging/context_sources.py).
    - Removed `bind_background_task_logging_context` / `wrap_background_callable` (backend/setta/logging/context_bindings.py).
    - Deleted `SensitiveLoggingField` + `serialize_logging_models` (backend/setta/logging/context_models.py).
    - Updated `log_route_failure(...)` to accept explicit `context={...}` only (backend/setta/logging/errors.py) and updated callers/tests accordingly.
- Fixed missing bound metadata in LSP request helpers by binding request context in `LanguageServerWriter.send_and_wait(...)` (backend/setta/lsp/writer.py).
- Cleaned up additional Ruff items called out in this doc (backend/setta/project_state/lsp_response_handlers/completion.py, backend/setta/project_state/project_code.py, backend/setta/project_state/settings_project_manager.py, backend/setta/routers/terminals.py, backend/setta/types/helpers_lvl3.py, backend/setta/utils/generate_new_filename.py).
- Validation: `python -m compileall backend/setta -q` and `python -m unittest tests/setta/test_logging_*.py` (after `source activate.sh`).

What’s Already Well Thought Out

- Centralized bootstrap via backend/setta/logging/config.py:20 keeps uvicorn from stomping logger config and makes CLI/embedded usage predictable.
- Contextvars-based metadata + formatter integration is clean (backend/setta/logging/context.py:1) and keeps log lines actionable without sprinkling extra fields everywhere.
- The “single call logs + broadcasts” helper is a good unification point: backend/setta/websockets/msg_handlers/frontend_sender.py:80.
- The FastAPI exception hooks ensure errors reach the UI even when handlers don’t explicitly broadcast: backend/setta/server.py:160.

Where Error Handling Breaks Down (High Impact)

- Unhandled background-task exceptions are easy to lose:
    - ✅ File watcher callbacks are now spawned via `spawn_background_task(...)` so exceptions are logged with context (backend/setta/file_watchers/specific_file_watcher.py).
    - ✅ JSON source reload tasks are now spawned via `spawn_background_task(...)` so exceptions are logged with context (backend/setta/project_state/jsonSource/jsonSource.py).
    - ✅ Most “create_task + wrap_background_coroutine” call sites that were effectively fire-and-forget have been moved to `spawn_background_task(...)` (e.g. MCP/LSP startup).
- ✅ `spawn_background_task(...)` ensures the failure handler (`run_safely(...)`) executes inside the bound context, so contextvars metadata is preserved even when exceptions are swallowed.
- ✅ Duplicate stack traces were likely in routes that called log_route_failure(...) and then raised an HTTPException; those routes now use `log_failure_and_broadcast_backend_log_event(...)` so the global
exception handler sees `backend_log_event_emitted=true` and exits early (backend/setta/routers/ai.py, backend/setta/routers/projects.py).
- Websocket context keys are a bit muddled:
    - ✅ bind_websocket_logging_context establishes a generated websocket_id; websocket_route_loop no longer overwrites it and instead stores the manager id under `connection_id` (backend/setta/routers/websocket.py).

“Planned but Unused” Logging Scaffolding (Now Removed)

- ✅ The unused context-model + model-serialization logging scaffolding has been deleted to keep the logging story consistent and to avoid maintaining two competing patterns.

Concrete Cleanup Candidates (Ruff-Found)

- Dead/unused args/vars that can be removed or renamed (all reproducible via ruff check ... --select F401,F841,ARG*):
    - ✅ backend/setta/project_state/lsp_response_handlers/completion.py (removed unused vars + dead commented logic; tightened types)
    - ✅ backend/setta/project_state/project_code.py (renamed unused args in stub + updated completion handler call)
    - ✅ backend/setta/project_state/settings_project_manager.py (renamed unused arg + avoided Iterable type)
    - ✅ backend/setta/routers/terminals.py (removed unused `terminal_id`)
    - backend/setta/server.py:71 (FastAPI catch-all full_path unused; rename to _full_path to document intent)
    - ✅ backend/setta/types/helpers_lvl3.py (removed unused `section_id` param)
    - ✅ backend/setta/utils/generate_new_filename.py (renamed unused `match` param)
    - backend/setta/websockets/msg_handlers/frontend_receiver.py:45 (websocket_id unused; rename to _websocket_id)

Recommended Next Steps (Prioritized)

- ✅ Wrap background task entrypoints in a single “run in context + log failures” utility: implemented as `spawn_background_task(...)` and adopted in the highest-impact call sites.
- ✅ Canonical route failure pattern: routes should use `WMHFrontendSender.log_failure_and_broadcast_backend_log_event(...)` when they want UI surfacing, so the global handler doesn’t duplicate it.
- ✅ Deleted the unused context-model + model-serialization helpers; keep logging context explicit via `extra_values={...}` instead.
- ✅ Normalize websocket identifiers: keep the generated websocket_id for logging and store fromWebsocketId under a distinct key (`connection_id`).
- ✅ Replace “string-only” UI errors that drop tracebacks (e.g. autosave) with the structured helper so you keep stack traces.
