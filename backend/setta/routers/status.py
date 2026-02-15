import os
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, HTTPException
from pydantic import BaseModel

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
from setta.utils.skill_roots import iter_skill_roots
from setta.utils.user_config import load_setta_user_config

router = SettaAPIRouter()
_REVEAL_PATH_COMMAND_TIMEOUT_SECONDS = 5


class SettaHomeInfoResponse(BaseModel):
    settaHome: str
    globalSettaFilesBase: str
    activeSettaFilesLocation: str | None
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
    cache_key = _build_allowed_reveal_roots_cache_key(
        workspace_root=paths.workspace_root,
        setta_files_root=paths.setta_files_root,
    )
    return list(_build_allowed_reveal_roots_for_cache_key(cache_key))


def _build_allowed_reveal_roots_cache_key(
    *,
    workspace_root: Path,
    setta_files_root: Path,
) -> tuple[str, str, str, str, str, str]:
    return (
        str(workspace_root.resolve(strict=False)),
        str(setta_files_root.resolve(strict=False)),
        str(Path.home().expanduser().resolve(strict=False)),
        os.environ.get("AGENTS_HOME", ""),
        os.environ.get("CODEX_HOME", ""),
        os.environ.get("XDG_CONFIG_HOME", ""),
    )


@lru_cache(maxsize=32)
def _build_allowed_reveal_roots_for_cache_key(
    cache_key: tuple[str, str, str, str, str],
) -> tuple[Path, ...]:
    workspace_root = Path(cache_key[0])
    setta_files_root = Path(cache_key[1])
    roots = [
        workspace_root.resolve(strict=False),
        setta_files_root.resolve(strict=False),
    ]
    for _, _, skill_root in iter_skill_roots(workspace_root):
        roots.append(skill_root.resolve(strict=False))
    unique_roots: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        if root in seen:
            continue
        seen.add(root)
        unique_roots.append(root)
    return tuple(unique_roots)


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
    if not _is_path_within_allowed_reveal_roots(resolved_path):
        raise HTTPException(
            status_code=400,
            detail="Path is outside allowed reveal roots.",
        )
    if not resolved_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Path does not exist: {resolved_path}"
        )
    command = _build_reveal_path_command(resolved_path)
    executable = shutil.which(command[0])
    if executable is None:
        raise HTTPException(
            status_code=500,
            detail=f"File explorer command not available: {command[0]}",
        )
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=_REVEAL_PATH_COMMAND_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to reveal path in file explorer: "
                f"{command[0]} timed out after {_REVEAL_PATH_COMMAND_TIMEOUT_SECONDS}s."
            ),
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to launch file explorer: {exc}",
        ) from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        if not detail:
            detail = f"{command[0]} exited with status {result.returncode}."
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reveal path in file explorer: {detail}",
        )
