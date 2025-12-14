Backend Logging & Error Handling
===============================

This document describes the current backend logging + error surfacing behavior.

Goals:
- Keep logs readable by default (CLI, embedded launcher, listener, MCP bridge).
- Attach small `setta_context` metadata to each record for filtering (request/websocket/project/task).
- Surface user-relevant backend failures to the frontend as websocket “backend log events”.

Logging bootstrap
-----------------

- Central config lives in `backend/setta/logging/config.py`:
  - `configure_logging(...)` for backend/uvicorn processes.
  - `configure_listener_logging(...)` for the standalone listener client (no uvicorn access logger).
- Uvicorn entry points call `configure_logging(...)` and pass `log_config=None` so uvicorn does not override formatting:
  - `backend/setta/start.py` (CLI) and `backend/setta/backend_launcher.py` (embedded).
- Other shipped processes that want the same console formatting also call the bootstrap:
  - `backend/setta/mcp/client.py` and `backend/setta/api/listener.py`.
- Default log level is `INFO`; overrides:
  - Env: `SETTA_LOG_LEVEL`, `SETTA_LISTENER_LOG_LEVEL`
  - CLI: `--log-level` in `backend/setta/start.py`
- The configured formats include `%(setta_context)s` (it renders `-` when no context is bound).

Logging context (`setta_context`)
--------------------------------

- Context is stored in a `contextvars` snapshot and attached to log records by `setta.logging.context.LoggingContextFilter` (`backend/setta/logging/context.py`).
- `push_logging_context(...)` / `logging_context(...)` merge keys into the current snapshot; values are normalized to strings.
- `setta_context` renders in a logfmt-style `key=value` format; values are quoted/escaped as needed (e.g. spaces in paths).
- Values may be arbitrary Python objects; normalization uses `backend/setta/logging/redaction.py`:
  - Pydantic fields annotated with `Annotated[..., Sensitive()]` are redacted.
  - Long strings are truncated; large collections are summarized.

Where context comes from
-----------------------

- HTTP
  - `backend/setta/middleware/logging_context.py` (pure ASGI middleware) binds early fields for the full request/response send:
    - `request_id`, `method`, `path`, optional `client`
  - On the first `http.response.start`, it enriches context with `endpoint` (so streaming/access logs still include the route name).
  - FastAPI dependency `bind_request_logging_context` also binds `endpoint` during handler execution (the server wires it in as a global dependency in `backend/setta/server.py`).
- Project scoping (`project_config_id`)
  - Routers built via `SettaProjectContextAPIRouter` use `ProjectIdContextRoute` (`backend/setta/logging/project_id_route.py`).
  - If an endpoint is decorated with `@require_project_context(...)` (or the router is created with `require_project_context_by_default=True`), the route reads the request JSON body and pushes `project_config_id` into the logging context.
  - Missing/`null` project ids raise `KeyError` (hard failure by design).
- WebSockets
  - `bind_websocket_logging_context(...)` binds `websocket_id`, `path`, optional `client`, plus caller-provided `project_config_id` / `extra_values` (`backend/setta/logging/context_bindings.py`).
  - There is no heuristic extraction of `project_config_id` from websocket URL params or query params; callers must pass it explicitly when they want it in logs/UI error events.
  - The main websocket loop adds the websocket-manager id as `connection_id` after `on_connect` (`backend/setta/routers/websocket.py`).
- Background tasks
  - `spawn_background_task(...)` binds `task` plus optional `project_config_id` / `request_id` / `websocket_id` (`backend/setta/logging/tasks.py`).
- Listener client
  - The listener uses `logging_context(...)` with `listener_id`, `listener_socket_id`, and `listener_endpoint` while connecting (`backend/setta/api/listener.py`).

Failures + UI surfacing
----------------------

- Structured failure logging (`backend/setta/logging/errors.py`)
  - `log_failure(...)` adds `failure_label` + `failure_handled` into context and always includes tracebacks (`exc_info=...`).
  - `run_safely(...)` wraps awaitables and logs failures with consistent metadata (used by `spawn_background_task`).
- Frontend-facing error surfacing (`backend/setta/websockets/msg_handlers/frontend_sender.py`)
  - `broadcast_backend_log_event(...)` emits an ephemeral UI log line.
  - `log_failure_and_broadcast_backend_log_event(...)` logs via `log_failure(...)` and also emits a UI log event.
- Central exception handlers (`backend/setta/server.py`)
  - `RequestValidationError` (422) is treated as unhandled (`handled=False`) and surfaced as an error log event.
  - `HTTPException(status < 500)` is treated as handled and surfaced as a warning log event.
  - Other exceptions are treated as unhandled and surfaced as an error log event.
  - If app state is unavailable, handlers fall back to `log_failure(...)` without emitting a websocket event.
- Websocket loop failures (`backend/setta/routers/websocket.py`) are logged + surfaced via `log_failure_and_broadcast_backend_log_event(...)`.
- Listener error visibility
  - When the backend sends `WebsocketMsgListenerError` to a listener connection, it also broadcasts a frontend backend-log-event (`backend/setta/websockets/msg_handlers/python_script_receiver.py`).

Backend log events vs notifications
-----------------------------------

- Backend log events (`SettaBackendLogEvent`) are ephemeral UI log lines (`id`, `timestamp`, `severity`, `message`, optional `projectConfigId`).
  - Frontend stores them in `useBackendLogEvents` (capped at 500) and renders them in Overview → Backend Logs.
- Notifications (`SettaNotification`) are toast-style UX messages.
  - The backend currently emits notifications only for manual save and autosave (`backend/setta/routers/projects.py`, `backend/setta/project_state/base_project_manager.py`).
  - Persistence endpoints exist (`route_get_notifications`, `route_delete_notification`), but current code paths do not write notifications into `notifications.json` (only websocket-broadcast them).

Notes
-----

- Keep `setta_context` small; prefer ids/counts in `extra_values={...}` over attaching full payloads.
- Prefer `logger.*(...)` (or `click.echo(...)` for CLI output) over `print(...)` so output stays consistent.
