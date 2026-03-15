from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException, WebSocket, status
from starlette.websockets import WebSocketState

from setta.database.db_objs import DBE
from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.share_deployment import SharePolicy

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateSingleConfig
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

_SHARE_ALLOWED_SUBFOLDERS = ("artifacts", "json_sources", "code")


def _resolve_request_path(path: str | Path, deployment_root: Path) -> Path:
    raw_path = Path(path)
    if raw_path.is_absolute():
        return raw_path.resolve()
    return (deployment_root / raw_path).resolve()


def _share_allowed_roots(deployment_root: Path) -> list[Path]:
    return [
        (deployment_root / folder).resolve() for folder in _SHARE_ALLOWED_SUBFOLDERS
    ]


def ensure_share_deployment_path(
    path: str | Path, deployment_root: Path | None
) -> Path:
    if deployment_root is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deployment root is not configured.",
        )
    resolved = _resolve_request_path(path, deployment_root)
    for root in _share_allowed_roots(deployment_root):
        if resolved.is_relative_to(root):
            return resolved
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Deployment mode file access is restricted to the deployment "
            "artifacts/json_sources/code paths."
        ),
    )


def load_share_policy_from_dbe(dbe: DBE) -> SharePolicy:
    policy_path = dbe.path / "policy.json"
    if not policy_path.exists():
        raise FileNotFoundError(f"Deployment policy not found: {policy_path}")
    payload = dbe.read_json(policy_path)
    if not payload:
        raise ValueError(f"Deployment policy is empty: {policy_path}")
    return SharePolicy.model_validate(payload)


def _policy_from_state(state: "SettaFastAPIState") -> SharePolicy:
    if state.deployment_mode:
        return state.share_runtime_state.share_policy
    return SharePolicy()


async def _notify_and_raise(
    frontend_sender: "WMHFrontendSender",
    *,
    message: str,
    share_session_id: str | None,
) -> None:
    await frontend_sender.log_and_broadcast_backend_log_event(
        message,
        severity=SettaBackendLogEventSeverity.warning,
        project_config_id=None,
        share_session_id=share_session_id,
    )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


async def _notify_and_close(
    frontend_sender: "WMHFrontendSender",
    websocket: WebSocket,
    *,
    message: str,
    share_session_id: str | None,
) -> None:
    await frontend_sender.log_and_broadcast_backend_log_event(
        message,
        severity=SettaBackendLogEventSeverity.warning,
        project_config_id=None,
        share_session_id=share_session_id,
    )
    if websocket.application_state == WebSocketState.CONNECTING:
        await websocket.accept()
    await websocket.close(code=4403)


async def deny_in_deployment_mode(
    *,
    deployment_mode: bool,
    frontend_sender: "WMHFrontendSender",
    message: str,
    share_session_id: str | None = None,
) -> None:
    if not deployment_mode:
        return
    await _notify_and_raise(
        frontend_sender,
        message=message,
        share_session_id=share_session_id,
    )


async def ensure_share_code_param_allowed(
    *,
    frontend_sender: "WMHFrontendSender",
    is_code_param: bool,
    share_session_id: str | None = None,
) -> None:
    if not is_code_param:
        return
    await _notify_and_raise(
        frontend_sender,
        message="Deployment mode disallows CodeParam edits.",
        share_session_id=share_session_id,
    )


async def enforce_share_policy(
    *,
    deployment_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    policy_flag: str,
    denied_message: str,
    share_session_id: str | None = None,
) -> None:
    if not deployment_mode:
        return
    if not getattr(policy, policy_flag):
        await _notify_and_raise(
            frontend_sender,
            message=denied_message,
            share_session_id=share_session_id,
        )


class SharePolicyGuard(str, Enum):
    param = "param"
    variant = "variant"
    layout = "layout"


async def enforce_share_policy_guard(
    ctx: "RuntimeContext",
    guard: SharePolicyGuard,
) -> None:
    if not ctx.deployment_mode:
        return
    if guard is SharePolicyGuard.param:
        await ctx.enforce_policy(
            policy_flag="allowParamChanges",
            denied_message="Deployment policy disallows parameter changes.",
        )
        return
    if guard is SharePolicyGuard.variant:
        await ctx.enforce_policy(
            policy_flag="allowVariantChanges",
            denied_message="Deployment policy disallows variant changes.",
        )
        return
    if guard is SharePolicyGuard.layout:
        await ctx.enforce_policy(
            policy_flag="allowLayoutChanges",
            denied_message="Deployment policy disallows layout changes.",
        )
        return
    raise KeyError(f"Unsupported share policy guard: {guard}")


