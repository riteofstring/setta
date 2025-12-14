Overall

- The design matches docs/backend-logging-plan.md (central bootstrap + contextvars + “backend log events”), but there are a few correctness bugs and some duplicated/under-specified behavior that make logging/
error handling less reliable than the plan implies.

Progress (Completed)

- Fixed multiple `log_failure_and_broadcast_backend_log_event(...)` call sites that were passing an extra positional payload arg (this was causing a `TypeError` during exception handling, losing both the original
exception and the UI backend-log-event).
- Fixed `log_route_failure(...)` to always include a traceback by passing an explicit `(type(exc), exc, exc.__traceback__)` tuple via `exc_info=...` (so tracebacks are preserved even when the exception is no
longer “current” in `sys.exc_info()`).
- Eliminated the “manual `broadcast_backend_log_event(...)` + raise `HTTPException`” double-emit path (example: chat-not-found now relies on `HTTPException` + the global handler).
- Closed the listener “visibility gap”: whenever the backend sends `WebsocketMsgListenerError` back to the listener, it now also emits a frontend backend-log-event so the UI can’t miss listener failures.
- Added listener logging context binding (`listener_id`, etc.) so listener-side logs are no longer missing Setta context (`setta_context=-`) for the main connection loop.
- Made initialization failures propagate to callers waiting on readiness (so startup failures are not silently swallowed).
- Replaced `print(...)` calls in core runtime paths with structured logging (remaining `print(...)` calls still exist in a few non-core paths like codegen and MCP docstring parsing).
- Removed unused logging-context helpers (`clear_logging_context(...)` / `replace_logging_context(...)`) and simplified tests to use `push_logging_context(replace=True)`.
- Fixed the `RuntimeWarning: coroutine ... was never awaited` from `AsyncDebouncer` by ensuring background tasks are spawned from coroutine factories (and `AsyncDebouncer` cancels/cleans up its scheduler task).
- Added retention limits and basic filtering UI for frontend backend-log-events (cap events + filter by project/severity/search).

What’s Well Thought Out

- Central logging bootstrap with consistent formatter + %(setta_context)s filter is solid: backend/setta/logging/config.py:28, backend/setta/logging/context.py:93.
- Request/websocket/task context propagation is coherent and explicit: backend/setta/middleware/logging_context.py:16, backend/setta/logging/context_bindings.py:18, backend/setta/logging/tasks.py:15.
- Global FastAPI exception handlers reliably surface errors to the UI (and try to avoid double-emits via backend_log_event_emitted): backend/setta/server.py:157, backend/setta/server.py:202.

Bugs / Gaps

- (Resolved) Extra-positional-arg `TypeError` in `log_failure_and_broadcast_backend_log_event(...)` call sites.
- (Resolved) Missing tracebacks from `log_route_failure(...)`.
- (Updated) HTTP request context binding is no longer “duplicate work”:
  - Middleware binds pre-routing fields (`request_id`, `method`, `path`, `client`).
  - A FastAPI dependency binds post-routing fields (`endpoint`, inferred `project_id`).
  This keeps the separation explicit while still capturing `path_params`/`endpoint` (which middleware can’t reliably see).
- (Resolved) Removed at least one concrete double-emit path (chat-not-found).
- (Resolved) Listener error visibility gap (backend now emits a frontend backend-log-event alongside `WebsocketMsgListenerError`).
- (Improved) Listener logs now have context for the connection loop; remaining gaps (if any) should be addressed by ensuring all listener entrypoints run inside a bound listener context.

Cleanup Candidates (Unused / Inconsistent)

- (Resolved) Logging-context helper “dead code”: `clear_logging_context(...)` / `replace_logging_context(...)` removed; tests updated accordingly.
- Startup task handling: `_initialization_task` is no longer unused; readiness now awaits it so initialization failures propagate.
- `print(...)` bypasses structured logging: partially resolved (still present in a few places, e.g. `backend/setta/code_gen/python/code_generator.py` and `backend/setta/mcp/server.py`).

Remaining Work

- Optional: remove remaining `print(...)` calls (non-core paths) if you want *all* output to flow through structured logging.
