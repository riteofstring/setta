Overall

- Logging is unusually cohesive and “system-designed”, not ad-hoc: centralized bootstrap (backend/setta/logging/config.py:28), request/websocket/task correlation via contextvars (backend/setta/logging/context.py:86 + backend/setta/middleware/logging_context.py:15), and a single structured failure helper (backend/setta/logging/errors.py:19).
- Error surfacing to the UI is thoughtfully integrated: global exception handlers broadcast “backend log events” for HTTP failures (backend/setta/server.py:158).

Refactor status (already done)

- HTTP backend-log-event emission is centralized in the global exception handlers; routes should raise and let the global handler emit the UI event (removed request-scoped backend_log_event_emitted dedupe).
- Project-scoped request context is now explicit/opt-in for HTTP bodies via ProjectIdContextRoute / @require_project_context() (backend/setta/logging/project_id_route.py).
- Fixed a websocket reliability bug: WebsocketManager.broadcast() now iterates a snapshot so send_message() can drop disconnected sockets without “dict changed size during iteration” (backend/setta/websockets/websocket_manager.py:82).
- LSP reader no longer hides parse/processing failures behind debug logs; it now emits structured ERROR logs (with tracebacks) and continues the reader loop (backend/setta/lsp/reader.py).

What’s working well

- Lazy logging style is consistent (no f-string logging), so “disabled” logs are cheap.
- Request context lifecycle is correct for ASGI/streaming: the middleware keeps context active through response sending and enriches at http.response.start (backend/setta/middleware/logging_context.py:15).
- The “handled vs unhandled” concept is consistently captured (failure_handled, failure_label) and used to pick level (WARNING vs ERROR) (backend/setta/logging/errors.py:19).

Key gaps / correctness risks

- (Resolved) WebsocketManager.broadcast() previously iterated self.sockets.items() while send_message() could pop() sockets; that could raise “dict changed size during iteration” under disconnect pressure (backend/setta/websockets/websocket_manager.py:82).

Performance / noise

- The per-record filter work is heavier than it needs to be: LoggingContextFilter calls get_logging_context() (copies dict) and sorts keys every log record (backend/setta/logging/context.py:86). With access logs
enabled, that’s at least once per request, plus any app logs.
- Pydantic redaction does get_type_hints() every time a model is sanitized (backend/setta/logging/redaction.py:16), which is relatively expensive; caching sensitive-field sets per model class would materially
reduce overhead if models are ever added to context frequently.
- Access logs are always INFO when enabled, regardless of the configured root level (backend/setta/logging/config.py:28). That’s fine for dev, but can be noisy in “info-but-not-that-much” environments.

Places where errors are likely being hidden

- (Resolved) LSP reader errors are no longer “debug-only”: parse/processing failures now produce structured ERROR logs (backend/setta/lsp/reader.py).

Unused / cleanup candidates (logic, not Ruff-unused)

- WebsocketManager.pending_requests appears unused in this class (backend/setta/websockets/websocket_manager.py:25).
- LoggingContext.push_logging_context(replace=...) exists but isn’t used anywhere; same for log_route_failure(..., include_traceback=...) (currently no call sites). These are fine as “API headroom”, but if you
want to trim surface area, they’re candidates.
- (Resolved) WebsocketManager.on_disconnect() no longer catches ConnectionClosedError; it now pop()s the socket and broadcasts only when a socket was actually removed.
