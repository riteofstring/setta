import os
import signal
import time
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from fastapi import Depends, Request
from pydantic import BaseModel

from setta.auth.manager import (
    BOOTSTRAP_TOKEN_MANAGER,
    LAUNCH_INTENT_TOKEN_MANAGER,
)
from setta.auth.session import load_current_session_secret
from setta.launch import LaunchError, launch_workspace_session
from setta.launch_intent_store import (
    WorkspaceLaunchIntentStore,
    WorkspaceLaunchIntentStoreCapacityError,
    WorkspaceLaunchIntentStoreStateError,
    WorkspaceLaunchIntentStoreUnavailableError,
)
from setta.launcher_metadata import (
    LauncherMetadataError,
    update_launcher_last_used_workspace_if_installed,
)
from setta.routers.dependencies import require_not_deployment_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.ssh_common import normalize_optional_argument
from setta.ssh_connect import (
    connect_remote_workspace_session,
    rollback_remote_workspace_launch,
)
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStoreError,
)
from setta.types.routes import Route
from setta.utils.frontend_origin_policy import (
    is_return_origin_allowed,
    resolve_request_origin,
)
from setta.utils.launch_request import normalize_setta_files_location_for_launch
from setta.utils.launcher_handoff_trust import (
    trust_launched_workspace_origin_for_launcher_session,
)
from setta.utils.launcher_origin_handoff import (
    append_launcher_origin_handoff_to_bootstrap_url,
    mint_launcher_origin_handoff_proof,
    normalize_launcher_origin,
)
from setta.utils.network import build_bootstrap_urls
from setta.utils.paths import get_setta_paths_without_profile_env

router = SettaAPIRouter(dependencies=[Depends(require_not_deployment_mode)])


class LaunchRequest(BaseModel):
    launchIntentToken: str | None = None
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
    returnUrl: str | None = None
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


class CreateWorkspaceLaunchIntentRequest(BaseModel):
    launchRequest: LaunchRequest
    returnUrl: str


class CreateWorkspaceLaunchIntentResponse(BaseModel):
    ok: bool
    launchIntentToken: str | None = None
    requestedAt: int | None = None
    error: LaunchErrorPayload | None = None


SAFE_LAUNCH_RETURN_PATH = "/home"
_WORKSPACE_LAUNCH_INTENT_STORE = WorkspaceLaunchIntentStore()


def _rollback_started_local_session(
    *, session_id: str, pid: int, registry: object
) -> None:
    if pid > 0:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass

    try:
        delete_session = getattr(registry, "delete_session")
    except AttributeError:
        return
    try:
        delete_session(session_id)
    except OSError:
        pass


@router.post(Route.CREATE_WORKSPACE_LAUNCH_INTENT)
def route_create_workspace_launch_intent(
    x: CreateWorkspaceLaunchIntentRequest,
    request: Request = None,  # type: ignore[assignment]
) -> CreateWorkspaceLaunchIntentResponse:
    if x.launchRequest.launchIntentToken is not None:
        return CreateWorkspaceLaunchIntentResponse(
            ok=False,
            error=LaunchErrorPayload(
                code="BadRequest",
                message="launchIntentToken cannot be nested inside launchRequest.",
            ),
        )
    session_info = load_current_session_secret()
    if session_info is None:
        return CreateWorkspaceLaunchIntentResponse(
            ok=False,
            error=LaunchErrorPayload(code="Unauthorized", message="Missing session."),
        )
    session_metadata, secret = session_info
    launch_request_payload = x.launchRequest.model_dump(
        exclude_unset=True,
        exclude={"launchIntentToken"},
    )
    try:
        LaunchRequest.model_validate(launch_request_payload)
    except ValueError as exc:
        return CreateWorkspaceLaunchIntentResponse(
            ok=False,
            error=LaunchErrorPayload(code="BadRequest", message=str(exc)),
        )
    try:
        return_url = _validate_and_normalize_return_url(
            return_url=x.returnUrl,
            request=request,
            session_id=session_metadata.id,
        )
    except ValueError as exc:
        return CreateWorkspaceLaunchIntentResponse(
            ok=False,
            error=LaunchErrorPayload(code="BadRequest", message=str(exc)),
        )
    requested_at = int(time.time() * 1000)
    token, exp = LAUNCH_INTENT_TOKEN_MANAGER.mint(session_metadata.id, secret)
    try:
        _store_workspace_launch_intent(
            token=token,
            session_id=session_metadata.id,
            launch_request_payload=launch_request_payload,
            return_url=return_url,
            exp=exp,
        )
    except WorkspaceLaunchIntentStoreUnavailableError as exc:
        return CreateWorkspaceLaunchIntentResponse(
            ok=False,
            error=LaunchErrorPayload(
                code="LaunchIntentStoreUnavailable",
                message=str(exc),
            ),
        )
    except WorkspaceLaunchIntentStoreCapacityError as exc:
        return CreateWorkspaceLaunchIntentResponse(
            ok=False,
            error=LaunchErrorPayload(
                code="LaunchIntentStoreCapacityExceeded",
                message=str(exc),
            ),
        )
    except WorkspaceLaunchIntentStoreStateError as exc:
        return CreateWorkspaceLaunchIntentResponse(
            ok=False,
            error=LaunchErrorPayload(code="LaunchIntentStoreInvalid", message=str(exc)),
        )
    return CreateWorkspaceLaunchIntentResponse(
        ok=True,
        launchIntentToken=token,
        requestedAt=requested_at,
    )


