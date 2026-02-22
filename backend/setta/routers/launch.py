import os
from typing import Literal

from fastapi import Depends
from pydantic import BaseModel

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.launch import LaunchError, launch_workspace_session
from setta.launcher_metadata import (
    LauncherMetadataError,
    update_launcher_last_used_workspace_if_installed,
)
from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.ssh_common import normalize_optional_argument
from setta.ssh_connect import connect_remote_workspace_session
from setta.types.routes import Route
from setta.utils.env_vars import PROFILE_ENV
from setta.utils.network import build_bootstrap_urls
from setta.utils.paths import get_setta_paths

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])


class LaunchRequest(BaseModel):
    workspaceRoot: str | None = None
    profile: str | None = None
    settaHome: str | None = None
    settaFilesRoot: str | None = None
    settaFilesLocation: Literal["auto", "local", "global"] | None = None
    runtimeRoot: str | None = None
    sshTarget: str | None = None
    sshArgs: str | None = None
    remoteCmd: str | None = None
    localPort: int | None = None


class LaunchErrorPayload(BaseModel):
    code: str
    message: str


class LaunchSessionInfo(BaseModel):
    id: str
    workspacePath: str
    workspacePathCanonical: str
    host: str
    port: int
    pid: int
    startedAt: str


class LaunchResponse(BaseModel):
    ok: bool
    bootstrapUrlFragment: str | None = None
    workspaceRoot: str | None = None
    settaFilesLocation: Literal["local", "global"] | None = None
    settaFilesRoot: str | None = None
    runtimeRoot: str | None = None
    settaHome: str | None = None
    profile: str | None = None
    sessionId: str | None = None
    startedNew: bool | None = None
    session: LaunchSessionInfo | None = None
    remoteCmdResolved: str | None = None
    error: LaunchErrorPayload | None = None


@router.post(Route.LAUNCH)
def route_launch(x: LaunchRequest) -> LaunchResponse:
    try:
        normalized_profile = normalize_optional_argument(x.profile)
        normalized_setta_home = normalize_optional_argument(x.settaHome)
        normalized_setta_files_root = normalize_optional_argument(x.settaFilesRoot)
        normalized_runtime_root = normalize_optional_argument(x.runtimeRoot)

        if x.settaFilesLocation is not None:
            if (
                normalized_setta_files_root is not None
                and x.settaFilesLocation == "auto"
            ):
                # Treat explicit "auto" as omitted when an explicit files root is set.
                setta_files_location = None
            else:
                setta_files_location = x.settaFilesLocation
        elif normalized_setta_files_root is not None or normalized_profile is not None:
            # Preserve omission so explicit root/profile config can drive location/root selection.
            setta_files_location = None
        else:
            # Keep API launches insulated from server-process SETTA_FILES_LOCATION env.
            setta_files_location = "auto"
        if x.sshTarget:
            remote = connect_remote_workspace_session(
                ssh_target=x.sshTarget,
                workspace=x.workspaceRoot or "",
                profile=normalized_profile,
                setta_home=normalized_setta_home,
                setta_files_root=normalized_setta_files_root,
                setta_files_location=setta_files_location,
                runtime_root=normalized_runtime_root,
                ssh_args=x.sshArgs,
                remote_cmd=x.remoteCmd,
                local_port=x.localPort,
            )
            resolved_workspace_root = remote.session.workspace_path_canonical
            return LaunchResponse(
                ok=True,
                bootstrapUrlFragment=remote.bootstrap_url_fragment,
                workspaceRoot=resolved_workspace_root,
                settaFilesLocation=remote.setta_files_location,
                settaFilesRoot=remote.setta_files_root,
                runtimeRoot=remote.runtime_root,
                settaHome=remote.setta_home,
                profile=remote.profile,
                sessionId=remote.session.id,
                startedNew=remote.started_new,
                remoteCmdResolved=remote.remote_cmd_resolved,
                session=LaunchSessionInfo(
                    id=remote.session.id,
                    workspacePath=remote.session.workspace_path,
                    workspacePathCanonical=remote.session.workspace_path_canonical,
                    host=remote.session.host,
                    port=remote.session.port,
                    pid=remote.session.pid,
                    startedAt=remote.session.started_at.isoformat(),
                ),
            )
        workspace_root = x.workspaceRoot
        local_setta_home = normalized_setta_home
        local_profile_lookup_home: str | None = None
        if local_setta_home is None:
            # route_launch should not be influenced by request-time SETTA_PROFILE
            # mutations. We still read server defaults via get_setta_paths().
            raw_profile_env = os.environ.pop(PROFILE_ENV, None)
            try:
                paths = get_setta_paths()
            finally:
                if raw_profile_env is not None:
                    os.environ[PROFILE_ENV] = raw_profile_env
            local_setta_home = str(paths.setta_home)
            if normalized_profile is not None:
                local_profile_lookup_home = str(paths.profile_lookup_home)

        result = launch_workspace_session(
            workspace_root=workspace_root,
            profile=normalized_profile,
            setta_home=local_setta_home,
            profile_lookup_home=local_profile_lookup_home,
            setta_files_root=normalized_setta_files_root,
            setta_files_location=setta_files_location,
            runtime_root=normalized_runtime_root,
            allow_env_files_overrides=False,
            allow_env_non_files_overrides=False,
        )
    except LaunchError as exc:
        return LaunchResponse(
            ok=False,
            error=LaunchErrorPayload(code=exc.code, message=str(exc)),
        )
    except ValueError as exc:
        return LaunchResponse(
            ok=False,
            error=LaunchErrorPayload(code="BadRequest", message=str(exc)),
        )

    try:
        update_launcher_last_used_workspace_if_installed(
            setta_home=result.paths.setta_home,
            workspace_root=result.paths.workspace_root,
        )
    except LauncherMetadataError:
        # Workspace launches should continue even if launcher metadata is malformed.
        pass

    secret = result.registry.load_secret(result.session)
    token = BOOTSTRAP_TOKEN_MANAGER.mint(result.session.id, secret)
    bootstrap_url_fragment, _ = build_bootstrap_urls(
        result.session.host, result.session.port, token
    )
    session_info = LaunchSessionInfo(
        id=result.session.id,
        workspacePath=result.session.workspacePath,
        workspacePathCanonical=result.session.workspacePathCanonical,
        host=result.session.host,
        port=result.session.port,
        pid=result.session.pid,
        startedAt=result.session.startedAt.isoformat(),
    )
    return LaunchResponse(
        ok=True,
        bootstrapUrlFragment=bootstrap_url_fragment,
        workspaceRoot=str(result.paths.workspace_root),
        settaFilesLocation=result.paths.setta_files_location,
        settaFilesRoot=str(result.paths.setta_files_root),
        runtimeRoot=str(result.paths.runtime_root),
        settaHome=str(result.paths.setta_home),
        profile=result.paths.profile_name,
        sessionId=result.session.id,
        startedNew=result.started_new,
        session=session_info,
    )
