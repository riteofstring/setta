What’s Working Well

- Centralized bootstrap + consistent formatting is solid (backend/setta/logging/config.py:28) and correctly keeps Uvicorn from overriding formatting (log_config=None in backend/setta/start.py:1 / backend/setta/
backend_launcher.py:1).
- contextvars-based setta_context is well designed: the expensive work (sanitization + string formatting) happens on context updates, not on every log call (backend/setta/logging/context.py:46, backend/setta/
logging/context.py:88).
- Redaction/truncation is thoughtful and cached for Pydantic model field inspection (backend/setta/logging/redaction.py:1).
- Request-scoped context is correctly kept alive for the whole response send via pure ASGI middleware (good choice for streaming) (backend/setta/middleware/logging_context.py:15).
- Central exception handlers + UI surfacing are consistent and match the doc (backend/setta/server.py:157, backend/setta/websockets/msg_handlers/frontend_sender.py:78).

Main Gaps / Risks

- handled semantics in background tasks are a bit inverted: today “handled” is effectively being used as “exception was swallowed”, not “expected/acceptable failure”. The default path is:
    - spawn_background_task(..., re_raise=False) (default) wraps run_safely(..., re_raise=re_raise) (backend/setta/logging/tasks.py:15).
    - run_safely logs failures with handled=not re_raise (backend/setta/logging/errors.py:46).
    - so the default is: background task exception → handled=True → WARNING + failure_handled=true in setta_context, and the exception is swallowed (returns None).
    This can under-signal serious failures: background tasks crashing is often not “handled” in the semantic sense, it’s just “not re-raised to avoid killing the loop”. Consider splitting “swallow vs re-raise” from “handled vs unhandled” (or defaulting background task failures to unhandled/ERROR unless explicitly marked handled).
- Context string formatting doesn’t escape spaces, so values like paths can make key=value parsing ambiguous (backend/setta/logging/context.py:133). If you rely on grep/filtering by setta_context, this is a
footgun.

Resolved

- run_safely now logs synchronous exceptions thrown by a “coroutine factory” (i.e., an exception raised before returning an awaitable), so these failures get structured log_failure output instead of unstructured “Task
exception was never retrieved” (backend/setta/logging/errors.py:46).
- Handled failures no longer always include tracebacks: log_failure omits tracebacks for handled=True unless SETTA_LOG_LEVEL=DEBUG or SETTA_HANDLED_TRACEBACKS=1 (backend/setta/logging/errors.py:19). Routine handled 4xx
remain WARNING without the traceback; 422 is considered a server bug and remains ERROR + traceback (backend/setta/server.py:174).
- Frontend “Backend Logs” broadcasting respects a severity threshold: events below SETTA_UI_LOG_LEVEL are dropped (defaulting to the effective root logger level, i.e. SETTA_LOG_LEVEL) (backend/setta/websockets/msg_handlers/
frontend_sender.py:61).
- Watcher noise no longer floods the UI: artifacts + jsonSource watcher activity is backend-only DEBUG logging (backend/setta/project_state/artifacts.py:165, backend/setta/project_state/jsonSource/jsonSource.py:189).
- Added a helper for “log + broadcast” non-exception events: `log_and_broadcast_backend_log_event(...)`, and migrated call sites so the frontend BackendLogEventArea is a subset of backend logs (backend/setta/websockets/msg_handlers/frontend_sender.py:103).
- UI log events are no longer used for “operational telemetry” (watchers/per-file updates); those are backend DEBUG logs now, and UI events are reserved for user-relevant status + warnings/errors.

Dead Code / Cleanup Opportunities

- Duplicate keys in _PROJECT_PARAM_KEYS (backend/setta/logging/context_sources.py:14).
- build_request_context(..., project_config_id=...) exists but isn’t used anywhere (all call sites pass only request) (backend/setta/logging/context_sources.py:34).
- The bind_websocket_logging_context helper is used, but the optional websocket_id=... argument is currently unused by call sites (they rely on ensure_websocket_context(...) to auto-generate a ws-... id) (backend/setta/logging/context_bindings.py:19).

Overall Assessment

- The logging architecture is generally well thought out and performant for its intended use (precomputed context string + minimal per-record overhead).
- The biggest remaining practical issues are background task handled semantics and unescaped spaces in the context string.
