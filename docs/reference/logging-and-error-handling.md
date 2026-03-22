# Logging and Error Handling (Backend)

This document describes how Setta’s backend handles logging and errors, and how those
signals reach (1) developer-visible server logs and (2) user-visible UI “backend log
events”.

The active backend HTTP/websocket/MCP runtime is Go-owned. Python details in this
document apply only to retained Python listener/share helpers, not to the main
backend transport/runtime.

## Goals

- Make backend logs easy to correlate across HTTP requests, websockets, and background
  tasks via a shared structured context string.
- Ensure failures are logged consistently (labelled, with an explicit “handled vs
  unhandled” signal) without adding lots of ad-hoc try/except blocks.
- Surface important failures to the frontend in a controlled way (severity filtering).

## High-Level Architecture

There are two parallel outputs:

1. **Backend logging output** (stdout/stderr and optional file):
   - The active backend runtime logs through Go packages such as
     `internal/httpapi`, `internal/backendlogs`, and related services.
   - Retained Python listener/share helpers still use
     `setta.logging.config.configure_listener_logging()` and related Python
     context helpers.

2. **Frontend “backend log events”** (websocket broadcast to UI):
   - Sent by the Go-owned `internal/backendlogs.Service` over `/ws/frontend`.
   - Used for user-facing messages like “MCP Server Ready” and for surfacing failures.

## Logging Configuration

### Entry Points

- Shipped backend runtime: the packaged Go CLI/server owns the main backend
  logging path.
- Listener scripts: `backend/setta/api/listener.py` uses
  `configure_listener_logging()` (same format, access logger disabled).

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

- Active Go middleware: `internal/httpapi/httpapi.go`
  - Adds `request_id` and logs request method/path/status through the Go
    request, recovery, and access-log middleware stack.

**Websocket connections**

- Active Go transport: `internal/wsapi`
  - Resolves connection type, auth, and mode/share-session context before
    handing the socket to the route-specific handler.

**Project context (`project_config_id`)**

Many endpoints include a project id in their request JSON body. On the active Go
surface, handlers validate `projectConfigId` explicitly and fail with the
canonical `project_config_id_required` error when it is missing:

- Project routes: `internal/httpapi/project_routes.go`
- Project shell routes: `internal/httpapi/project_shell_routes.go`

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

Retained Python listener/share helpers still use `re_raise=True` selectively
for must-succeed background tasks and use the default (swallow) for many
long-lived or optional loops.

## When To Use Which

Rules of thumb for choosing between local logging/broadcasting helpers vs relying on
global handling:

- **HTTP routes**: Prefer returning or propagating errors through the active
  surface's centralized handling. On the Go backend this means using the shared
  `internal/httpapi` helpers and per-route error mapping instead of adding
  route-local duplicate logging.
- **HTTP routes with custom behavior**: Catch exceptions only when you must translate
  them into a specific status/message (e.g. domain error → `HTTPException(4xx)`), or
  you need to do local cleanup/rollback before re-raising.
- **Websockets**: Handle errors at the loop boundary (log + optionally
  broadcast) and then close. The active shared pattern lives in `internal/wsapi`
  and the route-specific websocket handlers under `internal/wsapi/routes.go`.
- **Background tasks / long-lived loops**: Use `spawn_background_task(...)` so failures
  are labeled and context is preserved. Use `re_raise=True` for must-succeed tasks
  (startup/core orchestration); leave it False for resilient “keep running” tasks.
- **Log-only vs UI-visible**:
  - Use `log_failure(...)` when you want consistent server-side error logs and *no*
    user-facing UI message is needed (or when there is already another UI surface).
  - For UI-visible websocket diagnostics, use the active Go-owned websocket/runtime
    path (`internal/wsapi`, `internal/realtime`, or the route-specific caller surface)
    instead of reviving the deleted Python `WMHFrontendSender` helper path.
  - If a retained Python helper needs optional UI broadcast integration, keep it behind
    a narrow caller-supplied interface and fall back to `log_failure(...)` when no
    broadcaster is available.
