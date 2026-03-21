"""FastAPI/Starlette middleware that attaches logging context metadata to each request."""

from collections.abc import AsyncIterator

from fastapi import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from setta.logging.context import logging_context, push_logging_context
from setta.logging.context_sources import (
    build_request_context,
    ensure_request_context,
)


class LoggingContextMiddleware:
    """Populate the logging context with request metadata for each HTTP request.

    Implemented as a pure ASGI middleware (instead of BaseHTTPMiddleware) so the
    context stays active for the full response send, including streaming.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        context_values = {
            "request_id": ensure_request_context(request),
            "method": request.method.upper(),
            "path": request.url.path,
        }
        client_host = request.client.host if request.client else None
        if client_host:
            context_values["client"] = client_host

        enriched = False

        async def send_wrapper(message: Message) -> None:
            nonlocal enriched
            if not enriched and message["type"] == "http.response.start":
                full_context = build_request_context(request)
                extra_context = {
                    key: full_context[key]
                    for key in ("endpoint",)
                    if key in full_context
                }
                if extra_context:
                    push_logging_context(values=extra_context)
                enriched = True
            await send(message)

        with logging_context(values=context_values):
            await self.app(scope, receive, send_wrapper)


async def bind_request_logging_context(
    request: Request,
) -> AsyncIterator[None]:
    """FastAPI dependency that binds request metadata to the logging context."""

    full_context = build_request_context(request)
    context_values = {
        key: full_context[key] for key in ("endpoint",) if key in full_context
    }
    with logging_context(values=context_values):
        yield
