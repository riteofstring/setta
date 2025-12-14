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
   * **Completed:** built `setta.logging_config` / `configure_listener_logging`, wired the CLI, backend launcher, MCP client, and `SettaListener` runtime (plus manual listener scripts) to these helpers, and removed every `logging.basicConfig` path so uvicorn no longer reconfigures logging.
   * **Next:** with the bootstrap unified, focus on context propagation + structured error handling so the new log stream is actually useful (steps 2–4 below).
2. **Context-aware log records**
   * **In progress:** created `backend/setta/logging_context.py` to manage contextvars, added `LoggingContextFilter` plus formatter changes so every handler renders a `setta_context` column, and added `tests/setta/test_logging_context.py` to lock down the behavior.
   * **In progress:** added `backend/setta/logging_context_sources.py` (with tests) to build canonical context blobs for HTTP requests, websocket connections, background tasks, and introduced `ProjectContextModel` so every request payload can expose `get_project_config_id_for_context()` for zero-overhead context binding.
   * **Completed:** wired `LoggingContextMiddleware` + `bind_request_logging_context` (FastAPI dependency) so every HTTP request now pushes `request_id`, endpoint, path params, etc. into the context, and added `tests/setta/test_logging_context_middleware.py` to exercise the flow end-to-end.
   * **Next:** extend the same context binding to websocket handlers/background tasks via decorators/helpers, then start deleting legacy `logger = logging.getLogger(__name__)` definitions in favor of the centralized helpers. See `docs/websocket-background-context-entrypoints.md` for the enumerated websocket/background-task entry points this refactor must cover.
3. **Structured error handling utilities**
   * Provide helper functions for routes/background tasks, such as `log_route_failure(exc, *, context)` and `run_safely(coro, label, notify_frontend=False)`, that emit `logger.error` with context, differentiate between handled/unhandled paths, and optionally propagate user-visible notifications.
   * Replace `print`/bare `except` blocks in routers (`projects.py`, `ai.py`, `terminals.py`), websocket loops, and terminal I/O with these helpers. Escalate unexpected failures to `warning`/`error` instead of `debug`.
   * Add a small FastAPI exception handler/middleware for general `Exception` to log and convert errors into consistent JSON responses (matching the validation handler pattern).
4. **Consistent backend → frontend error pipeline**
   * Extend `SettaNotification` or introduce a `BackendErrorEvent` websocket payload to carry `severity`, `category`, `userMessage`, and an optional `debugId`. Build a helper (`report_user_visible_error(message, *, exc, project_id, metadata)`) that logs the exception and emits the structured event. Apply this to:
     - Project load/save endpoints.
     - Terminal/run-code flows.
     - LLM chat operations and API key persistence.
     - Websocket listener registration/emit failures.
   * Ensure the CLI mirrors critical notifications to stdout for users running outside the UI.
   * Support listener-specific surfacing modes: wrap uncaught callback / hot-reload failures in a helper that both logs locally and optionally forwards a `listener_error` event back to the backend, so teams can choose between log-only listeners and listeners whose failures raise UI notifications (e.g., opt-in via `SettaListener(error_mode=\"forward\")` or CLI flag).
5. **Documentation and enforcement**
   * Document the logging conventions (levels per scenario, how to attach context, when to notify the frontend) in the repo’s developer docs.
   * Add lint/tests to reject new `print` usage inside `backend/setta` and to enforce that critical loops use the structured helpers.
   * Optionally provide a sample log sink (e.g., rotate into `setta_files/logs/`) for users who want persistent files.

These steps give packaged CLI users immediately actionable logs, help developers trace backend behavior, and keep the frontend informed whenever the backend hits unexpected conditions.
