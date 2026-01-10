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
    from setta.server_state import SettaFastAPIState
    from setta.types.project_state import ProjectStateSingleConfig
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


def load_share_policy_from_dbe(dbe: DBE) -> SharePolicy:
    policy_path = dbe.path / "share_policy.json"
    if not policy_path.exists():
        return SharePolicy()
    payload = dbe.read_json(policy_path)
    if not payload:
        return SharePolicy()
    return SharePolicy.model_validate(payload)


def _policy_from_state(state: "SettaFastAPIState") -> SharePolicy:
    if state.share_mode:
        return state.share_runtime_state.share_policy
    return SharePolicy()


async def _notify_and_raise(
    frontend_sender: "WMHFrontendSender",
    *,
    message: str,
    project_config_id: ID | None,
    share_session_id: str | None,
) -> None:
    await frontend_sender.log_and_broadcast_backend_log_event(
        message,
        severity=SettaBackendLogEventSeverity.warning,
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


async def _notify_and_close(
    frontend_sender: "WMHFrontendSender",
    websocket: WebSocket,
    *,
    message: str,
    project_config_id: ID | None,
    share_session_id: str | None,
) -> None:
    await frontend_sender.log_and_broadcast_backend_log_event(
        message,
        severity=SettaBackendLogEventSeverity.warning,
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
    if websocket.application_state == WebSocketState.CONNECTING:
        await websocket.accept()
    await websocket.close(code=4403)


async def deny_in_share_mode(
    *,
    share_mode: bool,
    frontend_sender: "WMHFrontendSender",
    message: str,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> None:
    if not share_mode:
        return
    await _notify_and_raise(
        frontend_sender,
        message=message,
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )


async def ensure_share_code_param_allowed(
    *,
    frontend_sender: "WMHFrontendSender",
    project_config_id: ID | None,
    is_code_param: bool,
    share_session_id: str | None = None,
) -> None:
    if not is_code_param:
        return
    await _notify_and_raise(
        frontend_sender,
        message="Share mode disallows CodeParam edits.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )


async def enforce_share_policy(
    *,
    share_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    policy_flag: str,
    denied_message: str,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> None:
    if not share_mode:
        return
    if not getattr(policy, policy_flag):
        await _notify_and_raise(
            frontend_sender,
            message=denied_message,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )


async def enforce_share_policy_ws(
    websocket: WebSocket,
    *,
    share_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    policy_flag: str,
    denied_message: str,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> bool:
    if not share_mode:
        return True
    if not getattr(policy, policy_flag):
        await _notify_and_close(
            frontend_sender,
            websocket,
            message=denied_message,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )
        return False
    return True


async def ensure_share_run_allowed(
    state: "SettaFastAPIState",
    *,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=state.share_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowRun",
        denied_message="Share policy disallows run and terminal access.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
    if state.share_mode and not state.terminals:
        await _notify_and_raise(
            state.wmh_frontend_sender,
            message="Share run support is not enabled.",
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )


async def ensure_share_run_allowed_ws(
    state: "SettaFastAPIState",
    websocket: WebSocket,
    *,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> bool:
    allowed = await enforce_share_policy_ws(
        websocket,
        share_mode=state.share_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowRun",
        denied_message="Share policy disallows run and terminal access.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
    if not allowed:
        return False
    if state.share_mode and not state.terminals:
        await _notify_and_close(
            state.wmh_frontend_sender,
            websocket,
            message="Share run support is not enabled.",
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )
        return False
    return True


async def ensure_share_param_value_allowed(
    *,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    project_config_id: ID | None,
    project_state: "ProjectStateSingleConfig",
    section_id: ID,
    param_info_id: ID,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=True,
        policy=policy,
        frontend_sender=frontend_sender,
        policy_flag="allowParamChanges",
        denied_message="Share policy disallows parameter changes.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
    impl = get_curr_effective_code_obj_impl(project_state, section_id, param_info_id)
    await ensure_share_code_param_allowed(
        frontend_sender=frontend_sender,
        project_config_id=project_config_id,
        is_code_param=isinstance(impl, CodeParamCodeObjImpl),
        share_session_id=share_session_id,
    )


async def ensure_share_llm_allowed(
    state: "SettaFastAPIState",
    *,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=state.share_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowLLM",
        denied_message="Share policy disallows LLM access.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
    if state.share_mode and not state.chat_manager:
        await _notify_and_raise(
            state.wmh_frontend_sender,
            message="Share LLM support is not enabled.",
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )


async def ensure_share_listener_emit_updates_allowed(
    *,
    share_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=share_mode,
        policy=policy,
        frontend_sender=frontend_sender,
        policy_flag="allowParamChanges",
        denied_message="Share policy disallows listener updates.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
