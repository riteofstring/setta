import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import setta.mcp.tools  # noqa: F401
from setta.lsp.managers import (
    stop_file_watcher,
    stop_lsps,
)
from setta.routers import (
    ai_router,
    artifact_router,
    code_info_router,
    lsp_router,
    project_manager_router,
    projects_router,
    sections_router,
    settings_router,
    terminals_router,
    websocket_router,
)
from setta.server_state import SettaFastAPIState
from setta.types.routes import Route
from setta.utils.constants import IS_DEV_MODE, C
from setta.utils.utils import get_absolute_path

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
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

        # {full_path:path} is to catch all paths not explicitly covered here
        @app.get("/{full_path:path}", response_class=HTMLResponse)
        async def read_root(full_path: str):
            with open(dist_path / "index.html") as f:
                content = f.read()
            return content

    print(f"Ready: {C.BACKEND}", flush=True)
    try:
        yield
    finally:
        # app.state.setta.project_manager.delete_temp_folder()
        app.state.setta.specific_file_watcher.stop()
        await app.state.setta.mcp_client.stop()
        await stop_lsps(app.state.setta.lsps, app.state.setta.lsp_readers)
        stop_file_watcher(app.state.setta.lsp_writers)


app = FastAPI(
    lifespan=lifespan,
    openapi_url=f"{Route.PREFIX.value}{Route.OPENAPI_DOCS.value}",
    docs_url=f"{Route.PREFIX.value}{Route.SWAGGER_DOCS.value}",
    redoc_url=f"{Route.PREFIX.value}{Route.REDOC_DOCS.value}",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=C.FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


kwargs: dict[Literal["prefix"], str] = {"prefix": Route.PREFIX.value}
app.include_router(projects_router, **kwargs)
app.include_router(sections_router, **kwargs)
app.include_router(terminals_router, **kwargs)
app.include_router(websocket_router, **kwargs)
app.include_router(code_info_router, **kwargs)
app.include_router(settings_router, **kwargs)
app.include_router(artifact_router, **kwargs)
app.include_router(lsp_router, **kwargs)
app.include_router(ai_router, **kwargs)
app.include_router(project_manager_router, **kwargs)


# https://github.com/tiangolo/fastapi/issues/3361#issuecomment-1002120988
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    exc_str = f"{exc}".replace("\n", " ").replace("   ", " ")
    logger.error(f"{request}: {exc_str}")
    content = {"status_code": 10422, "message": exc_str, "data": None}
    return JSONResponse(
        content=content, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )
