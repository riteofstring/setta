Backend Logging & Error Handling Plan
=====================================

Context
-------

* Setta is typically started via the packaged CLI (`setta`) after `pip install setta`; developers occasionally embed the backend through `backend_launcher.start_backend`.
* The packaged backend must therefore expose helpful logs and user-visible errors without extra configuration, while remaining easy to extend for programmatic consumers.
* Python listener scripts (`SettaListener`) run as separate processes that stream realtime updates from a running backend. They need clear local logs plus a way to surface broken callbacks or connection issues back to the UI when desired.

Current Observations
--------------------

1. Logging configuration lives only in `backend/setta/start.py` and `backend/setta/backend_launcher.py`. Both wire `logging.basicConfig` with a formatter but default the root level to `critical`. As a result, most module-level `logger.debug/info` calls never surface for default CLI users.
2. Modules consistently create `logger = logging.getLogger(__name__)`, yet routing layers and long-running services frequently bypass logging entirely. Examples include:
   * `print` statements for project loading and AI routes (`backend/setta/routers/projects.py`, `backend/setta/routers/ai.py`) and websocket manager address updates.
   * Bare `except` blocks in websocket loops, terminal readers, and project-manager helpers that swallow exceptions after logging only simple `debug` messages, leaving no indication of whether the error was handled.
3. Error handling lacks structure:
   * The FastAPI app defines only the validation handler; other uncaught exceptions fall back to uvicorn defaults.
   * Many routers wrap actions in `try/except Exception` (e.g., manual save, autosave) without logging and simply send a generic success/failure notification.
4. Frontend-facing error surfacing is ad hoc. `SettaNotification` is used to inform users about a handful of flows (autosave, terminal operations, LLM key updates), but most backend failures never produce a websocket event, so UI users cannot tell when the backend hit a problem.
5. Listener API logging is ad hoc and disconnected from both CLI and UI flows.
   * `backend/setta/api/listener.py` assumes the embedding script will configure logging; when it does not, `_handle_listener_error` falls back to `sys.stderr` writes so listeners receive minimal structure or context by default.
   * Hot-reload watchers, reconnection loops, and callback exceptions only log to the local process; UI-only users have no insight into listener crashes or retries even though the backend depends on those callbacks.
   * Listener authors have no supported toggle to forward their own errors back through the backend (beyond manual `emit_to_frontend` hacks), so shared projects cannot guarantee that listener regressions surface alongside backend notifications.

Improvement Plan
----------------

1. **Centralized logging bootstrap**
   * **Completed:** built `setta.logging.config` / `configure_listener_logging`, wired the CLI, backend launcher, MCP client, and `SettaListener` runtime (plus manual listener scripts) to these helpers, and removed every `logging.basicConfig` path so uvicorn no longer reconfigures logging.
   * **Next:** with the bootstrap unified, focus on context propagation + structured error handling so the new log stream is actually useful (steps 2–4 below).
2. **Context-aware log records**
   * **In progress:** created `backend/setta/logging/context.py` to manage contextvars, added `LoggingContextFilter` plus formatter changes so every handler renders a `setta_context` column, and added `tests/setta/test_logging_context.py` to lock down the behavior.
   * **In progress:** added `backend/setta/logging/context_sources.py` (with tests) to build canonical context blobs for HTTP requests, websocket connections, background tasks, and introduced `ProjectContextModel` so every request payload can expose `get_project_config_id_for_context()` for zero-overhead context binding.
   * **Completed:** wired `LoggingContextMiddleware` + `bind_request_logging_context` (FastAPI dependency) so every HTTP request now pushes `request_id`, endpoint, path params, etc. into the context, and added `tests/setta/test_logging_context_middleware.py` to exercise the flow end-to-end.
   * **Completed:** built `backend/setta/logging/context_bindings.py` (`bind_websocket_logging_context`, `wrap_background_callable`, `wrap_background_coroutine`) and wired them through the websocket router loop plus the terminal websocket/write loop and notification background tasks. These wrappers now inject `connection_type`, `section_id`, `client_id`, and originating `request_id`/`project_id` where available, letting us delete the per-module loggers in those routes.
   * **Completed:** pushed the same helpers into the shared background primitives:
     - `AsyncDebouncer` now requires a `label` and automatically forwards the current `project_id`/`request_id`/`websocket_id`.
     - `BaseProjectManager` binds both its queue processor and autosave debouncer so every project operation produces traceable `task=<manager>-queue` / `<manager>-autosave` logs.
     - Terminal reader + run-code flows (`terminals/terminals.py`, `terminals/run_code.py`) now wrap their `asyncio.create_task` calls to capture `projectConfigId`, `sectionId`, and terminal IDs without bespoke loggers.
 * **In progress:** the helpers now wrap every bootstrapping task and long-running subsystem called out in `docs/websocket-background-context-entrypoints.md`, including backend initialization, JSON source watchers, LLM chat streams, LSP readers/writers, MCP server readiness, listener hot-reload watchers, and CLI reconnect loops.
   - `backend/setta/server_state.py` binds `_initialize_async` plus the `MCPClient.connect_to_server()` and `start_lsps(...)` tasks with `request_id="boot"` so boot logs always carry a stable identifier.
   - `backend/setta/server.py` wraps `_open_browser_after_startup` in `wrap_background_coroutine` (`label="open-browser"`) to eliminate the bespoke module logger.
   - `backend/setta/project_state/jsonSource/jsonSource.py` annotates every reload task with `callbackCategory` + section/variant pairs.
   - `backend/setta/utils/async_debouncer.py` rebases both `trigger()` and `_schedule()` on the wrapper, ensuring deferred autosave jobs keep the originating request/project/websocket metadata.
   - `backend/setta/llm/llm_chat_manager.py` wraps streaming tasks so logs include `chat_id` + `project_id`.
   - `backend/setta/lsp/managers.py`, `lsp/writer.py`, and `lsp/reader.py` wrap the initialization toast, send-and-wait requests, reader loop, and diagnostics callbacks; new tests assert their context output (see below).
   - `backend/setta/mcp/server.py`, `backend/setta/api/listener.py`, and `backend/setta/websockets/connect.py` now emit `task=` metadata for server readiness, listener hot-reload watchers, and CLI subprocess runners.
 * **Completed:** added `tests/setta/test_logging_context_propagation.py` exercising AsyncDebouncer, LSP send/receive hooks, and the CLI websocket consumer to ensure the logging context survives through these background entry points.
