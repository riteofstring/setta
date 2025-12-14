Backend Logging & Error Handling Plan
=====================================

Context
-------

* Setta is typically started via the packaged CLI (`setta`) after `pip install setta`; developers occasionally embed the backend through `backend_launcher.start_backend`.
* The packaged backend must therefore expose helpful logs and user-visible errors without extra configuration, while remaining easy to extend for programmatic consumers.
* Python listener scripts (`SettaListener`) run as separate processes that stream realtime updates from a running backend. They need clear local logs plus a way to surface broken callbacks or connection issues back to the UI when desired.

Current State
-------------

1. **Logging bootstrap is centralized.** `backend/setta/logging/config.py` now owns the full `logging.config.dictConfig` setup, adds the `setta_context` column, and exposes both `configure_logging` and `configure_listener_logging`. Every entry point (`backend/setta/start.py`, `backend/setta/backend_launcher.py`, `backend/setta/mcp/client.py`, `backend/setta/api/listener.py`, plus the manual listener smoke scripts) calls these helpers, so uvicorn no longer reinitializes the root logger and CLI users see INFO-level output by default.
2. **Context propagation covers HTTP, websockets, and background work.** `LoggingContextMiddleware` plus the `bind_request_logging_context` dependency inject per-request metadata, and the websocket routes/terminal endpoints use `bind_websocket_logging_context` to add websocket ids, connection types, and project ids. Shared helpers (`wrap_background_coroutine`, `wrap_background_callable`, `bind_background_task_logging_context`) are threaded through the queue processor in `backend/setta/project_state/base_project_manager.py`, `AsyncDebouncer`, JSON-source reloaders, terminal readers and writers, CLI reconnect tasks, MCP/LSP startup, and listener hot-reload watchers. Tests under `tests/setta/test_logging_context_*.py` verify these flows. The newer `ProjectContextModel`, `attach_request_context_models`, and `attach_websocket_context_models` utilities exist but are not yet used by any request model, so POST bodies still cannot contribute project metadata to the logging context.
3. **Structured error utilities exist but are only partially adopted.** `backend/setta/logging/errors.py` powers the FastAPI-wide exception handler (`backend/setta/server.py`), the websocket loop, LLM/chat routes, and terminal websocket flows (via `log_route_failure` / `run_safely`). Many subsystems—including project-manager enqueue operations, JSON/artifact watchers, and `SettaListener` callback execution—still rely on bare `except Exception` blocks with minimal context. Sensitive-field masking (`setta.logging.context_models`) is only exercised in tests because no real payload attaches models to the context.
4. **The notification + frontend error pipeline is broken.** `backend/setta/types/notifications.py` now restricts `SettaNotificationType` to the single value `save` and makes the field mandatory, yet every call site still assumes the legacy enum or omits the field entirely. Example failures:
   * Routes such as `backend/setta/routers/llm.py` and `backend/setta/project_state/base_project_manager.py` reference `SettaNotificationType.error/warning/info`, which raises `AttributeError` before a notification can be created.
   * Other code paths (`backend/setta/routers/project_manager.py`, `backend/setta/lsp/managers.py`, JSON-source/artifact watchers) instantiate `SettaNotification(...)` without a `type`, so Pydantic now raises a validation error.
   * The frontend still expects the historical enum (`frontend/src/utils/generatedTypes.ts` defines `success/error/warning/info/save`), and `WebsocketMsgTypeForFrontend` lacks any `BackendLogEvent` message. As a result the backend currently cannot send *any* notification or structured log event to the UI even though `SettaBackendLogEvent` is defined.
5. **Listener logging improved locally but still lacks UI surfacing.** `SettaListener` now configures logging via `configure_listener_logging`, tags long-running watcher tasks with `wrap_background_coroutine`, and `_handle_listener_error` escalates to stderr when no handlers exist. There is still no helper or option that forwards listener failures back through the backend’s websockets, and CLI users running listeners still rely solely on local stderr/stdout to learn about callback crashes.

Improvement Plan
----------------

1. **Unblock notifications and log-event delivery (while keeping notifications).**
   * ✅ Transport exists: `WebsocketMsgTypeForFrontend.BackendLogEvent` now mirrors all structured log events through `WMHFrontendSender.broadcast_backend_log_event`, and `SettaBackendLogEvent` has been simplified to `{projectConfigId, severity, message}` so callers can emit readable strings without extra metadata plumbing.
   * ✅ Server code now limits `SettaNotification` to the `save` UX cue and routes prior notification usages (autosave/manual save errors, artifact watchers, JSON-source reloads, LLM config/dotenv failures, terminal actions, etc.) through the new log-event broadcaster.
   * ✅ `WMHFrontendSender.log_failure_and_broadcast_backend_log_event` wraps `log_route_failure` + `broadcast_backend_log_event`, replacing the `notify_frontend` hint on `log_route_failure` so callers only opt into a single helper when they need both backend logging and UI surfacing.
   * ✅ Notifications remain a first-class surface for deliberate UX cues (e.g., manual saves, destructive confirmations). Keep the notification store/components alive; only migrate the ad-hoc error/info spam to backend log events.
   * ✅ The frontend now handles `BackendLogEvent` messages, storing them via `useBackendLogEvents` so downstream UI can render the live stream.
   * ⏭ Still outstanding: build UI surfacing for these log events so users actually see them. Once the frontend renders the new stream, rip out the stale notification enum/state **except** for the save-related flows noted above.
2. **Leverage the context-model helpers.**
   * Make request DTOs that carry `projectConfigId` inherit from `ProjectContextModel` or call `attach_request_context_models` / `attach_websocket_context_models` inside router dependencies. This lets `log_route_failure` and background tasks render project/section metadata without bespoke plumbing.
   * Audit payload serializers to mark sensitive fields with `SensitiveLoggingField` now that the serializer exists.
3. **Expand structured logging coverage.**
   * Replace the remaining bare `except Exception` blocks in queue processors, JSON/artifact loaders, file watchers, listener callback execution, and MCP/LSP adapters with `log_route_failure` / `run_safely` so failures always show up with a `failure_label`.
   * Remove the leftover `print` statements in runtime code (`backend/setta/server.py`, `backend/setta/mcp/server.py`, etc.) or gate them behind logging calls.
   * Ensure background coroutines created outside the current helpers (e.g., `project_state/listener_artifact_updates.py`) bind a logging context so downstream logs stay traceable.
4. **Documentation & guardrails.**
   * Update developer docs to describe the new helpers (where to source context, when to report notifications vs. log events, listener surfacing expectations).
   * Add lint/tests that fail on new `print` usage inside `backend/setta` and that ensure `SettaNotification` constructions specify valid enum values (until the type mismatch is resolved).
   * Once the frontend/backend schemas align, record the manual verification steps (CLI smoke, listener hot-reload, etc.) expected in PR descriptions so regressions are easier to catch.
