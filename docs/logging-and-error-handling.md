# Logging and Error Handling (Backend)

This document describes how Setta’s backend handles logging and errors, and how those
signals reach (1) developer-visible server logs and (2) user-visible UI “backend log
events”.

## Goals

- Make backend logs easy to correlate across HTTP requests, websockets, and background
  tasks via a shared structured context string.
- Ensure failures are logged consistently (labelled, with an explicit “handled vs
  unhandled” signal) without adding lots of ad-hoc try/except blocks.
- Surface important failures to the frontend in a controlled way (severity filtering).

## High-Level Architecture

There are two parallel outputs:

1. **Python logging output** (stdout/stderr and optional file):
   - Configured via `setta.logging.config.configure_logging()` (backend) and
     `setta.logging.config.configure_listener_logging()` (listener scripts).
   - All logs include a formatted `setta_context` field built from contextvars.

2. **Frontend “backend log events”** (websocket broadcast to UI):
   - Sent via `setta.websockets.msg_handlers.frontend_sender.WMHFrontendSender`.
   - Used for user-facing messages like “MCP Server Ready” and for surfacing failures.

## Logging Configuration

### Entry Points

- Backend CLI: `backend/setta/start.py` calls `configure_logging()` before starting
  uvicorn, and passes `log_config=None` so uvicorn does not install its own logging
  config.
- Packaged background runner: `backend/setta/backend_launcher.py` does the same.
- Listener scripts: `backend/setta/api/listener.py` uses
  `configure_listener_logging()` (same format, no uvicorn access logger).

### Formatting

`configure_logging()` installs a `LoggingContextFilter` so every record has a
`setta_context` attribute. The default format is:

```
%(asctime)s | %(levelname)-8s | %(name)s | %(setta_context)s | %(message)s
```

Access logs use a slightly shorter format and a dedicated handler when enabled.

## Structured Context (`setta_context`)

### How Context Works

Context is stored in a contextvar and rendered as a logfmt-like string:

- Code: `backend/setta/logging/context.py`
- Primary helpers:
  - `logging_context(...)` (context manager)
  - `push_logging_context(...)` / `reset_logging_context(...)`
  - `get_logging_context()` (snapshot for consumers)

Values are normalized and sanitized:

- Strings are truncated and newline-normalized.
- Collections are summarized (sample + len).
- Pydantic models are dumped and redacted (see Redaction).

### Context Sources

**HTTP requests**

- Middleware: `backend/setta/middleware/logging_context.py`
  - Adds `request_id`, `method`, `path`, and `client` (when available).
  - Enriches `endpoint` once routing has resolved it (at first response start).
- Dependency: `bind_request_logging_context` adds `endpoint` for FastAPI dependency
  flows (where middleware scope may not cover all desired work).

**Websocket connections**

- Context manager: `backend/setta/logging/context_bindings.py`
  - Adds `websocket_id`, `path`, optional `project_config_id`, and `client`.
- Router loop: `backend/setta/routers/websocket.py`
  - Adds `connection_type` and optional `client_connection_id` / `connection_id`.

**Project context (`project_config_id`)**

Many endpoints include a project id in their request JSON body. For those, Setta
extracts and binds `project_config_id` automatically:

- Route class: `backend/setta/logging/project_id_route.py`
  - `ProjectIdContextRoute` inspects JSON bodies and calls `push_logging_context(...)`.
- Router wrapper: `backend/setta/routers/setta_api_router.py`
  - `SettaProjectContextAPIRouter(..., require_project_context_by_default=True)` marks
    routes so missing project ids become hard failures (KeyError).
- Endpoint decorator: `@require_project_context(...)` opts individual endpoints in.

**Background tasks**

- Helper: `backend/setta/logging/tasks.py::spawn_background_task`
  - Attaches a canonical “task context” (`task`, plus optional ids) and runs the task
    under that context.
  - Preserves contextvars across task boundaries so logs from the task still contain
    request/websocket/project identifiers when provided.

## Redaction

Redaction and size limits are implemented in `backend/setta/logging/redaction.py` and
apply to any values inserted into logging context.