3. **Structured error handling utilities**
   * **Completed:** added `backend/setta/logging/errors.py` with `log_route_failure` / `run_safely` plus `tests/setta/test_logging_errors.py` so we can log handled vs unhandled failures with metadata and ensure bad inputs raise loudly.
   * **Completed:** taught `log_route_failure` to accept request models directly, introduced `setta.logging.context_models` for consistent serialization + sensitive-field masking, and added request/websocket/background context helpers so general logging benefits from the same sanitized metadata (see `tests/setta/test_logging_context_sources.py`).
   * **Completed:** scrubbed the remaining `print` + bare `except` blocks inside the core routers (`projects.py`, `ai.py`, `llm.py`, `terminals.py`), websocket loops, and PTY readers/writers so every failure now flows through `log_route_failure` / `run_safely` with contextual metadata instead of silent debug logs.
   * **Completed:** added a FastAPI-wide `Exception` handler that logs via `log_route_failure`, preserves `HTTPException` semantics, and emits a single JSON error envelope for all other uncaught failures (alongside the existing validation handler).
4. **Consistent backend → frontend error pipeline**
   * **In progress:** introduced `SettaBackendLogEvent` (`backend/setta/types/notifications.py`) with `severity`, `category`, `userMessage`, `debugId`, and metadata so structured logs can flow independently of user-visible notifications. `SettaNotification` now only supports the `save` type and requires it to be specified explicitly. Most call sites—`backend/setta/project_state/base_project_manager.py`, autosave/artifact helpers, AI/LLM routers, JSON source watchers, etc.—still request `SettaNotificationType.error/warning/info`; these now raise validation errors and need to migrate to the new log-event surface (or be deleted entirely).
   * The frontend still consumes the generated `SettaNotificationTypeEnum` with the legacy values and defaults. Until we add a websocket/feed for `SettaBackendLogEvent`, notifications renderers (`frontend/src/components/Panes/Overview/NotificationsArea.tsx`, Zustand notification actions, etc.) will fail to parse backend responses. Update the generator + UI store once the backend schema stabilizes.
   * Build a helper (`report_user_visible_error(message, *, exc, project_id, metadata)`) that logs a `SettaBackendLogEvent`, emits it to the websocket (new `WebsocketMsgTypeForFrontend.BackendLogEvent`), and optionally promotes a curated `SettaNotification` when the user needs to see it. Apply this helper to:
     - Project load/save endpoints.
     - Terminal/run-code flows.
     - LLM chat operations and API key persistence.
     - Websocket listener registration/emit failures.
   * Ensure the CLI mirrors high-severity `SettaBackendLogEvent` payloads to stdout/stderr for users running outside the UI.
   * Support listener-specific surfacing modes: wrap uncaught callback / hot-reload failures in a helper that both logs locally and optionally forwards a `listener_error` event back to the backend, so teams can choose between log-only listeners and listeners whose failures raise UI notifications (e.g., opt-in via `SettaListener(error_mode="forward")` or CLI flag).
5. **Documentation and enforcement**
   * Document the logging conventions (levels per scenario, how to attach context, when to notify the frontend) in the repo’s developer docs.
   * Add lint/tests to reject new `print` usage inside `backend/setta` and to enforce that critical loops use the structured helpers.
   * Optionally provide a sample log sink (e.g., rotate into `setta_files/logs/`) for users who want persistent files.

These steps give packaged CLI users immediately actionable logs, help developers trace backend behavior, and keep the frontend informed whenever the backend hits unexpected conditions.
