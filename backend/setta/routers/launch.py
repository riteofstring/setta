from pathlib import PurePosixPath

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.launch import LaunchError, launch_workspace_session
from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.ssh_connect import connect_remote_workspace_session
from setta.types.routes import Route
from setta.utils.network import build_bootstrap_urls
from setta.utils.paths import (
    build_files_root_from_base,
    resolve_path,
    resolve_setta_paths,
)

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])


def _strip_posix_trailing_slash(value: str) -> str:
    stripped = value.rstrip("/")
    return stripped or "/"


class LaunchRequest(BaseModel):
    workspaceRoot: str | None = None
    filesRoot: str | None = None
    filesRootBase: str | None = None
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
    filesRoot: str | None = None
    sessionId: str | None = None
    startedNew: bool | None = None
    session: LaunchSessionInfo | None = None
    error: LaunchErrorPayload | None = None


@router.post(Route.LAUNCH)
def route_launch(x: LaunchRequest) -> LaunchResponse:
    try:
        if x.sshTarget:
            remote = connect_remote_workspace_session(
                ssh_target=x.sshTarget,
                workspace=x.workspaceRoot or "",
                files_root=x.filesRoot,
                files_root_base=x.filesRootBase,
                ssh_args=x.sshArgs,
                remote_cmd=x.remoteCmd,
                local_port=x.localPort,
            )
            resolved_workspace_root = remote.session.workspace_path_canonical
            resolved_files_root: str | None = None
            if x.filesRoot is not None and x.filesRoot.strip():
                resolved_files_root = _strip_posix_trailing_slash(x.filesRoot.strip())
            elif x.filesRootBase is not None and x.filesRootBase.strip():
                computed_root = build_files_root_from_base(
                    PurePosixPath(x.filesRootBase.strip()),
                    PurePosixPath(resolved_workspace_root),
                )
                resolved_files_root = _strip_posix_trailing_slash(
                    computed_root.as_posix()
                )
            return LaunchResponse(
                ok=True,
                bootstrapUrlFragment=remote.bootstrap_url_fragment,
                workspaceRoot=resolved_workspace_root,
                filesRoot=resolved_files_root,
                sessionId=remote.session.id,
                startedNew=remote.started_new,
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
        files_root = x.filesRoot
        files_root_base = x.filesRootBase

        requested_workspace = None
        if workspace_root is not None and workspace_root.strip():
            requested_workspace = resolve_path(workspace_root.strip())
        ignore_env_files_root = False
        if requested_workspace is not None:
            ignore_env_files_root = (
                requested_workspace != resolve_setta_paths().workspace_root
            )

        result = launch_workspace_session(
            workspace_root=workspace_root,
            files_root=files_root,
            files_root_base=files_root_base,
            ignore_env_files_root=ignore_env_files_root,
        )
    except LaunchError as exc:
        return LaunchResponse(
            ok=False,
            error=LaunchErrorPayload(code=exc.code, message=str(exc)),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

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
        filesRoot=str(result.paths.setta_files_root),
        sessionId=result.session.id,
        startedNew=result.started_new,
        session=session_info,
    )
