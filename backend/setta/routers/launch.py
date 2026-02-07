from fastapi import HTTPException, status
from pydantic import BaseModel

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.launch import LaunchError, launch_workspace_session
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.utils.network import build_bootstrap_urls

router = SettaAPIRouter()


class LaunchRequest(BaseModel):
    workspaceRoot: str | None = None
    filesRoot: str | None = None
    filesRootBase: str | None = None


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
        result = launch_workspace_session(
            workspace_root=x.workspaceRoot,
            files_root=x.filesRoot,
            files_root_base=x.filesRootBase,
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
