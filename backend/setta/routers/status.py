import os
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import Body, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from setta.launcher_metadata import LauncherOpenMode, LauncherWorkspaceBehavior
from setta.launcher_setup import (
    LauncherSetupError,
    LauncherStatusSnapshot,
    collect_launcher_status,
    remove_launcher_installation,
    repair_launcher_installation,
    setup_launcher_installation,
    update_launcher_installation,
)
from setta.routers.dependencies import AppStateFromRequest, require_ide_mode
from setta.routers.launcher_scope import resolve_launcher_setta_home
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.mcp_runtime_status import (
    GetMCPServerRuntimeStatusRequest,
    MCPServerRuntimeStatusResponse,
)
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


class LauncherOperationErrorPayload(BaseModel):
    code: str
    message: str


class LauncherStatusResponse(BaseModel):
    ok: bool
    installed: bool | None = None
    settaHome: str | None = None
    launcherDir: str | None = None
    metadataPath: str | None = None
    targetCommand: list[str] | None = None
    targetValid: bool | None = None
    targetError: str | None = None
    channel: str | None = None
    settaVersion: str | None = None
    openMode: LauncherOpenMode | None = None
    workspaceBehavior: LauncherWorkspaceBehavior | None = None
    lastUsedWorkspace: str | None = None
    artifactOptions: dict[str, str] = Field(default_factory=dict)
    managedArtifacts: dict[str, str] = Field(default_factory=dict)
    existingManagedArtifacts: list[str] = Field(default_factory=list)
    missingManagedArtifacts: list[str] = Field(default_factory=list)
    updateCapability: Literal["in_app", "installer_managed", "unsupported"] | None = (
        None
    )
    updateGuidance: str | None = None
    error: LauncherOperationErrorPayload | None = None


class LauncherUpdateResponse(LauncherStatusResponse):
    packageSpec: str | None = None
    fromVersion: str | None = None
    toVersion: str | None = None


class LauncherRequestBase(BaseModel):
    settaHome: str | None = None


class SetupLauncherRequest(LauncherRequestBase):
    model_config = ConfigDict(extra="forbid")

    channel: str = "manual"
    openMode: LauncherOpenMode = "chrome-app"
    workspaceBehavior: Literal["last-used-or-prompt", "always-prompt"] | None = None
    installArtifacts: bool = True
    artifactOptions: dict[str, str] = Field(default_factory=dict)


class UpdateLauncherRequest(LauncherRequestBase):
    packageSpec: str = "setta"


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
    cache_key: tuple[str, str, str, str, str, str],
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
    if state.launcher_mode:
        return ServerModeResponse(mode="launcher")
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


@router.get(Route.GET_LAUNCHER_STATUS, dependencies=[Depends(require_ide_mode)])
def route_get_launcher_status(setta_home: str | None = None) -> LauncherStatusResponse:
    resolved_setta_home = resolve_launcher_setta_home(setta_home=setta_home)
    try:
        status = collect_launcher_status(setta_home=resolved_setta_home)
    except LauncherSetupError as exc:
        return _launcher_error_response(exc)
    return _launcher_status_response(status)


@router.post(Route.SETUP_LAUNCHER, dependencies=[Depends(require_ide_mode)])
def route_setup_launcher(x: SetupLauncherRequest) -> LauncherStatusResponse:
    setta_home = resolve_launcher_setta_home(setta_home=x.settaHome)
    provided_fields = x.model_fields_set
    raw_workspace_behavior = (
        x.workspaceBehavior
        if "workspaceBehavior" in provided_fields
        else None
    )
    workspace_behavior = _normalize_launcher_workspace_behavior_for_setup(
        raw_workspace_behavior
    )
    channel = x.channel if "channel" in provided_fields else None
    open_mode = x.openMode if "openMode" in provided_fields else None
    install_artifacts = (
        x.installArtifacts if "installArtifacts" in provided_fields else True
    )
    artifact_options = (
        x.artifactOptions if "artifactOptions" in provided_fields else None
    )
    try:
        setup_launcher_installation(
            setta_home=setta_home,
            channel=channel,
            open_mode=open_mode,
            workspace_behavior=workspace_behavior,
            install_artifacts=install_artifacts,
            artifact_options=artifact_options,
        )
        status = collect_launcher_status(setta_home=setta_home)
    except LauncherSetupError as exc:
        return _launcher_error_response(exc)
    return _launcher_status_response(status)


