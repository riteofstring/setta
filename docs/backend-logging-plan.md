Backend Logging & Error Handling
===============================

This describes the current backend logging/error-handling behavior (not a wishlist).

Goals:
- Keep backend logs readable by default (CLI, embedded, listener, MCP bridge).
- Attach small, explicit `setta_context` metadata to log lines so they’re filterable by request/websocket/project/task.
- Surface user-relevant backend failures to the frontend via websocket “backend log events”.

Logging Bootstrap
-----------------

- `backend/setta/logging/config.py` provides `configure_logging(...)` (backend) and `configure_listener_logging(...)` (external listener process).
- Uvicorn entry points call `configure_logging(...)` and pass `log_config=None` to avoid uvicorn overriding the shared config:
  - `backend/setta/start.py` (CLI) and `backend/setta/backend_launcher.py` (embedded launcher).
- Other processes that should share the same formatting also call the bootstrap:
  - `backend/setta/mcp/client.py` and `backend/setta/api/listener.py`.
- Default log level is `INFO`, override via `SETTA_LOG_LEVEL` / `SETTA_LISTENER_LOG_LEVEL` (or `--log-level` in `backend/setta/start.py`).
- The formatter includes `%(setta_context)s` (it renders `-` when no context is bound).

Logging Context (`setta_context`)
--------------------------------

- Context is stored in `contextvars` and attached to each log record by `setta.logging.context.LoggingContextFilter`.
- Context values are normalized before storage:
  - Values can be arbitrary Python objects (including Pydantic models), not just primitives.
  - Pydantic fields marked as `Annotated[..., Sensitive()]` are redacted when written into context.
  - Long strings are truncated and large collections are summarized.
  - Implementation: `backend/setta/logging/redaction.py` + `backend/setta/logging/context.py`.
- Context binding is explicit and layered so routing data is available:
  - HTTP:
    - Middleware (`backend/setta/middleware/logging_context.py`) binds pre-routing fields: `request_id`, `method`, `path`, `client`.
    - The middleware also enriches context at `http.response.start` with post-routing fields (`endpoint`) so request context is still available during response sending (including streaming/access logs).
    - Project scoping is opt-in: `ProjectIdContextRoute` binds `project_config_id` directly into the logging context when enabled (`backend/setta/logging/project_id_route.py`).
    - Dependency (`bind_request_logging_context`) binds post-routing fields (`endpoint`) during route execution.
  - WebSockets:
    - `bind_websocket_logging_context(...)` binds `websocket_id`, `path`, `client`, inferred `project_config_id`, plus caller-provided `extra_values`.
    - The main websocket loop also adds the websocket-manager id as `connection_id` after `on_connect`.
  - Background tasks:
    - `spawn_background_task(...)` binds `task` plus optional `project_config_id` / `request_id` / `websocket_id`.
  - Listener process:
    - The listener runs under `listener_id`, `listener_socket_id`, and `listener_endpoint` contexts (`backend/setta/api/listener.py`).

Structured Failures + UI Surfacing
---------------------------------

- `backend/setta/logging/errors.py` provides:
  - `log_route_failure(...)` (adds `failure_label` + `failure_handled`; tracebacks are included by default, but can be disabled with `include_traceback=False`).
  - `run_safely(...)` (wrapper used by background tasks).
- `backend/setta/websockets/msg_handlers/frontend_sender.py` provides:
  - `broadcast_backend_log_event(...)` (UI-only log line).
  - `log_failure_and_broadcast_backend_log_event(...)` (log + UI event).
- `backend/setta/server.py` exception handlers emit backend log events for:
  - FastAPI validation errors (422), `HTTPException`, and unhandled exceptions.
  - 422 validation errors are treated as unhandled (`handled=False`) because they typically indicate a contract mismatch.
  - `HTTPException(status < 500)` is treated as handled (`handled=True`), but still broadcasts to the UI (usually as a warning).
  - If app state isn’t available, it falls back to `log_route_failure(...)`.
- Listener error visibility:
  - When the backend sends `WebsocketMsgListenerError` back to the listener, it also emits a frontend backend-log-event (`backend/setta/websockets/msg_handlers/python_script_receiver.py`).

Backend Log Events vs Notifications
----------------------------------

- Backend log events (`SettaBackendLogEvent`) are ephemeral UI log lines: `id`, `timestamp`, `severity`, `message`, optional `projectConfigId`.
  - Frontend receives `WebsocketMsgBackendLogEvent`, stores it in `useBackendLogEvents` (capped at 500; `frontend/src/state/actions/backendLogEvents.ts`), and renders it in `BackendLogEventsArea` (Overview → Backend Logs).
- Notifications (`SettaNotification`) are toast-style UX messages.
  - The backend currently emits notifications only for manual save and autosave (`backend/setta/routers/projects.py`, `backend/setta/project_state/base_project_manager.py`).
  - Notification persistence endpoints exist (`route_get_notifications`, `route_delete_notification`), but the backend does not currently write notifications to the DB.

Notes
-----

- Prefer passing small `extra_values={...}` into context builders rather than serializing payloads into the log context.
- The logging context sanitizer is a safety net, not a license to attach huge objects everywhere. Use ids/counts/samples for large payloads.
- For HTTP routes, prefer raising an `HTTPException` (or letting the exception bubble) and let the global handler emit the UI backend-log-event (avoid route-level “log + broadcast” to prevent duplicate UI events).
- Prefer `logger.*(...)` (or `click.echo(...)` for CLI output) over `print(...)` so output is consistent and structured.
- For tracebacks: handled 4xx failures keep tracebacks enabled by default for debuggability.
- Guardrails: Ruff enables `G` (logging format) and `ARG` (unused args) so logging/arg regressions get caught early.
