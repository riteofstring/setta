from dataclasses import dataclass

from setta.agentic.engine_resolver import resolve_engine_config
from setta.agentic.store import require_agent_profile, require_engine_config
from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile, EngineType
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionImpl


@dataclass(frozen=True, slots=True)
class ExecutableLinkedChatTarget:
    section_impl: ChatSectionImpl
    selected_profile: AgentProfile | None
    effective_engine_config_id: ID


class LinkedChatTargetResolutionError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def resolve_executable_linked_chat_target(
    project_state: ProjectStateSingleConfig,
    target_section_id: ID,
    *,
    dbe: DBE,
    llm_configs: AllLLMConfigs,
) -> ExecutableLinkedChatTarget:
    try:
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            target_section_id,
            ChatSectionImpl,
        )
    except ValueError as exc:
        raise LinkedChatTargetResolutionError("unsupported_target_type") from exc

    if not section_impl.managed:
        raise LinkedChatTargetResolutionError("unsupported_scriptable_target")

    selected_profile: AgentProfile | None = None
    if section_impl.agentProfileId is not None:
        try:
            selected_profile = require_agent_profile(dbe, section_impl.agentProfileId)
        except KeyError as exc:
            raise LinkedChatTargetResolutionError("missing_agent_profile") from exc

    effective_engine_config_id = section_impl.engineConfigId or (
        selected_profile.engineConfigId if selected_profile is not None else None
    )
    if effective_engine_config_id is None:
        raise LinkedChatTargetResolutionError("missing_engine_config")

    try:
        engine_config = require_engine_config(dbe, effective_engine_config_id)
    except KeyError as exc:
        raise LinkedChatTargetResolutionError("invalid_engine_config") from exc

    if (
        engine_config.engineType == EngineType.external_agent
        and engine_config.externalAgentConfigId is None
    ):
        raise LinkedChatTargetResolutionError("missing_external_config")

    try:
        resolve_engine_config(
            dbe,
            llm_configs,
            effective_engine_config_id,
        )
    except KeyError as exc:
        reason = (
            "missing_external_config"
            if engine_config.engineType == EngineType.external_agent
            else "invalid_engine_config"
        )
        raise LinkedChatTargetResolutionError(reason) from exc
    except ValueError as exc:
        raise LinkedChatTargetResolutionError("invalid_engine_config") from exc

    return ExecutableLinkedChatTarget(
        section_impl=section_impl,
        selected_profile=selected_profile,
        effective_engine_config_id=effective_engine_config_id,
    )


def is_executable_linked_chat_target(
    project_state: ProjectStateSingleConfig,
    target_section_id: ID,
    *,
    dbe: DBE,
    llm_configs: AllLLMConfigs,
) -> bool:
    try:
        resolve_executable_linked_chat_target(
            project_state,
            target_section_id,
            dbe=dbe,
            llm_configs=llm_configs,
        )
    except LinkedChatTargetResolutionError:
        return False
    return True
