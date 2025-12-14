Overall

- Logging is unusually cohesive and “system-designed”, not ad-hoc: centralized bootstrap (backend/setta/logging/config.py:28), request/websocket/task correlation via contextvars (backend/setta/logging/
context.py:86 + backend/setta/middleware/logging_context.py:15), and a single structured failure helper (backend/setta/logging/errors.py:19).
- Error surfacing to the UI is thoughtfully integrated: route/global handlers broadcast “backend log events” and avoid duplicates via backend_log_event_emitted (backend/setta/websockets/msg_handlers/
frontend_sender.py:78, backend/setta/server.py:158).

What’s working well

- Lazy logging style is consistent (no f-string logging), so “disabled” logs are cheap.
- Request context lifecycle is correct for ASGI/streaming: the middleware keeps context active through response sending and enriches at http.response.start (backend/setta/middleware/logging_context.py:15).
- The “handled vs unhandled” concept is consistently captured (failure_handled, failure_label) and used to pick level (WARNING vs ERROR) (backend/setta/logging/errors.py:19).

Key gaps / correctness risks

- (Addressed) project_id inference for HTTP used to only check path/query (backend/setta/logging/context_sources.py), so many POST routes with `projectConfigId` in JSON bodies were missing `project_id` logging
  context. This weakened correlation for unhandled exceptions (global handler often had no project id to attach).
  - Refactor: strict, opt-in project id extraction from JSON bodies via a custom APIRoute wrapper (backend/setta/logging/project_id_route.py).
  - Cleanup: removed HTTP project_id inference from path/query in build_request_context; project_id now only comes from explicit binding (e.g. route wrapper / endpoint push).
  - Usage patterns:
    - Router-level opt-in: SettaProjectContextAPIRouter(require_project_context_by_default=True) (backend/setta/routers/setta_api_router.py) for “project-scoped” router modules.
    - Endpoint-level opt-in: @require_project_context() / @require_project_context(body_key="...") for mixed routers.
  - Predictability: no “guessing” keys; when enabled it requires the configured body key and fails fast (KeyError / JSON decode errors).
  - Efficiency: uses request.json() caching so JSON is parsed once even though FastAPI also validates into Pydantic models.
- backend_log_event_emitted is “sticky” (set via push_logging_context without reset). It prevents duplicates, but it can also suppress later global error broadcasts within the same request/task if multiple
failures occur.
- WebsocketManager.broadcast() iterates self.sockets.items() while send_message() can pop() sockets; that can raise “dict changed size during iteration” under disconnect pressure (backend/setta/websockets/
websocket_manager.py:82). This is both an error-handling and reliability issue.

Performance / noise

- The per-record filter work is heavier than it needs to be: LoggingContextFilter calls get_logging_context() (copies dict) and sorts keys every log record (backend/setta/logging/context.py:86). With access logs
enabled, that’s at least once per request, plus any app logs.
- Pydantic redaction does get_type_hints() every time a model is sanitized (backend/setta/logging/redaction.py:16), which is relatively expensive; caching sensitive-field sets per model class would materially
reduce overhead if models are ever added to context frequently.
- Access logs are always INFO when enabled, regardless of the configured root level (backend/setta/logging/config.py:28). That’s fine for dev, but can be noisy in “info-but-not-that-much” environments.

Places where errors are likely being hidden

- Some components swallow broad exceptions with only debug logging and continue, which can make failures invisible unless you’re already in DEBUG (e.g. LSP reader: backend/setta/lsp/reader.py:1).

Unused / cleanup candidates (logic, not Ruff-unused)

- WebsocketManager.pending_requests appears unused in this class (backend/setta/websockets/websocket_manager.py:25).
- LoggingContext.push_logging_context(replace=...) exists but isn’t used anywhere; same for log_route_failure(..., include_traceback=...) (currently no call sites). These are fine as “API headroom”, but if you
want to trim surface area, they’re candidates.
- WebsocketManager.on_disconnect() catches ConnectionClosedError, but the likely exception there is KeyError (and sends already handle closed sockets). This looks like legacy baggage.
