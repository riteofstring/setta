from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

CONFIG_ENDPOINT = "/__setta__/config"
DEFAULT_FRONTEND_ROOT = Path(__file__).resolve().parent / "static" / "frontend"


class LocalUIConfig(BaseModel):
    apiBaseUrl: str
    token: str


@dataclass
class LocalUIState:
    frontend_root: Path
    config: LocalUIConfig | None = None


def create_local_ui_app(
    *,
    frontend_root: Path | None = None,
    config: LocalUIConfig | None = None,
) -> FastAPI:
    resolved_root = frontend_root or DEFAULT_FRONTEND_ROOT
    if not resolved_root.exists():
        raise RuntimeError(f"Frontend assets not found at {resolved_root}")

    app = FastAPI()
    app.state.local_ui = LocalUIState(frontend_root=resolved_root, config=config)

    @app.post(CONFIG_ENDPOINT)
    def set_runtime_config(payload: LocalUIConfig) -> LocalUIConfig:
        app.state.local_ui.config = payload
        return payload

    @app.get(CONFIG_ENDPOINT)
    def get_runtime_config() -> LocalUIConfig:
        config = app.state.local_ui.config
        if config is None:
            raise HTTPException(
                status_code=503,
                detail="Runtime config not set. POST /__setta__/config to configure.",
            )
        return config

    @app.get("/{path:path}")
    def serve_frontend(path: str) -> FileResponse:
        frontend_root = app.state.local_ui.frontend_root
        if path:
            target = frontend_root / path
            if target.is_file():
                return FileResponse(target)
        index_path = frontend_root / "index.html"
        if not index_path.is_file():
            raise HTTPException(
                status_code=500,
                detail="Frontend index.html missing. Run pnpm build.",
            )
        return FileResponse(index_path)

    return app
