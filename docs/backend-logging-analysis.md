Overall

- The design matches docs/backend-logging-plan.md (central bootstrap + contextvars + “backend log events”), but there are a few correctness bugs and some duplicated/under-specified behavior that make logging/
error handling less reliable than the plan implies.

What’s Well Thought Out

- Central logging bootstrap with consistent formatter + %(setta_context)s filter is solid: backend/setta/logging/config.py:28, backend/setta/logging/context.py:93.
- Request/websocket/task context propagation is coherent and explicit: backend/setta/middleware/logging_context.py:16, backend/setta/logging/context_bindings.py:18, backend/setta/logging/tasks.py:15.
- Global FastAPI exception handlers reliably surface errors to the UI (and try to avoid double-emits via backend_log_event_emitted): backend/setta/server.py:157, backend/setta/server.py:202.

Bugs / Gaps

- Several routes currently call log_failure_and_broadcast_backend_log_event(...) with an extra positional argument, which will raise TypeError during exception handling (so you lose the original error + no UI
event): backend/setta/routers/projects.py:84, backend/setta/routers/ai.py:59, backend/setta/routers/llm.py:72.
- log_route_failure uses exc_info=exc, which only captures a traceback if the exception is still “current” in sys.exc_info(); when called from FastAPI handlers (not in a local except), it can log without stack
traces: backend/setta/logging/errors.py:37.
- You bind request context twice (middleware + dependency), which is redundant and makes it harder to reason about what’s required: backend/setta/server.py:107, backend/setta/server.py:115.
- Some endpoints manually broadcast a backend log event and then raise HTTPException, so the global exception handler will also emit another backend log event (no backend_log_event_emitted flag gets set in that
path): backend/setta/routers/ai.py:111, backend/setta/server.py:174.
- Listener-side “visibility gap” from the doc is real: python-script receiver sends WebsocketMsgListenerError back to the listener but never emits a frontend backend-log-event, so the UI can miss listener
failures: backend/setta/websockets/msg_handlers/python_script_receiver.py:217.
- Listener logs generally lack Setta logging context (so setta_context prints -), even though listener logging is configured: backend/setta/api/listener.py:296.

Cleanup Candidates (Unused / Inconsistent)

- Unused logging-context helpers appear to be dead code today (replace_logging_context, clear_logging_context): backend/setta/logging/context.py:57, backend/setta/logging/context.py:66.
- _initialization_task is stored but never referenced; combined with spawn_background_task(..., re_raise=False) this makes startup failures easy to miss programmatically (they get logged+swallowed): backend/
setta/server_state.py:109, backend/setta/logging/tasks.py:15.
- print(...) bypasses your structured logging + context (harder to filter/redirect): backend/setta/server.py:76, backend/setta/start.py:73.