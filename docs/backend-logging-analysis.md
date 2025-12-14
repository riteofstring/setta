Overall

- Logging is unusually cohesive and “system-designed”, not ad-hoc: centralized bootstrap (backend/setta/logging/config.py:28), request/websocket/task correlation via contextvars (backend/setta/logging/context.py:24 + backend/setta/middleware/logging_context.py:15), and a single structured failure helper (backend/setta/logging/errors.py:19).
- Error surfacing to the UI is thoughtfully integrated: global exception handlers broadcast “backend log events” for HTTP failures (backend/setta/server.py:158).

Refactor status (already done)

- HTTP backend-log-event emission is centralized in the global exception handlers; routes should raise and let the global handler emit the UI event (removed request-scoped backend_log_event_emitted dedupe).
- Project-scoped request context is now explicit/opt-in for HTTP bodies via ProjectIdContextRoute / @require_project_context() (backend/setta/logging/project_id_route.py).
- Fixed a websocket reliability bug: WebsocketManager.broadcast() now iterates a snapshot so send_message() can drop disconnected sockets without “dict changed size during iteration” (backend/setta/websockets/websocket_manager.py:68).
- LSP reader no longer hides parse/processing failures behind debug logs; it now emits structured ERROR logs (with tracebacks) and continues the reader loop (backend/setta/lsp/reader.py).
- LoggingContextFilter no longer does per-record work: the contextvar stores a snapshot with a preformatted `setta_context` string, and the filter just attaches the string (backend/setta/logging/context.py:92).
- Pydantic redaction no longer does repeated type-hint introspection: sensitive-field sets are cached per Pydantic model class (backend/setta/logging/redaction.py).
- Access logs no longer force INFO: uvicorn.access now follows the configured log level (backend/setta/logging/config.py:105).
- Removed unused websocket “request routing” plumbing (pending_requests/message_id_to_sender_id/process_json_str/return_to_requester) (backend/setta/websockets/websocket_manager.py).

What’s working well

- Lazy logging style is consistent (no f-string logging), so “disabled” logs are cheap.
- Request context lifecycle is correct for ASGI/streaming: the middleware keeps context active through response sending and enriches at http.response.start (backend/setta/middleware/logging_context.py:15).
- The “handled vs unhandled” concept is consistently captured (failure_handled, failure_label) and used to pick level (WARNING vs ERROR) (backend/setta/logging/errors.py:19).

Key gaps / correctness risks

- (Resolved) WebsocketManager.broadcast() previously iterated self.sockets.items() while send_message() could pop() sockets; that could raise “dict changed size during iteration” under disconnect pressure (backend/setta/websockets/websocket_manager.py:68).

Performance / noise

- (Resolved) The per-record filter work is no longer expensive: formatting/sorting happens only when context changes (push), not on every log record; the filter attaches a precomputed `setta_context` string (backend/setta/logging/context.py:92).
- (Resolved) Pydantic redaction no longer does get_type_hints() on every sanitize; sensitive-field discovery is cached per model class (backend/setta/logging/redaction.py).
- (Resolved) Access logs no longer force INFO; they follow the configured log level (backend/setta/logging/config.py:105).

Places where errors are likely being hidden

- (Resolved) LSP reader errors are no longer “debug-only”: parse/processing failures now produce structured ERROR logs (backend/setta/lsp/reader.py).

Unused / cleanup candidates (logic, not Ruff-unused)

- LoggingContext.push_logging_context(replace=...) exists but isn’t used anywhere; same for log_route_failure(..., include_traceback=...) (currently no call sites). These are fine as “API headroom”, but if you
want to trim surface area, they’re candidates.
- (Resolved) WebsocketManager.on_disconnect() no longer catches ConnectionClosedError; it now pop()s the socket and broadcasts only when a socket was actually removed.