@router.post(Route.LAUNCH)
def route_launch(
    x: LaunchRequest,
    request: Request = None,  # type: ignore[assignment]
) -> LaunchResponse:
    request_origin = resolve_request_origin(
        request,
        allow_client_origin_header=True,
    )
    return_url = _build_safe_launch_return_url(request_origin=request_origin)
    launcher_session_info = load_current_session_secret()
    requires_launch_intent_token = request is not None
    if x.launchIntentToken is None and requires_launch_intent_token:
        return LaunchResponse(
            ok=False,
            returnUrl=return_url,
            error=LaunchErrorPayload(
                code="BadRequest",
                message="launchIntentToken is required.",
            ),
        )
    if x.launchIntentToken is not None and _launch_request_has_inline_overrides(x):
        return LaunchResponse(
            ok=False,
            returnUrl=return_url,
            error=LaunchErrorPayload(
                code="BadRequest",
                message="launchIntentToken must be the only request field when provided.",
            ),
        )
    if x.launchIntentToken is not None:
        if launcher_session_info is None:
            return LaunchResponse(
                ok=False,
                returnUrl=return_url,
                error=LaunchErrorPayload(
                    code="Unauthorized", message="Missing session."
                ),
            )
        session_metadata, secret = launcher_session_info
        try:
            x, return_url = _consume_workspace_launch_intent(
                token=x.launchIntentToken,
                session_id=session_metadata.id,
                secret=secret,
            )
        except WorkspaceLaunchIntentStoreUnavailableError as exc:
            return LaunchResponse(
                ok=False,
                returnUrl=return_url,
                error=LaunchErrorPayload(
                    code="LaunchIntentStoreUnavailable",
                    message=str(exc),
                ),
            )
        except WorkspaceLaunchIntentStoreStateError as exc:
            return LaunchResponse(
                ok=False,
                returnUrl=return_url,
                error=LaunchErrorPayload(code="InvalidLaunchIntent", message=str(exc)),
            )
        except ValueError as exc:
            return LaunchResponse(
                ok=False,
                returnUrl=return_url,
                error=LaunchErrorPayload(code="InvalidLaunchIntent", message=str(exc)),
            )
    try:
        normalized_profile = normalize_optional_argument(x.profile)
        normalized_setta_home = normalize_optional_argument(x.settaHome)
        normalized_setta_files_root = normalize_optional_argument(x.settaFilesRoot)
        normalized_runtime_root = normalize_optional_argument(x.runtimeRoot)

        setta_files_location = normalize_setta_files_location_for_launch(
            setta_files_location=x.settaFilesLocation,
            setta_files_location_provided="settaFilesLocation" in x.model_fields_set,
            setta_files_root=normalized_setta_files_root,
            profile=normalized_profile,
        )
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
                launcher_origin=request_origin,
            )
            remote_bootstrap_url = remote.bootstrap_url_fragment
            if request_origin is not None:
                if remote.launcher_origin_proof is None:
                    raise LaunchError(
                        "RemoteConnectInfo",
                        "Remote connect info did not include launcherOriginProof.",
                    )
                remote_bootstrap_url = append_launcher_origin_handoff_to_bootstrap_url(
                    bootstrap_url_fragment=remote_bootstrap_url,
                    launcher_origin=request_origin,
                    proof=remote.launcher_origin_proof,
                )
            resolved_workspace_root = remote.session.workspace_path_canonical
            try:
                trust_launched_workspace_origin_for_launcher_session(
                    request_origin=request_origin,
                    bootstrap_url_fragment=remote_bootstrap_url,
                    launcher_session_info=launcher_session_info,
                )
            except TrustedFrontendOriginStoreError as exc:
                if remote.started_new:
                    try:
                        rollback_remote_workspace_launch(
                            ssh_target=x.sshTarget,
                            ssh_args=x.sshArgs,
                            workspace=remote.session.workspace_path_canonical,
                            session_id=remote.session.id,
                            remote_cmd=remote.remote_cmd_resolved,
                            remote_host=remote.session.host,
                            remote_port=remote.session.port,
                            profile=normalized_profile,
                            setta_home=normalized_setta_home,
                            setta_files_root=normalized_setta_files_root,
                            setta_files_location=setta_files_location,
                            runtime_root=normalized_runtime_root,
                        )
                    except LaunchError as rollback_exc:
                        return LaunchResponse(
                            ok=False,
                            returnUrl=return_url,
                            error=LaunchErrorPayload(
                                code="RemoteRollbackFailed",
                                message=(
                                    "Launch trust persistence failed and rollback of "
                                    f"remote session {remote.session.id} also failed: "
                                    f"{rollback_exc}"
                                ),
                            ),
                        )
                return LaunchResponse(
                    ok=False,
                    returnUrl=return_url,
                    error=LaunchErrorPayload(
                        code="TrustedFrontendOriginStoreUnavailable",
                        message=str(exc),
                    ),
                )
            return LaunchResponse(
                ok=True,
                bootstrapUrlFragment=remote_bootstrap_url,
                returnUrl=return_url,
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
            paths = get_setta_paths_without_profile_env()
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
            returnUrl=return_url,
            error=LaunchErrorPayload(code=exc.code, message=str(exc)),
        )
    except ValueError as exc:
        return LaunchResponse(
            ok=False,
            returnUrl=return_url,
            error=LaunchErrorPayload(code="BadRequest", message=str(exc)),
        )

    try:
        update_launcher_last_used_workspace_if_installed(
            setta_home=result.paths.setta_home,
            workspace_root=result.paths.workspace_root,
        )
    except (LauncherMetadataError, OSError):
        # Workspace launches should continue even if launcher metadata is malformed.
        pass

    secret = result.registry.load_secret(result.session)
    token = BOOTSTRAP_TOKEN_MANAGER.mint(result.session.id, secret)
    bootstrap_url_fragment, _ = build_bootstrap_urls(
        result.session.host, result.session.port, token
    )
    if request_origin is not None:
        launcher_origin_proof = mint_launcher_origin_handoff_proof(
            session_id=result.session.id,
            launcher_origin=request_origin,
            secret=secret,
        )
        bootstrap_url_fragment = append_launcher_origin_handoff_to_bootstrap_url(
            bootstrap_url_fragment=bootstrap_url_fragment,
            launcher_origin=request_origin,
            proof=launcher_origin_proof,
        )
    try:
        trust_launched_workspace_origin_for_launcher_session(
            request_origin=request_origin,
            bootstrap_url_fragment=bootstrap_url_fragment,
            launcher_session_info=launcher_session_info,
        )
    except TrustedFrontendOriginStoreError as exc:
        if result.started_new:
            _rollback_started_local_session(
                session_id=result.session.id,
                pid=result.session.pid,
                registry=result.registry,
            )
        return LaunchResponse(
            ok=False,
            returnUrl=return_url,
            error=LaunchErrorPayload(
                code="TrustedFrontendOriginStoreUnavailable",
                message=str(exc),
            ),
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
        returnUrl=return_url,
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


def _launch_request_has_inline_overrides(x: LaunchRequest) -> bool:
    for field_name in x.model_fields_set:
        if field_name != "launchIntentToken":
            return True
    return False


def _store_workspace_launch_intent(
    *,
    token: str,
    session_id: str,
    launch_request_payload: dict[str, object],
    return_url: str,
    exp: int,
) -> None:
    _WORKSPACE_LAUNCH_INTENT_STORE.create(
        token=token,
        session_id=session_id,
        launch_request_payload=launch_request_payload,
        return_url=return_url,
        exp=exp,
        now=int(time.time()),
    )


def _consume_workspace_launch_intent(
    *,
    token: str,
    session_id: str,
    secret: bytes,
) -> tuple[LaunchRequest, str]:
    payload = LAUNCH_INTENT_TOKEN_MANAGER.validate(token, secret)
    if payload.sessionId != session_id:
        raise ValueError("Launch intent token is bound to a different session.")
    stored = _WORKSPACE_LAUNCH_INTENT_STORE.consume_once(
        token=token,
        session_id=session_id,
        now=int(time.time()),
    )
    return LaunchRequest.model_validate(
        stored.launch_request_payload
    ), stored.return_url


def _build_safe_launch_return_url(*, request_origin: str | None) -> str:
    if request_origin is None:
        return SAFE_LAUNCH_RETURN_PATH
    return f"{request_origin}{SAFE_LAUNCH_RETURN_PATH}"


def _validate_and_normalize_return_url(
    *,
    return_url: str,
    request: Request | None,
    session_id: str | None,
) -> str:
    trimmed_return_url = return_url.strip()
    if not trimmed_return_url:
        raise ValueError("returnUrl must not be blank.")
    parsed = urlsplit(trimmed_return_url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("returnUrl must use http or https.")
    if parsed.username or parsed.password:
        raise ValueError("returnUrl must not include credentials.")
    if not parsed.netloc:
        raise ValueError("returnUrl must include an origin.")

    normalized_origin = normalize_launcher_origin(f"{parsed.scheme}://{parsed.netloc}")
    if normalized_origin is None:
        raise ValueError("returnUrl origin is invalid.")

    request_origin = resolve_request_origin(request)
    if not is_return_origin_allowed(
        return_origin=normalized_origin,
        request_origin=request_origin,
        session_id=session_id,
    ):
        raise ValueError("returnUrl origin is not allowed.")

    normalized_origin_parts = urlsplit(normalized_origin)
    normalized_path = parsed.path if parsed.path else "/"
    return urlunsplit(
        (
            normalized_origin_parts.scheme,
            normalized_origin_parts.netloc,
            normalized_path,
            parsed.query,
            parsed.fragment,
        )
    )
