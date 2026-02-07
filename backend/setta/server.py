import asyncio
import logging
import time
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from setta.logging.context import get_logging_context
from setta.logging.context_sources import ensure_request_context
from setta.logging.errors import log_failure
from setta.logging.tasks import spawn_background_task
from setta.lsp.managers import (
    stop_file_watcher,
    stop_lsps,
)
from setta.middleware import (
    AuthMiddleware,
    LoggingContextMiddleware,
    bind_request_logging_context,
)
from setta.routers import (
    agentic_router,
    ai_router,
    app_deployments_router,
    artifact_router,
    attachments_router,
    binary_router,
    bootstrap_router,
    code_info_router,
    listener_router,
    llm_router,
    lsp_router,
    mcp_tools_router,
    project_manager_router,
    projects_router,
    runs_router,
    sections_router,
    settings_router,
    share_deployments_router,
    status_router,
    terminals_http_router,
    terminals_ws_router,
    websocket_router,
)
from setta.server_state import SettaFastAPIState
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route
from setta.utils.constants import IS_DEV_MODE, C
from setta.utils.utils import get_absolute_path

if not (C.SHARE_MODE or C.APP_MODE):
    import setta.mcp.tools  # noqa: F401

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if C.SHARE_MODE or C.APP_MODE:
        deployment_root = (
            C.SHARE_DEPLOYMENT_ROOT if C.SHARE_MODE else C.APP_DEPLOYMENT_ROOT
        )
        app.state.setta = SettaFastAPIState(
            app,
            share_mode=C.SHARE_MODE,
            app_mode=C.APP_MODE,
            share_deployment_root=deployment_root,
        )
    else:
        app.state.setta = SettaFastAPIState(app)

    if not IS_DEV_MODE:
        # Mount the 'frontend/dist' directory at '/static'
        frontend_folder = Path("static/frontend")
        dist_path = get_absolute_path(__file__, frontend_folder)
        app.mount(
            "/static",
            StaticFiles(directory=dist_path, html=True),
            name="static",
        )

        # {_full_path:path} is to catch all paths not explicitly covered here.
        # Keep the leading underscore so Ruff's unused-argument rule doesn't fire.
        @app.get("/{_full_path:path}", response_class=HTMLResponse)
        async def read_root(_full_path: str):
            with open(dist_path / "index.html") as f:
                content = f.read()
            return content

    logger.info("Ready: %s", C.BACKEND)
    browser_task: asyncio.Task[None] | None = None
    open_url = C.OPEN_BROWSER_ON_START
    if open_url:
        C.OPEN_BROWSER_ON_START = None
        browser_task = spawn_background_task(
            _open_browser_after_startup(open_url),
            label="open-browser",
            extra_values={"open_url": open_url},
        )
    try:
        yield
    finally:
        if browser_task is not None:
            await browser_task
        if app.state.setta.specific_file_watcher:
            app.state.setta.specific_file_watcher.stop()
        if not app.state.setta.mcp_client.disabled:
            await app.state.setta.mcp_client.stop()
        if app.state.setta.lsps and app.state.setta.lsp_readers:
            await stop_lsps(app.state.setta.lsps, app.state.setta.lsp_readers)
        if app.state.setta.lsp_writers:
            stop_file_watcher(app.state.setta.lsp_writers)


app = FastAPI(
    lifespan=lifespan,
    openapi_url=f"{Route.PREFIX.value}{Route.OPENAPI_DOCS.value}",
    docs_url=f"{Route.PREFIX.value}{Route.SWAGGER_DOCS.value}",
    redoc_url=f"{Route.PREFIX.value}{Route.REDOC_DOCS.value}",
)

app.add_middleware(LoggingContextMiddleware)
if not (C.SHARE_MODE or C.APP_MODE):
    app.add_middleware(AuthMiddleware)
# Keep CORS outermost so auth failures return proper CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=C.FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

http_router_kwargs = {
    "prefix": Route.PREFIX.value,
    "dependencies": [Depends(bind_request_logging_context)],
}
websocket_router_kwargs = {"prefix": Route.PREFIX.value}

