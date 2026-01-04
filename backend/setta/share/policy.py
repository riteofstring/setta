from typing import TYPE_CHECKING

from fastapi import HTTPException, WebSocket, status
from starlette.websockets import WebSocketState

from setta.database.db_objs import DBE
from setta.types.helpers_lvl1 import get_variant_effective_section_impl
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.section_impls import (
    ChartSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
)
from setta.types.share_deployment import SharePolicy
from setta.utils.utils import normalize_path

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState
    from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
    from setta.types.listener import ListenerFrontendEmitKeyAndValue
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
        return state.share_project_manager.share_policy
    return SharePolicy()


def _disallowed_sections(section_ids: list[ID], allowed_sections: list[ID]) -> list[ID]:
    disallowed: list[ID] = []
    for section_id in section_ids:
        if section_id not in allowed_sections:
            disallowed.append(section_id)
    return disallowed


def _register_artifact_path(
    mapping: dict[str, set[ID]],
    path_str: str,
    section_id: ID,
) -> None:
    if not path_str:
        return
    normalized = str(normalize_path(path_str))
    if normalized not in mapping:
        mapping[normalized] = set()
    mapping[normalized].add(section_id)


def resolve_section_ids_for_artifacts(
    project_state: "ProjectStateSingleConfig",
    artifacts: list["BaseArtifactUnionWithDiscriminator"],
) -> tuple[list[ID], list[str]]:
    if not artifacts:
        return [], []
    path_to_sections: dict[str, set[ID]] = {}
    for section_id, section in project_state.sections.items():
        for variant_id in section.variants:
            impl = get_variant_effective_section_impl(
                project_state, section_id, variant_id
            )
            if isinstance(impl, ImageSectionImpl):
                _register_artifact_path(path_to_sections, impl.imagePath, section_id)
                continue
            if isinstance(impl, ChartSectionImpl):
                _register_artifact_path(path_to_sections, impl.dataPath, section_id)
                continue
            if isinstance(impl, DrawSectionImpl):
                for layer in impl.layers:
                    for element in layer.elements:
                        _register_artifact_path(
                            path_to_sections, element.dataPath, section_id
                        )
                        _register_artifact_path(
                            path_to_sections, element.transformId, section_id
                        )
    resolved_ids: set[ID] = set()
    unknown_paths: list[str] = []
    for artifact in artifacts:
        normalized = str(normalize_path(artifact.id))
        section_ids = path_to_sections.get(normalized)
        if section_ids:
            resolved_ids.update(section_ids)
        else:
            unknown_paths.append(normalized)
    return list(resolved_ids), unknown_paths


async def _notify_and_raise(
    frontend_sender: "WMHFrontendSender",
    *,
    message: str,
    project_config_id: ID | None,
    share_mode: bool,
    share_session_id: str | None,
) -> None:
    if share_mode and share_session_id is None:
        await frontend_sender.log_and_broadcast_backend_log_event_to_all_frontends(
            message,
            severity=SettaBackendLogEventSeverity.warning,
            project_config_id=project_config_id,
        )
    else:
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
    share_mode: bool,
    share_session_id: str | None,
) -> None:
    if share_mode and share_session_id is None:
        await frontend_sender.log_and_broadcast_backend_log_event_to_all_frontends(
            message,
            severity=SettaBackendLogEventSeverity.warning,
            project_config_id=project_config_id,
        )
    else:
        await frontend_sender.log_and_broadcast_backend_log_event(
            message,
            severity=SettaBackendLogEventSeverity.warning,
            project_config_id=project_config_id,
            share_session_id=share_session_id,
        )
    if websocket.application_state == WebSocketState.CONNECTING:
        await websocket.accept()
    await websocket.close(code=4403)


async def enforce_share_policy(
    *,
    share_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    policy_flag: str,
    denied_message: str,
    project_config_id: ID | None,
    share_session_id: str | None = None,
    section_ids: list[ID] | None = None,
) -> None:
    if not share_mode:
        return
    if not getattr(policy, policy_flag):
        await _notify_and_raise(
            frontend_sender,
            message=denied_message,
            project_config_id=project_config_id,
            share_mode=share_mode,
            share_session_id=share_session_id,
        )
    if section_ids and policy.allowedSections is not None:
        disallowed = _disallowed_sections(section_ids, policy.allowedSections)
        if disallowed:
            message = "Share policy disallows changes to sections: " + ", ".join(
                str(section_id) for section_id in disallowed
            )
            await _notify_and_raise(
                frontend_sender,
                message=message,
                project_config_id=project_config_id,
                share_mode=share_mode,
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
    section_ids: list[ID] | None = None,
) -> bool:
    if not share_mode:
        return True
    if not getattr(policy, policy_flag):
        await _notify_and_close(
            frontend_sender,
            websocket,
            message=denied_message,
            project_config_id=project_config_id,
            share_mode=share_mode,
            share_session_id=share_session_id,
        )
        return False
    if section_ids and policy.allowedSections is not None:
        disallowed = _disallowed_sections(section_ids, policy.allowedSections)
        if disallowed:
            message = "Share policy disallows changes to sections: " + ", ".join(
                str(section_id) for section_id in disallowed
            )
            await _notify_and_close(
                frontend_sender,
                websocket,
                message=message,
                project_config_id=project_config_id,
                share_mode=share_mode,
                share_session_id=share_session_id,
            )
            return False
    return True


