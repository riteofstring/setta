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
- Validation: `python -m compileall backend/setta -q` and logging tests via `PYTHONPATH=backend python -m unittest tests/setta/test_logging_*.py`.

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
- wrap_background_coroutine(...) primarily propagates context during execution, but if you then catch/log outside that context you can lose the metadata; you can see the split responsibilities between
wrap_background_coroutine (backend/setta/logging/context_bindings.py:104) and run_safely (backend/setta/logging/errors.py:50).
- ✅ Duplicate stack traces were likely in routes that called log_route_failure(...) and then raised an HTTPException; those routes now use `log_failure_and_broadcast_backend_log_event(...)` so the global
exception handler sees `backend_log_event_emitted=true` and exits early (backend/setta/routers/ai.py, backend/setta/routers/projects.py).
- Websocket context keys are a bit muddled:
    - ✅ bind_websocket_logging_context establishes a generated websocket_id; websocket_route_loop no longer overwrites it and instead stores the manager id under `connection_id` (backend/setta/routers/websocket.py).

“Planned but Unused” Logging Scaffolding

- The doc’s claim holds: these are effectively unused outside tests right now:
    - ProjectContextModel / attach_request_context_models / attach_websocket_context_models / get_project_id_from_payload (backend/setta/logging/context_sources.py:42, backend/setta/logging/
    context_sources.py:79, backend/setta/logging/context_sources.py:121, backend/setta/logging/context_sources.py:166)
    - bind_background_task_logging_context and wrap_background_callable (backend/setta/logging/context_bindings.py:49, backend/setta/logging/context_bindings.py:73)
    - SensitiveLoggingField exists but is currently test-only in practice (backend/setta/logging/context_models.py:14).
- This is fine if you’re about to adopt them, but as-is it increases mental overhead because the “intended” pattern and “actual” pattern diverge.

Concrete Cleanup Candidates (Ruff-Found)

- Dead/unused args/vars that can be removed or renamed (all reproducible via ruff check ... --select F401,F841,ARG*):
    - backend/setta/project_state/lsp_response_handlers/completion.py:21 (code, line_cols, content_idx_with_text_edit are unused; lots of commented-out logic)
    - backend/setta/project_state/project_code.py:160 (clear_text_field_completion args unused; method is a stub)
    - backend/setta/project_state/settings_project_manager.py:40 (x unused; method always raises)
    - backend/setta/routers/terminals.py:124 (terminal_id assigned but unused)
    - backend/setta/server.py:71 (FastAPI catch-all full_path unused; rename to _full_path to document intent)
    - backend/setta/types/helpers_lvl3.py:266 (section_id unused)
    - backend/setta/utils/generate_new_filename.py:47 (match unused)
    - backend/setta/websockets/msg_handlers/frontend_receiver.py:45 (websocket_id unused; rename to _websocket_id)

Recommended Next Steps (Prioritized)

- ✅ Wrap background task entrypoints in a single “run in context + log failures” utility: implemented as `spawn_background_task(...)` and adopted in the highest-impact call sites.
- ✅ Canonical route failure pattern: routes should use `WMHFrontendSender.log_failure_and_broadcast_backend_log_event(...)` when they want UI surfacing, so the global handler doesn’t duplicate it.
- Either adopt the context-model helpers (attach payload metadata) or delete them for now to reduce confusion (backend/setta/logging/context_sources.py:79).
- ✅ Normalize websocket identifiers: keep the generated websocket_id for logging and store fromWebsocketId under a distinct key (`connection_id`).
- ✅ Replace “string-only” UI errors that drop tracebacks (e.g. autosave) with the structured helper so you keep stack traces.
