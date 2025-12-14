Backend Logging & Error Handling Plan
=====================================

Context
-------

- Most people start Setta through the packaged CLI (`setta`) after `pip install setta`, while some embed the backend by calling `backend_launcher.start_backend` or use the MCP bridge (`setta.mcp.client`). All of these paths need predictable logging without extra setup.
- The backend ships to PyPI as a FastAPI app. It has to emit actionable log lines and user-facing errors even when uvicorn is embedded elsewhere, and it needs to keep the `setta_context` metadata on every record so operators can filter by project/request/websocket.
- Python listener scripts (`SettaListener`) run as separate processes that maintain a websocket to the backend and optionally watch local files. They need clear local logs and, ideally, a way to surface failures back to the UI.

Current State
-------------

1. **Logging bootstrap is centralized.** `backend/setta/logging/config.py` defines the shared `logging.config.dictConfig`, exposes both `configure_logging` and `configure_listener_logging`, and attaches the `setta_context` filter. Every entry point (`backend/setta/start.py`, `backend/setta/backend_launcher.py`, `backend/setta/mcp/client.py`, and `backend/setta/api/listener.py`) calls one of these helpers so uvicorn stops reconfiguring the root logger and CLI users inherit INFO-level output unless they override `SETTA_LOG_LEVEL` / `SETTA_LISTENER_LOG_LEVEL`.

2. **HTTP/websocket/background context propagation is wired up, but payload metadata still stops at the middleware boundary.** `LoggingContextMiddleware` together with the global `Depends(bind_request_logging_context)` in `backend/setta/server.py` attaches request ids, paths, and inferred project ids to every HTTP handler. Websocket routes (`backend/setta/routers/websocket.py`) and terminal endpoints (`backend/setta/routers/terminals.py`) wrap connections with `bind_websocket_logging_context`, and long-running work is consistently scheduled through `wrap_background_coroutine` / `wrap_background_callable` (queue processor, `AsyncDebouncer`, JSON-source reloaders, terminal reader/writer, MCP and LSP setup, listener hot-reload watchers, etc.). Tests under `tests/setta/test_logging_context_{middleware,bindings,sources}.py` cover these flows. However, the newer helpers—`ProjectContextModel`, `attach_request_context_models`, `attach_websocket_context_models`, and even `bind_background_task_logging_context`—are not used outside of tests, so POST bodies never contribute project/section metadata and `SensitiveLoggingField` is effectively unused.

3. **Structured error utilities exist alongside the backend log-event channel, but many subsystems still log ad hoc.** `backend/setta/logging/errors.py` powers FastAPI’s exception hook (`backend/setta/server.py`), websocket dispatch (`backend/setta/routers/websocket.py`), router handlers (`backend/setta/routers/projects.py`, `backend/setta/routers/ai.py`, `backend/setta/routers/llm.py`), and the `WMHFrontendSender.log_failure_and_broadcast_backend_log_event` helper so a single call both logs and emits a UI-facing event. The FastAPI exception hook now logs and emits a backend log event for *all* HTTP failures (validation 422, handled `HTTPException` 4xx/5xx, and unhandled exceptions), so they appear in `BackendLogEventsArea` automatically. Websocket route-loop failures now also log and emit backend log events (frontend/CLI/python-script websocket routes), and terminal websocket failures emit backend log events as well. To avoid duplicate UI events when a router already emitted one, `WMHFrontendSender.log_failure_and_broadcast_backend_log_event` marks the logging context with `backend_log_event_emitted=true` and the FastAPI exception hook exits early if it sees this flag. Outside of those paths, most background workers still rely on bare `except Exception` + `logger.exception` (e.g., the queue processor in `backend/setta/project_state/base_project_manager.py`, JSON/artifact/file watchers, MCP startup, and `backend/setta/api/listener.py`). Those logs lack `failure_label`s, and no contextual request/project metadata is attached.