async def ensure_share_run_allowed(
    state: "SettaFastAPIState",
    *,
    project_config_id: ID | None,
    share_session_id: str | None = None,
    section_ids: list[ID] | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=state.share_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowRun",
        denied_message="Share policy disallows run and terminal access.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
        section_ids=section_ids,
    )
    if state.share_mode and not state.terminals:
        await _notify_and_raise(
            state.wmh_frontend_sender,
            message="Share run support is not enabled.",
            project_config_id=project_config_id,
            share_mode=state.share_mode,
            share_session_id=share_session_id,
        )


async def ensure_share_run_allowed_ws(
    state: "SettaFastAPIState",
    websocket: WebSocket,
    *,
    project_config_id: ID | None,
    share_session_id: str | None = None,
    section_ids: list[ID] | None = None,
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
        section_ids=section_ids,
    )
    if not allowed:
        return False
    if state.share_mode and not state.terminals:
        await _notify_and_close(
            state.wmh_frontend_sender,
            websocket,
            message="Share run support is not enabled.",
            project_config_id=project_config_id,
            share_mode=state.share_mode,
            share_session_id=share_session_id,
        )
        return False
    return True


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
            share_mode=state.share_mode,
            share_session_id=share_session_id,
        )


async def ensure_share_mcp_allowed(
    state: "SettaFastAPIState",
    *,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=state.share_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowMCP",
        denied_message="Share policy disallows MCP access.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )


async def ensure_share_listener_emits_allowed(
    *,
    share_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    project_config_id: ID | None,
    share_session_id: str | None = None,
    section_ids: list[ID] | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=share_mode,
        policy=policy,
        frontend_sender=frontend_sender,
        policy_flag="allowParamChanges",
        denied_message="Share policy disallows listener updates.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
        section_ids=section_ids,
    )


async def ensure_share_listener_emit_updates_allowed(
    *,
    share_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    project_config_id: ID | None,
    project_state: "ProjectStateSingleConfig",
    dependency_updates: list["ListenerFrontendEmitKeyAndValue"],
    artifact_updates: list["BaseArtifactUnionWithDiscriminator"],
    share_session_id: str | None = None,
) -> None:
    if not share_mode:
        return
    dependency_section_ids = [
        update.dependencyKey.sectionId for update in dependency_updates
    ]
    artifact_section_ids: list[ID] = []
    unknown_paths: list[str] = []
    if artifact_updates:
        artifact_section_ids, unknown_paths = resolve_section_ids_for_artifacts(
            project_state, artifact_updates
        )
    await ensure_share_artifact_paths_scoped(
        share_mode=share_mode,
        policy=policy,
        frontend_sender=frontend_sender,
        project_config_id=project_config_id,
        share_session_id=share_session_id,
        unknown_paths=unknown_paths,
    )
    combined_section_ids = dependency_section_ids + artifact_section_ids
    await ensure_share_listener_emits_allowed(
        share_mode=share_mode,
        policy=policy,
        frontend_sender=frontend_sender,
        project_config_id=project_config_id,
        share_session_id=share_session_id,
        section_ids=combined_section_ids if combined_section_ids else None,
    )


async def ensure_share_lsp_allowed(
    state: "SettaFastAPIState",
    *,
    project_config_id: ID | None,
    share_session_id: str | None = None,
) -> None:
    await enforce_share_policy(
        share_mode=state.share_mode,
        policy=_policy_from_state(state),
        frontend_sender=state.wmh_frontend_sender,
        policy_flag="allowLSP",
        denied_message="Share policy disallows language server features.",
        project_config_id=project_config_id,
        share_session_id=share_session_id,
    )
    if state.share_mode and not state.lsp_writers:
        await _notify_and_raise(
            state.wmh_frontend_sender,
            message="Share LSP support is not enabled.",
            project_config_id=project_config_id,
            share_mode=state.share_mode,
            share_session_id=share_session_id,
        )


async def ensure_share_artifact_paths_scoped(
    *,
    share_mode: bool,
    policy: SharePolicy,
    frontend_sender: "WMHFrontendSender",
    project_config_id: ID | None,
    share_session_id: str | None = None,
    unknown_paths: list[str] | None = None,
) -> None:
    if not share_mode:
        return
    if policy.allowedSections is None:
        return
    if not unknown_paths:
        return
    message = "Share policy disallows changes to unscoped artifacts: " + ", ".join(
        unknown_paths
    )
    await _notify_and_raise(
        frontend_sender,
        message=message,
        project_config_id=project_config_id,
        share_mode=share_mode,
        share_session_id=share_session_id,
    )