async def enforce_share_policy_ws(
    websocket: WebSocket,
    *,
    deployment_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    policy_flag: str,
    denied_message: str,
    share_session_id: str | None = None,
) -> bool:
    if not deployment_mode:
        return True
    if not getattr(policy, policy_flag):
        await _notify_and_close(
            frontend_sender,
            websocket,
            message=denied_message,
            share_session_id=share_session_id,
        )
        return False
    return True


async def ensure_share_run_allowed(
    state: "SettaFastAPIState",
    *,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        deployment_mode=state.deployment_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowRun",
        denied_message="Deployment policy disallows run and terminal access.",
        share_session_id=share_session_id,
    )
    if state.deployment_mode and not state.terminals:
        await _notify_and_raise(
            state.wmh_frontend_sender,
            message="Deployment run support is not enabled.",
            share_session_id=share_session_id,
        )


async def ensure_share_download_allowed(
    state: "SettaFastAPIState",
    *,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        deployment_mode=state.deployment_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowFileDownloads",
        denied_message="Deployment policy disallows file downloads.",
        share_session_id=share_session_id,
    )


async def ensure_share_multiple_runs_allowed(
    state: "SettaFastAPIState",
    *,
    share_session_id: str | None = None,
) -> bool:
    if not state.deployment_mode:
        return False
    policy = _policy_from_state(state)
    if policy.allowMultipleRuns:
        return False
    if share_session_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing share session id.",
        )
    reserved = await state.share_runtime_state.try_reserve_session_run_count(
        share_session_id
    )
    if not reserved:
        await _notify_and_raise(
            state.wmh_frontend_sender,
            message="Deployment policy allows only one run per session.",
            share_session_id=share_session_id,
        )
    return True


async def ensure_share_run_allowed_ws(
    state: "SettaFastAPIState",
    websocket: WebSocket,
    *,
    share_session_id: str | None = None,
) -> bool:
    allowed = await enforce_share_policy_ws(
        websocket,
        deployment_mode=state.deployment_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowRun",
        denied_message="Deployment policy disallows run and terminal access.",
        share_session_id=share_session_id,
    )
    if not allowed:
        return False
    if state.deployment_mode and not state.terminals:
        await _notify_and_close(
            state.wmh_frontend_sender,
            websocket,
            message="Deployment run support is not enabled.",
            share_session_id=share_session_id,
        )
        return False
    return True


async def ensure_share_param_value_allowed(
    *,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    project_state: "ProjectStateSingleConfig",
    section_id: ID,
    param_info_id: ID,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        deployment_mode=True,
        policy=policy,
        frontend_sender=frontend_sender,
        policy_flag="allowParamChanges",
        denied_message="Deployment policy disallows parameter changes.",
        share_session_id=share_session_id,
    )
    impl = get_curr_effective_code_obj_impl(project_state, section_id, param_info_id)
    await ensure_share_code_param_allowed(
        frontend_sender=frontend_sender,
        is_code_param=isinstance(impl, CodeParamCodeObjImpl),
        share_session_id=share_session_id,
    )


async def ensure_share_llm_allowed(
    state: "SettaFastAPIState",
    *,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        deployment_mode=state.deployment_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowLLM",
        denied_message="Deployment policy disallows LLM access.",
        share_session_id=share_session_id,
    )
    if state.deployment_mode and state.agent_runner.disabled:
        await _notify_and_raise(
            state.wmh_frontend_sender,
            message="Deployment LLM support is not enabled.",
            share_session_id=share_session_id,
        )


async def ensure_share_listener_emit_updates_allowed(
    *,
    deployment_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        deployment_mode=deployment_mode,
        policy=policy,
        frontend_sender=frontend_sender,
        policy_flag="allowParamChanges",
        denied_message="Deployment policy disallows listener updates.",
        share_session_id=share_session_id,
    )
