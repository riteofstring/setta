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
- Replaced remaining `print(...)` calls with structured logging.

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

- Logging-context helper “dead code”: `clear_logging_context(...)` / `replace_logging_context(...)` are still referenced by tests; if we want to delete them, delete/replace the tests too (no need to keep unused
APIs around).
- Startup task handling: `_initialization_task` is no longer unused; readiness now awaits it so initialization failures propagate.
- `print(...)` bypasses structured logging: resolved (migrated to logging calls).

Remaining Work

- Decide whether to keep or delete `clear_logging_context(...)` / `replace_logging_context(...)` (and update tests accordingly). If kept, clarify intended usage; if deleted, remove call sites/tests and simplify
the public surface area.
- Address the `RuntimeWarning: coroutine ... was never awaited` from `AsyncDebouncer` (seen in unit test output). This isn’t a logging bug, but it’s a real signal that background scheduling isn’t being cleaned
up deterministically in tests.