app.include_router(bootstrap_router)
app.include_router(mcp_tools_router)
app.include_router(projects_router, **http_router_kwargs)
app.include_router(sections_router, **http_router_kwargs)
app.include_router(terminals_http_router, **http_router_kwargs)
app.include_router(runs_router, **http_router_kwargs)
app.include_router(websocket_router, **websocket_router_kwargs)
app.include_router(terminals_ws_router, **websocket_router_kwargs)
app.include_router(code_info_router, **http_router_kwargs)
app.include_router(settings_router, **http_router_kwargs)
app.include_router(artifact_router, **http_router_kwargs)
app.include_router(attachments_router, **http_router_kwargs)
app.include_router(binary_router, **http_router_kwargs)
app.include_router(listener_router, **http_router_kwargs)
app.include_router(lsp_router, **http_router_kwargs)
app.include_router(llm_router, **http_router_kwargs)
app.include_router(ai_router, **http_router_kwargs)
app.include_router(agentic_router, **http_router_kwargs)
app.include_router(project_manager_router, **http_router_kwargs)
app.include_router(status_router, **http_router_kwargs)
app.include_router(share_deployments_router, **http_router_kwargs)
app.include_router(app_deployments_router, **http_router_kwargs)


async def _open_browser_after_startup(url: str) -> None:
    await asyncio.to_thread(_wait_for_backend, url)
    webbrowser.open(url, new=0)


def _wait_for_backend(
    url: str, timeout: float = 5.0, poll_interval: float = 0.05
) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            with urlopen(url, timeout=timeout):
                return
        except URLError:
            if time.monotonic() >= deadline:
                logger.warning("Timed out waiting for %s to become reachable.", url)
                return
            time.sleep(poll_interval)


# https://github.com/tiangolo/fastapi/issues/3361#issuecomment-1002120988
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    await _log_and_broadcast_http_error(
        request,
        exc,
        label="fastapi-validation-error",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        handled=False,
    )
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    content = {"status_code": 10422, "message": exc_str, "data": None}
    return JSONResponse(
        content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        handled = (
            exc.status_code < status.HTTP_500_INTERNAL_SERVER_ERROR
            and exc.status_code != status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        await _log_and_broadcast_http_error(
            request,
            exc,
            label="fastapi-http-exception",
            status_code=exc.status_code,
            handled=handled,
        )
        return await http_exception_handler(request, exc)
    await _log_and_broadcast_http_error(
        request,
        exc,
        label="fastapi-unhandled-exception",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        handled=False,
    )
    content = {
        "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "message": "Internal Server Error",
        "data": None,
    }
    return JSONResponse(
        content=content, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


async def _log_and_broadcast_http_error(
    request: Request,
    exc: BaseException,
    *,
    label: str,
    status_code: int,
    handled: bool,
) -> None:
    context = get_logging_context()
    request_id = context.get("request_id") or ensure_request_context(request)
    project_config_id = context.get("project_config_id")
    log_context = {
        "request_method": request.method,
        "request_path": request.url.path,
        "response_status_code": status_code,
    }

    project_config_id = ID(project_config_id) if project_config_id else None
    severity = (
        SettaBackendLogEventSeverity.warning
        if handled
        else SettaBackendLogEventSeverity.error
    )
    message = _format_backend_log_event_message(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=status_code,
        exc=exc,
    )
    state: SettaFastAPIState | None = getattr(request.app.state, "setta", None)
    if state:
        await state.wmh_frontend_sender.log_failure_and_broadcast_backend_log_event(
            exc,
            label=label,
            message=message,
            severity=severity,
            project_config_id=project_config_id,
            handled=handled,
            context=log_context,
        )
        return

    log_failure(
        exc,
        label=label,
        handled=handled,
        logger=logger,
        context=log_context,
    )


def _format_backend_log_event_message(
    *,
    request_id: str | None,
    method: str,
    path: str,
    status_code: int,
    exc: BaseException,
) -> str:
    suffix = ""
    if request_id:
        suffix = f" (request {request_id})"
    if isinstance(exc, HTTPException):
        detail = str(exc.detail).replace("\n", " ").strip() if exc.detail else ""
        if detail:
            return f"HTTP {status_code}{suffix}: {method} {path} - {detail}"
        return f"HTTP {status_code}{suffix}: {method} {path} - HTTPException"
    exc_message = str(exc).replace("\n", " ").strip()
    exc_name = type(exc).__name__
    if exc_message:
        return (
            f"HTTP {status_code}{suffix}: {method} {path} - {exc_name}: {exc_message}"
        )
    return f"HTTP {status_code}{suffix}: {method} {path} - {exc_name}"
