"""FastAPI middleware that attaches logging context metadata to each request."""

from collections.abc import AsyncIterator

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from setta.logging.context import logging_context
from setta.logging.context_sources import build_request_context


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

        context_values = build_request_context(request)
        with logging_context(values=context_values):
            return await call_next(request)


async def bind_request_logging_context(
    request: Request,
) -> AsyncIterator[None]:
    """FastAPI dependency that binds request metadata to the logging context."""

    with logging_context(values=build_request_context(request)):
        yield
