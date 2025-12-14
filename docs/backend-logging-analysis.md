High-Level Take

- The backend logging architecture is now aligned with docs/backend-logging-plan.md: central dictConfig, contextvars-based `setta_context`, and a consistent “log + broadcast to UI” path.
- The original gaps in this document (hot-path f-string logging, oversized context values, request context lifetime, and swallowed exceptions) have been addressed. Remaining work is mostly ongoing discipline around context sizing and log noise.

What’s Well-Designed (matches the doc)

- Central bootstrap via backend/setta/logging/config.py and used by entry points (backend/setta/start.py, backend/setta/backend_launcher.py, backend/setta/mcp/client.py) with uvicorn using log_config=None.
- Request/websocket/task context binding is consistent:
    - Context filter: backend/setta/logging/context.py
    - HTTP: backend/setta/middleware/logging_context.py (ASGI middleware) + dependency backend/setta/middleware/logging_context.py
    - WebSockets: backend/setta/logging/context_bindings.py
    - Background tasks: backend/setta/logging/tasks.py
- Central failure logging with consistent metadata: backend/setta/logging/errors.py, and UI surfacing via backend/setta/websockets/msg_handlers/frontend_sender.py.

Error Handling: Issues / Inconsistencies

- Handled vs unhandled is now explicitly a policy input:
    - For HTTP, `HTTPException(status < 500)` is treated as handled (`handled=True`), but still broadcasts to the UI.
    - FastAPI `RequestValidationError` (422) is treated as unhandled (`handled=False`) because it usually indicates a frontend/backend contract mismatch.
    - `handled` primarily controls severity/metadata; tracebacks are on by default (but can be disabled via `include_traceback=False` in `log_route_failure`).
- Internal exception details in HTTP errors are allowed and will surface in UI backend log events (by design for open source/reportability).
- The silent-swallowing blocks called out below have been removed (they now raise, so failures aren’t hidden).

Performance / Verbosity Risks

- Hot-path f-string logging has been converted to lazy formatting (`logger.debug("...", ...)`) in the main offenders (LSP, terminals, backups, websocket CLI runner).
- Oversized context values are now handled in two layers:
    - Prefer passing small ids/counts/samples at the source (e.g. jsonSource uses count + sample rather than the full list).
    - Logging context normalization sanitizes values (Pydantic redaction + truncation + collection summarization), so a large/sensitive object doesn’t explode `setta_context`.
- Access log context lifetime is improved: the HTTP middleware is now a pure ASGI middleware so context remains bound through the full response send (important for streaming and uvicorn access logs).

Concrete Cleanup Targets I Found

- Unused import: removed typing.Any in backend/setta/logging/tasks.py.
- Unused argument: `_cleanup(_task, chat_id)` in backend/setta/llm/llm_chat_manager.py.
- Root logger usage: replaced with module loggers in backend/setta/routers/websocket.py and backend/setta/routers/terminals.py.
- Listener stderr fallback: removed; listener now always logs via configured logging.

Recommendations (highest impact first)

- Policy: keep handled 4xx tracebacks enabled for debuggability (current default behavior).
- Keep pushing large payloads out of context (even though sanitization exists): use ids/counts/samples.
- Guardrail: Ruff `G` (logging format) and `ARG` (unused args) are enabled so these don’t regress.
