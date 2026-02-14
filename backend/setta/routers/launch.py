from typing import Literal

from fastapi import Depends
from pydantic import BaseModel

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.launch import LaunchError, launch_workspace_session
from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.ssh_connect import connect_remote_workspace_session
from setta.types.routes import Route
from setta.utils.network import build_bootstrap_urls

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])


class LaunchRequest(BaseModel):
    workspaceRoot: str | None = None
    settaFilesLocation: Literal["auto", "local", "global"] | None = None
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
    sessionId: str | None = None
    startedNew: bool | None = None
    session: LaunchSessionInfo | None = None
    remoteCmdResolved: str | None = None
    error: LaunchErrorPayload | None = None


@router.post(Route.LAUNCH)
def route_launch(x: LaunchRequest) -> LaunchResponse:
    try:
        if x.sshTarget:
            remote = connect_remote_workspace_session(
                ssh_target=x.sshTarget,
                workspace=x.workspaceRoot or "",
                setta_files_location=x.settaFilesLocation or "auto",
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
        setta_files_location = x.settaFilesLocation or "auto"

        result = launch_workspace_session(
            workspace_root=workspace_root,
            setta_files_location=setta_files_location,
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
        sessionId=result.session.id,
        startedNew=result.started_new,
        session=session_info,
    )
