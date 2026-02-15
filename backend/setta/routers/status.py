import shutil
import subprocess
import sys
from pathlib import Path

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from setta.routers.app_gen_extensions import _iter_skill_roots
from setta.routers.dependencies import AppStateFromRequest, require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.types.server_mode import ServerModeResponse
from setta.utils.init_status import (
    AuthRefreshStatusResponse,
    BackendInitStatusResponse,
    get_auth_refresh_status,
)
from setta.utils.paths import get_setta_paths
from setta.utils.setta_home import resolve_setta_home
from setta.utils.user_config import load_setta_user_config

router = SettaAPIRouter()


class SettaHomeInfoResponse(BaseModel):
    settaHome: str
    globalSettaFilesBase: str
    activeSettaFilesRoot: str
    activeSettaFilesLocation: str
    llmConfigPath: str


class RevealPathInOsFileExplorerRequest(BaseModel):
    path: str


def _build_reveal_path_command(path: Path) -> list[str]:
    if sys.platform == "darwin":
        if path.is_file():
            return ["open", "-R", str(path)]
        return ["open", str(path)]
    if sys.platform == "win32":
        if path.is_file():
            return ["explorer", f"/select,{path}"]
        return ["explorer", str(path)]
    directory = path if path.is_dir() else path.parent
    return ["xdg-open", str(directory)]


def _build_allowed_reveal_roots() -> list[Path]:
    paths = get_setta_paths()
    roots = [
        paths.workspace_root.resolve(strict=False),
        paths.setta_files_root.resolve(strict=False),
    ]
    for _, _, skill_root in _iter_skill_roots(paths.workspace_root):
        roots.append(skill_root.resolve(strict=False))
    unique_roots: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        if root in seen:
            continue
        seen.add(root)
        unique_roots.append(root)
    return unique_roots


def _is_path_within_allowed_reveal_roots(path: Path) -> bool:
    for root in _build_allowed_reveal_roots():
        if path.is_relative_to(root):
            return True
    return False


@router.get(Route.GET_BACKEND_INIT_STATUS)
def route_get_backend_init_status(
    state: AppStateFromRequest,
) -> BackendInitStatusResponse:
    return state.init_status.snapshot()


@router.get(Route.GET_AUTH_REFRESH_STATUS)
def route_get_auth_refresh_status() -> AuthRefreshStatusResponse:
    return get_auth_refresh_status()


@router.get(Route.GET_SERVER_MODE)
def route_get_server_mode(state: AppStateFromRequest) -> ServerModeResponse:
    if state.app_mode:
        return ServerModeResponse(mode="app")
    if state.share_mode:
        return ServerModeResponse(mode="share")
    return ServerModeResponse(mode="ide")


@router.get(Route.GET_SETTA_HOME_INFO, dependencies=[Depends(require_ide_mode)])
def route_get_setta_home_info() -> SettaHomeInfoResponse:
    home = resolve_setta_home()
    config = load_setta_user_config(setta_home=home)
    paths = get_setta_paths()
    return SettaHomeInfoResponse(
        settaHome=str(home),
        globalSettaFilesBase=str(config.global_setta_files_base),
        activeSettaFilesRoot=str(paths.setta_files_root),
        activeSettaFilesLocation=paths.setta_files_location,
        llmConfigPath=str(paths.setta_files_root / "llm_config.json"),
    )


@router.post(
    Route.REVEAL_PATH_IN_OS_FILE_EXPLORER,
    dependencies=[Depends(require_ide_mode)],
)
def route_reveal_path_in_os_file_explorer(
    x: RevealPathInOsFileExplorerRequest,
) -> None:
    raw_path = x.path.strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="Path is required.")
    resolved_path = Path(raw_path).expanduser().resolve(strict=False)
    if not resolved_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Path does not exist: {resolved_path}"
        )
    if not _is_path_within_allowed_reveal_roots(resolved_path):
        raise HTTPException(
            status_code=400,
            detail=f"Path is outside allowed reveal roots: {resolved_path}",
        )
    command = _build_reveal_path_command(resolved_path)
    executable = shutil.which(command[0])
    if executable is None:
        raise HTTPException(
            status_code=500,
            detail=f"File explorer command not available: {command[0]}",
        )
    subprocess.Popen(command)
