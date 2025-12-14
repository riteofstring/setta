Backend Logging: Clean Separation for HTTP vs WebSocket Context
==============================================================

Problem
-------

We currently configure the FastAPI app with a global dependency:

- `backend/setta/server.py` uses `dependencies=[Depends(bind_request_logging_context)]`.

FastAPI applies app-level dependencies to **both** HTTP routes and WebSocket routes.
That means `bind_request_logging_context` runs during WebSocket handshake/dependency solving as well.

However, WebSocket endpoints already bind their own logging context explicitly:

- `backend/setta/routers/websocket.py` wraps the connection loop in `async with bind_websocket_logging_context(...)`.

This created two issues:

1. **Hard bug:** when `bind_request_logging_context` only accepted `Request`, WebSocket connections crashed with:
   `TypeError: bind_request_logging_context() missing 1 required positional argument: 'request'`.
2. **Conceptual confusion / duplication:** even after patching `bind_request_logging_context` to accept `WebSocket`,
   we end up binding context twice (once implicitly during dependency solving, then again explicitly in the route loop).

Goal
----

Make logging context propagation feel obvious:

- HTTP context is handled by HTTP-only mechanisms.
- WebSocket context is handled by WebSocket-only mechanisms.
- No “magic” dependency that silently needs to understand both.

We do **not** need backward compatibility or legacy support; it is acceptable if the application is temporarily broken
while we refactor to this cleaner architecture.

Current context sources
-----------------------

HTTP:

- `LoggingContextMiddleware` builds request metadata via `build_request_context(request)`.
- `bind_request_logging_context` binds request metadata via `build_request_context(request)`.

WebSocket:

- `bind_websocket_logging_context` binds websocket metadata via `build_websocket_context(websocket, ...)`.

The websocket router already uses `bind_websocket_logging_context` and also attaches extra metadata like
`connection_type` / `connection_id`.

Clean / separated design
------------------------

1. **Remove the global app dependency** that applies to everything.
2. **Attach `Depends(bind_request_logging_context)` only to HTTP routers**, not to the websocket router.
3. **Make `bind_request_logging_context` Request-only again.**
4. Keep WebSocket endpoints responsible for WebSocket context via `bind_websocket_logging_context` only.

This yields one clear binding path per transport:

- HTTP → `LoggingContextMiddleware` (and optionally an HTTP-only dependency).
- WebSocket → `bind_websocket_logging_context`.

Plan
----

1. **Move the dependency off the app**
   - In `backend/setta/server.py`, remove `dependencies=[Depends(bind_request_logging_context)]` from the `FastAPI(...)` call.

2. **Re-apply request binding only to HTTP routers**
   - Add `dependencies=[Depends(bind_request_logging_context)]` either:
     - per-router at `app.include_router(...)` call sites for every HTTP router, excluding `websocket_router`, or
     - inside the router definitions (e.g. `SettaAPIRouter(dependencies=[...])`) for all non-websocket routers.
   - Prefer doing this at `include_router` call sites so the separation is explicit in one place.

3. **Revert `bind_request_logging_context` to Request-only**
   - In `backend/setta/middleware/logging_context.py`, remove the `websocket` parameter and any websocket branching.
   - The only valid signature should be `async def bind_request_logging_context(request: Request) -> AsyncIterator[None]`.

4. **Confirm websocket endpoints bind context once**
   - Ensure all websocket entrypoints remain wrapped in `async with bind_websocket_logging_context(...)`.
   - If there are websocket-like endpoints elsewhere (terminal websockets, python script receiver), confirm they are covered.

5. **Update / add focused tests**
   - Add a regression test that a websocket connect does not trigger the request-only dependency.
   - Keep existing logging-context tests for HTTP middleware + dependency, and websocket bindings.

6. **Delete any transitional glue**
   - Remove any code that existed only to keep the old mixed behavior working.

Notes / tradeoffs
-----------------

- We may decide that HTTP is “middleware-only” and remove the request dependency entirely; that’s a separate simplification.
- If we keep both middleware and dependency for HTTP, ensure they don’t fight each other (they should be consistent and
  produce the same `request_id` / path context).
