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

2. **HTTP/websocket/background context propagation is wired up and intentionally explicit.** `LoggingContextMiddleware` plus per-router `Depends(bind_request_logging_context)` in `backend/setta/server.py` attaches request ids, paths, and inferred project ids to every HTTP handler. Websocket routes (`backend/setta/routers/websocket.py`) and terminal endpoints (`backend/setta/routers/terminals.py`) wrap connections with `bind_websocket_logging_context`. Long-running work is scheduled through `spawn_background_task(...)` so execution runs in a canonical background-task context (`task`, `project_id`, `request_id`, `websocket_id`, plus any explicit `extra_values`) and failures are logged with consistent metadata. Tests under `tests/setta/test_logging_context_{middleware,bindings,sources,propagation}.py` cover these flows.

3. **Structured error utilities are canonical.** `backend/setta/logging/errors.py` provides `log_route_failure(...)` + `run_safely(...)` and is the only supported pattern for logging exceptions in production code. `WMHFrontendSender.log_failure_and_broadcast_backend_log_event(...)` is the one-call “log + UI surface” API. The FastAPI exception hook (`backend/setta/server.py`) logs and emits a backend log event for *all* HTTP failures (validation 422, handled `HTTPException` 4xx/5xx, and unhandled exceptions). To avoid duplicate UI events when a router already emitted one, `WMHFrontendSender.log_failure_and_broadcast_backend_log_event(...)` marks the logging context with `backend_log_event_emitted=true` and the FastAPI exception hook exits early if it sees this flag. Background tasks should use `spawn_background_task(...)` so failures are logged inside the bound task context (metadata preserved even when exceptions are swallowed).

4. **Notifications and backend log events target different UX surfaces.** `SettaNotificationType` once again exposes `save`, `error`, `warning`, and `info`, but the backend now limits notifications to deliberate UX cues (manual saves in `backend/setta/routers/projects.py`, autosave success in `backend/setta/project_state/base_project_manager.py`). All ad-hoc info/warning/error chatter flows through `WMHFrontendSender.broadcast_backend_log_event` or its `log_failure_and_broadcast_backend_log_event` variant; routers, project-manager operations, artifact/json-source watchers, LLM config/dotenv reloaders, MCP startup, and terminal actions already call into this helper. `SettaBackendLogEvent` itself is a thin `{projectConfigId?, severity, message}` payload. On the frontend the websocket handler stores every event via `addBackendLogEvent` / `useBackendLogEvents` (`frontend/src/state/actions/backendLogEvents.ts`, `frontend/src/state/definitions.ts`), and the `BackendLogEventsArea` surface (wired into the Overview "Backend Logs" tab) renders timestamp/severity/project + a clear action so users can see backend logs without opening a terminal. Filtering/retention caps are not implemented yet.

5. **Listener logging improved locally but still has no UI surfacing.** `SettaListener` configures logging through `configure_listener_logging` and runs its long-lived tasks with bound logging context. The backend’s `python_script_receiver` sends `WebsocketMsgListenerError` responses back to the script, yet it never calls `WMHFrontendSender.broadcast_backend_log_event`, and there is no opt-in path for a listener to forward local callback crashes to the backend. Anyone running listeners therefore has to tail console output to learn about failures even while the rest of the UI stays unaware.

Improvement Plan
----------------

1. **Ship a UI surface for backend log events.**
   - Done: `BackendLogEventsArea` consumes `useBackendLogEvents`, renders severity/project/timestamp, and exposes a clear action so engineers can see backend errors without opening a terminal.
   - TODO: Enforce a retention cap (per project and globally) and add filtering (including per-project filtering now that `projectConfigId` is in the payload).
   - TODO: Audit remaining notification call sites, ensuring notifications stay limited to explicit UX cues (e.g., saves, destructive confirmations).

2. **Keep logging context explicit and small.**
   - Do not serialize Pydantic payloads into logging context. If a value matters for debugging (project id, section id, operation id, file path, etc.), pass it explicitly via `extra_values={...}` when binding context or spawning a task.
   - Standardize keys (`project_id`, `request_id`, `websocket_id`, `connection_id`, `task`, plus subsystem-specific keys like `lsp_server`, `uri`, `command`) so log filtering stays predictable.

3. **Adopt `spawn_background_task` / `run_safely` across the remaining subsystems.**
   - Done: The global FastAPI exception handler logs and emits backend log events for all HTTP failures (4xx + 5xx, including validation errors).
   - Done: Websocket route loops (frontend/CLI/python-script) log and emit backend log events for uncaught exceptions; terminal websocket does the same.
   - Done: Removed `wrap_background_coroutine(...)`; `spawn_background_task(...)` is now the only supported “spawn + bind context + log failures” helper.
   - Replace remaining ad-hoc `try/except Exception: logger.exception(...)` and raw `asyncio.create_task(...)` call sites with `spawn_background_task(...)` so failures are logged with a consistent `failure_label` and the correct context metadata.
   - When a failure should also reach the UI, rely on `WMHFrontendSender.log_failure_and_broadcast_backend_log_event(...)` instead of duplicating logging + websocket broadcasting.

4. **Surface listener failures through the backend.**
   - When `python_script_receiver` generates a `WebsocketMsgListenerError`, also log it with `log_route_failure` and emit a matching backend log event so frontend users understand why a listener stalled.
   - Add an opt-in path (CLI flag or environment variable) for `SettaListener` to forward its local callback exceptions back to the backend websockets, throttled to avoid loops, so the UI can flag listener issues instead of relying on stderr.