4. **Notifications and backend log events target different UX surfaces.** `SettaNotificationType` once again exposes `save`, `error`, `warning`, and `info`, but the backend now limits notifications to deliberate UX cues (manual saves in `backend/setta/routers/projects.py`, autosave success in `backend/setta/project_state/base_project_manager.py`). All ad-hoc info/warning/error chatter flows through `WMHFrontendSender.broadcast_backend_log_event` or its `log_failure_and_broadcast_backend_log_event` variant; routers, project-manager operations, artifact/json-source watchers, LLM config/dotenv reloaders, MCP startup, and terminal actions already call into this helper. `SettaBackendLogEvent` itself is a thin `{projectConfigId?, severity, message}` payload. On the frontend the websocket handler stores every event via `addBackendLogEvent` / `useBackendLogEvents` (`frontend/src/state/actions/backendLogEvents.ts`, `frontend/src/state/definitions.ts`), and the `BackendLogEventsArea` surface (wired into the Overview "Backend Logs" tab) renders timestamp/severity/project + a clear action so users can see backend logs without opening a terminal. Filtering/retention caps are not implemented yet.

5. **Listener logging improved locally but still has no UI surfacing.** `SettaListener` configures logging through `configure_listener_logging`, tags hot-reload/watch tasks through `wrap_background_coroutine`, and `_handle_listener_error` escalates to stderr when no handlers exist. The backend’s `python_script_receiver` sends `WebsocketMsgListenerError` responses back to the script, yet it never calls `WMHFrontendSender.broadcast_backend_log_event`, and there is no opt-in path for a listener to forward local callback crashes to the backend. Anyone running listeners therefore has to tail console output to learn about failures even while the rest of the UI stays unaware.

Improvement Plan
----------------

1. **Ship a UI surface for backend log events.**
   - Done: `BackendLogEventsArea` consumes `useBackendLogEvents`, renders severity/project/timestamp, and exposes a clear action so engineers can see backend errors without opening a terminal.
   - TODO: Enforce a retention cap (per project and globally) and add filtering (including per-project filtering now that `projectConfigId` is in the payload).
   - TODO: Audit remaining notification call sites, ensuring notifications stay limited to explicit UX cues (e.g., saves, destructive confirmations).

2. **Propagate payload metadata via the context-model helpers.**
   - Make DTOs that carry `projectConfigId`, `sectionId`, etc. inherit from `ProjectContextModel`, or call `attach_request_context_models` / `attach_websocket_context_models` inside router dependencies so POST bodies can enrich the logging context.
   - Use `bind_background_task_logging_context` for home-grown background loops instead of manually copying dictionaries, and mark secrets/tokens with `SensitiveLoggingField` so they never reach log files.
   - With models attached, `log_route_failure` and `broadcast_backend_log_event` gain enough structured metadata to make alerts actionable.

3. **Adopt `log_route_failure` / `run_safely` across the remaining subsystems.**
   - Done: The global FastAPI exception handler logs and emits backend log events for all HTTP failures (4xx + 5xx, including validation errors).
   - Done: Websocket route loops (frontend/CLI/python-script) log and emit backend log events for uncaught exceptions; terminal websocket does the same.
   - Replace the bare `except Exception` blocks in the project-manager queue, JSON/artifact/file watchers, MCP server startup, and listener connection/callback handling with the structured helpers so every failure shows a `failure_label` plus request/project/websocket context.
   - When a failure should also reach the UI, rely on `WMHFrontendSender.log_failure_and_broadcast_backend_log_event` instead of duplicating logging + websocket broadcasting.
   - Extend `tests/setta/test_logging_errors.py` to cover the new call sites (including handled vs. re-raised flows) so future regressions are caught automatically.

4. **Surface listener failures through the backend.**
   - When `python_script_receiver` generates a `WebsocketMsgListenerError`, also log it with `log_route_failure` and emit a matching backend log event so frontend users understand why a listener stalled.
   - Add an opt-in path (CLI flag or environment variable) for `SettaListener` to forward its local callback exceptions back to the backend websockets, throttled to avoid loops, so the UI can flag listener issues instead of relying on stderr.