- **User notifications**: If the UX should show a persistent “Saved!”-style message,
  send a `SettaNotification` via `broadcast_notification(...)` instead of a backend log
  event.

## HTTP Error Handling

The legacy top-level Python HTTP app in `backend/setta/server.py` used shared
exception handlers, but that module has been removed as part of the Go rewrite.
There is no current retained Python HTTP surface that owns backend-wide error
handling now.

The active main backend HTTP error handling now lives in the Go runtime.

## Websocket Error Handling

Two main patterns exist:

- The shared Go websocket transport in `internal/wsapi` resolves auth/mode
  context, maps close reasons, and closes the connection on handler failure.
- Route-specific websocket handlers in `internal/wsapi/routes.go` and
  higher-level services under `internal/app` follow the same “log + UI
  broadcast + close” pattern where the behavior is user-visible.

## Listener (External Process) Error Handling

Listener scripts are clients that connect over websockets:

- They configure logging via `configure_listener_logging` and bind a `logging_context`
  containing `listener_id` and `listener_socket_id`.
- Many failures use `logger.exception(...)` for stack traces and continue retry loops
  (intentionally resilient behavior).

Listener → backend error mapping for “emit to frontend” is more structured:

- Listener emit translation raises typed errors (for example
  `listenerEmitUnknownDependencyError`) in
  `internal/wsapi/listener_frontend_emit.go`.
- The Go listener websocket handler resolves those into structured
  `ListenerError` messages back to the listener
  (`internal/wsapi/routes.go`, `internal/wsapi/listener_frontend_emit.go`).

## MCP Tool Error Handling

- The active MCP server/runtime is Go-owned under `internal/mcpx`, which maps
  tool/runtime failures into structured responses.
- The packaged Go stdio bridge (`setta mcp`) is transport-thin; with
  `--verbose` it emits bridge read/write shutdown details to stderr from
  `internal/settacmd/mcp.go` and `internal/mcpx/stdio_bridge.go`.

## UI “Backend Log Events”

The backend can broadcast log events to the frontend via websockets:

- Core sender: `internal/backendlogs/service.go`
  - `LogAndBroadcast(...)` writes to server logs and broadcasts.
  - The service sends `BackendLogEvent` envelopes to `/ws/frontend`.

UI event filtering:

- `SETTA_UI_LOG_LEVEL` controls the minimum severity that will be sent to the UI.
- If unset, it defaults to the current effective root log level.

### Backend Logs pane (frontend)

The Overview `Backend Logs` tab (`frontend/src/components/Panes/Overview/BackendLogEventsArea.tsx`)
consumes these events and provides a diagnostics-focused UI:

- Filter controls:
  - project scope (`All` or a specific project config),
  - minimum severity (`info` / `warning` / `error` / `critical`),
  - text query against message content.
- List behavior:
  - rows are virtualized (`react-window`) for large event volumes,
  - selecting a row opens a detail panel with the full multiline message,
  - high-severity events are marked read when the pane mounts.
- Table ergonomics:
  - `Time`, `Severity`, and `Project` headers are draggable resize columns,
  - horizontal overflow is handled by an outer scroll shell so widened columns
    remain readable.
- Clipboard affordances:
  - each row exposes a copy action for the full message,
  - the selected-message panel also has a dedicated copy button with success/fail
    feedback.

## Notifications Are Separate

`SettaNotification` is a separate concept from UI “backend log events”.

- Notifications are user-facing events (for example “Saved!” / “Autosaved!”)
  stored/retrieved via the backend notification path (see
  `internal/httpapi/project_shell_routes.go` and `internal/notifications`).
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
- For Go routes, validate and normalize `projectConfigId` at the handler boundary
  in `internal/httpapi/*` rather than relying on custom Python router wrappers.

## Relevant Environment Variables

- `SETTA_LOG_LEVEL`: backend log level default (used by `configure_logging`).
- `SETTA_LISTENER_LOG_LEVEL`: listener log level default (used by
  `configure_listener_logging`).
- `SETTA_HANDLED_TRACEBACKS`: when truthy, include tracebacks for handled failures.
- `SETTA_UI_LOG_LEVEL`: minimum severity for UI backend log event broadcasts.
