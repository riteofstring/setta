Backend Logging & Error Handling Plan
=====================================

Goals
-----

- Keep backend logs readable by default (CLI, embedded, MCP bridge).
- Attach small, explicit `setta_context` metadata to every log line so it’s filterable by request/websocket/project/task.
- Surface user-relevant backend failures to the frontend via websocket “backend log events”.

Current State
-------------

1. **Centralized logging bootstrap.**
   - `backend/setta/logging/config.py` provides `configure_logging(...)` (backend) and `configure_listener_logging(...)` (listener scripts).
   - Entry points (`backend/setta/start.py`, `backend/setta/backend_launcher.py`, `backend/setta/mcp/client.py`, `backend/setta/api/listener.py`) call these so `uvicorn` doesn’t override config (`log_config=None`).
   - Log level defaults to `INFO` and can be overridden via `SETTA_LOG_LEVEL` / `SETTA_LISTENER_LOG_LEVEL` (or CLI flags). The formatter includes `%(setta_context)s`.

2. **Context propagation (explicit, contextvars-based).**
   - HTTP: `LoggingContextMiddleware` + `Depends(bind_request_logging_context)` populate context derived from `fastapi.Request` (request id, method/path/endpoint, inferred `project_id`, client).
   - Websockets: `bind_websocket_logging_context` populates websocket context (`websocket_id`, path, inferred `project_id`, client) and accepts `extra_values`. Some loops additionally record the websocket-manager id as `connection_id`.
   - Background tasks: `spawn_background_task(...)` binds task context (`task`, optional `project_id` / `request_id` / `websocket_id`, plus `extra_values`) and logs failures through `run_safely(...)`/`log_route_failure(...)` with `failure_label` + `failure_handled` in-context.

3. **Structured failures + UI surfacing.**
   - `backend/setta/logging/errors.py` (`log_route_failure`, `run_safely`) is the structured failure utility used by `spawn_background_task(...)` and other call sites.
   - `WMHFrontendSender.log_failure_and_broadcast_backend_log_event(...)` is the “log + UI event” helper; it sets `backend_log_event_emitted=true` in the logging context to prevent the global handler from duplicating the UI event.
   - `backend/setta/server.py` has exception handlers that emit backend log events for validation errors (422), `HTTPException`s, and unhandled exceptions. If app state isn’t available, it falls back to `log_route_failure(...)`.

4. **Notifications vs backend log events.**
   - Notifications (`SettaNotification`) are currently used only for deliberate UX cues (manual save + autosave).
   - Everything else that should be visible in the UI should be a backend log event (`SettaBackendLogEvent`: `id`, optional `projectConfigId`, `severity`, `message`, `timestamp`).
   - Frontend handling: websocket receives `WebsocketMsgBackendLogEvent`, stores it in `useBackendLogEvents`, and renders it in `BackendLogEventsArea` (Overview → Backend Logs). The frontend store enforces basic retention and supports filtering/searching.

5. **Listener visibility.**
   - Listener connection loops run under an explicit listener logging context (`listener_id`, `listener_socket_id`, `listener_endpoint`), so listener logs are no longer missing `setta_context` by default.
   - When the backend sends `WebsocketMsgListenerError` to the listener, it also emits a frontend backend-log-event so the UI can’t miss listener failures.

Open Work
---------

1. Replace remaining `print(...)` calls with structured logging (or remove them) so all output flows through the logging system.
2. Keep logging context explicit (prefer passing small `extra_values={...}` over serializing payloads).
3. Ensure any remaining listener entrypoints run inside a bound listener logging context (avoid `setta_context=-` outside the main connection loop).
