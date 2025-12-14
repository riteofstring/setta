"""FastAPI middleware that attaches logging context metadata to each request."""

from collections.abc import AsyncIterator

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from setta.logging.context import logging_context
from setta.logging.context_sources import build_request_context, ensure_request_context


class LoggingContextMiddleware(BaseHTTPMiddleware):
    """Populate the logging context with request metadata for each HTTP request."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Attach request-scoped metadata to the logging context."""

        context_values = {
            "request_id": ensure_request_context(request),
            "method": request.method.upper(),
            "path": request.url.path,
        }
        client_host = request.client.host if request.client else None
        if client_host:
            context_values["client"] = client_host
        with logging_context(values=context_values):
            return await call_next(request)


async def bind_request_logging_context(
    request: Request,
) -> AsyncIterator[None]:
    """FastAPI dependency that binds request metadata to the logging context."""

    full_context = build_request_context(request)
    context_values = {
        key: full_context[key]
        for key in ("endpoint", "project_id")
        if key in full_context
    }
    with logging_context(values=context_values):
        yield