@router.post(Route.REPAIR_LAUNCHER, dependencies=[Depends(require_ide_mode)])
def route_repair_launcher(
    x: LauncherRequestBase = Body(default_factory=LauncherRequestBase),
) -> LauncherStatusResponse:
    setta_home = resolve_launcher_setta_home(setta_home=x.settaHome)
    try:
        repair_result = repair_launcher_installation(setta_home=setta_home)
    except LauncherSetupError as exc:
        return _launcher_error_response(exc)
    return _launcher_status_response(repair_result.status)


@router.post(Route.REMOVE_LAUNCHER, dependencies=[Depends(require_ide_mode)])
def route_remove_launcher(
    x: LauncherRequestBase = Body(default_factory=LauncherRequestBase),
) -> LauncherStatusResponse:
    setta_home = resolve_launcher_setta_home(setta_home=x.settaHome)
    try:
        remove_launcher_installation(setta_home=setta_home)
        status = collect_launcher_status(setta_home=setta_home)
    except LauncherSetupError as exc:
        return _launcher_error_response(exc)
    return _launcher_status_response(status)


@router.post(Route.UPDATE_LAUNCHER, dependencies=[Depends(require_ide_mode)])
def route_update_launcher(
    x: UpdateLauncherRequest = Body(default_factory=UpdateLauncherRequest),
) -> LauncherUpdateResponse:
    setta_home = resolve_launcher_setta_home(setta_home=x.settaHome)
    try:
        update_result = update_launcher_installation(
            setta_home=setta_home,
            package_spec=x.packageSpec,
        )
    except LauncherSetupError as exc:
        return LauncherUpdateResponse(
            ok=False,
            error=LauncherOperationErrorPayload(code=exc.code, message=str(exc)),
        )
    status_payload = _launcher_status_response(update_result.status)
    return LauncherUpdateResponse(
        **status_payload.model_dump(mode="python"),
        packageSpec=update_result.package_spec,
        fromVersion=update_result.from_version,
        toVersion=update_result.to_version,
    )


@router.post(
    Route.GET_MCP_SERVER_RUNTIME_STATUS,
    dependencies=[Depends(require_ide_mode)],
)
def route_get_mcp_server_runtime_status(
    x: GetMCPServerRuntimeStatusRequest,
    state: AppStateFromRequest,
) -> MCPServerRuntimeStatusResponse:
    paths = get_setta_paths()
    external_servers = []
    external_runner = state.external_agent_runner
    if not external_runner.disabled:
        external_servers = external_runner.get_mcp_server_runtime_statuses(
            chat_id=x.chatId,
            engine_config_id=x.engineConfigId,
        )
    return MCPServerRuntimeStatusResponse(
        llmConfigPath=str(paths.setta_files_root / "llm_config.json"),
        activeSettaFilesLocation=paths.setta_files_location,
        servers=state.mcp_client.get_server_runtime_statuses(),
        externalServers=external_servers,
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


def _normalize_launcher_workspace_behavior_for_setup(
    raw_behavior: Literal["last-used-or-prompt", "always-prompt"] | None,
) -> LauncherWorkspaceBehavior | None:
    if raw_behavior is None:
        return None
    if raw_behavior == "always-prompt":
        return "always_prompt"
    return "last_used_or_prompt"


def _launcher_error_response(exc: LauncherSetupError) -> LauncherStatusResponse:
    return LauncherStatusResponse(
        ok=False,
        error=LauncherOperationErrorPayload(code=exc.code, message=str(exc)),
    )


def _launcher_status_response(status: LauncherStatusSnapshot) -> LauncherStatusResponse:
    payload = status.to_payload()
    return LauncherStatusResponse(**payload)