Supported mechanisms:

- `pydantic.SecretStr` / `pydantic.SecretBytes` are redacted automatically.
- Pydantic fields annotated with `typing.Annotated[..., Sensitive()]` are redacted
  when a model is placed into logging context.

This is intended for logging *context* values; it does not automatically redact
arbitrary free-form log message strings.

## Failure Logging Helpers

### `log_failure(...)`

`backend/setta/logging/errors.py::log_failure` is the main structured failure logger.
It:

- Adds `failure_label` and `failure_handled` into the context for that log call.
- Logs at `ERROR` for unhandled failures and `WARNING` for handled failures.
- Includes a traceback for unhandled failures by default.
- For handled failures, includes a traceback only when:
  - `SETTA_HANDLED_TRACEBACKS` is truthy, or
  - the logger is in DEBUG.

### `run_safely(...)`

`run_safely` executes a coroutine (or coroutine factory) and, on failure:

- calls `log_failure(...)`,
- returns `None` by default, or re-raises when `re_raise=True`.

### `spawn_background_task(...)`

`spawn_background_task` runs the given coroutine under a logging context and uses
`run_safely` to provide consistent failure logging. Important behavior:

- Default behavior is **log + swallow** (task completes with `None`) unless
  `re_raise=True`.
- Use `re_raise=True` for “must not die” infrastructure tasks when you want the
  exception to propagate to the task and be detectable via awaiting or
  `task.exception()`.

The backend uses `re_raise=True` for initialization (`backend/setta/server_state.py`)
and uses the default (swallow) for many long-lived or optional background tasks.

## When To Use Which

Rules of thumb for choosing between local logging/broadcasting helpers vs relying on
global handling:

- **HTTP routes (FastAPI)**: Prefer raising `HTTPException` (or letting exceptions
  bubble) and rely on the global handlers in `backend/setta/server.py` to log and (when
  initialized) broadcast. Avoid adding per-route `try/except` blocks solely to log,
  because that typically double-logs.
- **HTTP routes with custom behavior**: Catch exceptions only when you must translate
  them into a specific status/message (e.g. domain error → `HTTPException(4xx)`), or
  you need to do local cleanup/rollback before re-raising.
- **Websockets**: There is no FastAPI “global exception response” path for websocket
  loops, so handle errors at the loop boundary (log + optionally broadcast) and then
  re-raise/close. The shared pattern is in `backend/setta/routers/websocket.py`.
- **Background tasks / long-lived loops**: Use `spawn_background_task(...)` so failures
  are labeled and context is preserved. Use `re_raise=True` for must-succeed tasks
  (startup/core orchestration); leave it False for resilient “keep running” tasks.
- **Log-only vs UI-visible**:
  - Use `log_failure(...)` when you want consistent server-side error logs and *no*
    user-facing UI message is needed (or when there is already another UI surface).
  - Use `WMHFrontendSender.log_failure_and_broadcast_backend_log_event(...)` when the
    failure should show up in the UI as a diagnostic/error banner (and still be logged
    server-side).
  - Use `WMHFrontendSender.log_and_broadcast_backend_log_event(...)` for non-exception
    status messages that should also appear in server logs (e.g. “Started command”).
- **User notifications**: If the UX should show a persistent “Saved!”-style message,
  send a `SettaNotification` via `broadcast_notification(...)` instead of a backend log
  event.

## HTTP Error Handling

Global exception handling is centralized in `backend/setta/server.py`:

- `RequestValidationError` (FastAPI/Pydantic input validation):
  - Logged and broadcast with label `fastapi-validation-error`.
  - Returns status `422` with a custom payload shape
    (`{"status_code": 10422, "message": "...", "data": null}`).
- `HTTPException`:
  - Logged and broadcast with label `fastapi-http-exception`.
  - “Handled” is treated as: `status < 500` and `status != 422`.
    - Handled → WARNING severity
    - Unhandled (5xx and 422) → ERROR severity
  - Response is delegated to FastAPI’s `http_exception_handler`.
- Any other exception:
  - Logged and broadcast with label `fastapi-unhandled-exception`.
  - Returns a generic `500 Internal Server Error` payload (no exception text).

When the app is fully initialized, `_log_and_broadcast_http_error` uses
`SettaFastAPIState.wmh_frontend_sender.log_failure_and_broadcast_backend_log_event(...)`
so errors appear in the UI; during early boot it falls back to server-side logging.

## Websocket Error Handling

Two main patterns exist:

- The shared router loop (`backend/setta/routers/websocket.py`) wraps the connection
  lifecycle and logs/broadcasts any unexpected exception with label
  `websocket-route-loop`, then re-raises (allowing the server to close the connection).
- Specialized websocket endpoints (for example terminals in
  `backend/setta/routers/terminals.py`) follow the same “log + UI broadcast + re-raise”
  pattern.

## Listener (External Process) Error Handling

Listener scripts are clients that connect over websockets:

- They configure logging via `configure_listener_logging` and bind a `logging_context`
  containing `listener_id` and `listener_socket_id`.
- Many failures use `logger.exception(...)` for stack traces and continue retry loops
  (intentionally resilient behavior).

Listener → backend error mapping for “emit to frontend” is more structured:

- Listener emit translation raises typed errors (for example
  `UnknownListenerDependencyError`) in
  `backend/setta/listeners/listener_frontend_emit_resolver.py`.
- The websocket receiver catches these and sends typed error messages back to the
  listener, usually logging them as warnings
  (`backend/setta/websockets/msg_handlers/python_script_receiver.py`).

## MCP Tool Error Handling

- The MCP server wraps tool exceptions into `ToolError` so callers get structured
  failures (`backend/setta/mcp/server.py`).
- The MCP client retries its SSE connection loop and uses `logger.exception(...)` on
  failures (`backend/setta/mcp/client.py`).

## UI “Backend Log Events”

The backend can broadcast log events to the frontend via websockets:

- Core sender: `backend/setta/websockets/msg_handlers/frontend_sender.py`
  - `broadcast_backend_log_event(...)` sends a message to frontend connections.
  - `log_and_broadcast_backend_log_event(...)` writes to server logs and broadcasts.
  - `log_failure_and_broadcast_backend_log_event(...)` logs a structured failure via
    `log_failure(...)` then emits a UI event message.

UI event filtering:

- `SETTA_UI_LOG_LEVEL` controls the minimum severity that will be sent to the UI.
- If unset, it defaults to the current effective root log level.

## Notifications Are Separate

`SettaNotification` is a separate concept from UI “backend log events”.

- Notifications are user-facing events (for example “Saved!” / “Autosaved!”) sent via
  `WMHFrontendSender.broadcast_notification(...)` and typically stored/retrieved via
  the DB layer (see endpoints like `backend/setta/routers/projects.py`).
- Backend log events are primarily diagnostic/status messages (optionally including
  failures) sent via `broadcast_backend_log_event(...)` and filtered by
  `SETTA_UI_LOG_LEVEL`.

## Developer Guidelines

- Prefer `log_failure(exc, label=..., handled=...)` for exception logging so failures
  are consistently labeled and filterable.
- Use `handled=True` for expected-but-not-fatal failures where WARNING is appropriate.
- Use `spawn_background_task(..., label=...)` for background work so context is
  preserved and failures are logged consistently.
- Choose `re_raise=True` for background tasks that must crash loudly (startup or core
  processing loops).
- Bind project ids to context for endpoint-driven operations using
  `SettaProjectContextAPIRouter` and/or `@require_project_context()` rather than
  manually threading ids through every log call.

## Relevant Environment Variables

- `SETTA_LOG_LEVEL`: backend log level default (used by `configure_logging`).
- `SETTA_LISTENER_LOG_LEVEL`: listener log level default (used by
  `configure_listener_logging`).
- `SETTA_HANDLED_TRACEBACKS`: when truthy, include tracebacks for handled failures.
- `SETTA_UI_LOG_LEVEL`: minimum severity for UI backend log event broadcasts.
