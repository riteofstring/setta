import logging
from dataclasses import dataclass

from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import FileReadDependencyValue, LiteralDependencyValue
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.project_config import SectionRepresentationMode
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionImpl, ChatSectionState
from setta.utils.constants import C

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class LocalDependencyUpdate:
    dependency_key: BaseDependencyKeyUnion
    value: BaseDependencyValueUnion


def build_local_router_endpoint_updates(
    *,
    endpoint_name: str,
    payload: dict[str, object],
    dependency_graph: DependencyGraph,
    project_state: ProjectStateSingleConfig,
) -> list[LocalDependencyUpdate]:
    if endpoint_name != "route_set_chat_section_state":
        return []
    if "sectionId" not in payload:
        raise KeyError("set_chat_section_state payload missing sectionId")
    if "state" not in payload:
        raise KeyError("set_chat_section_state payload missing state")
    section_id = payload["sectionId"]
    state_payload = payload["state"]
    state = ChatSectionState.model_validate(state_payload)
    dependency_value = _build_chat_dependency_value(
        section_id=section_id,
        state=state,
        dependency_graph=dependency_graph,
        project_state=project_state,
    )
    if dependency_value is None:
        return []
    return [
        LocalDependencyUpdate(
            dependency_key=SectionDependencyKey(sectionId=section_id),
            value=dependency_value,
        )
    ]


def _build_chat_dependency_value(
    *,
    section_id: object,
    state: ChatSectionState,
    dependency_graph: DependencyGraph,
    project_state: ProjectStateSingleConfig,
) -> BaseDependencyValueUnion | None:
    dep_key = SectionDependencyKey(sectionId=section_id)
    node = dependency_graph.graph.get(dep_key)
    if node is None:
        logger.warning(
            "Skipping local chat dependency update; missing graph entry for %s",
            dep_key,
        )
        return None
    if not isinstance(node, SectionNode):
        logger.warning(
            "Skipping local chat dependency update; expected SectionNode for %s",
            dep_key,
        )
        return None
    representation = node.representation
    if representation is SectionRepresentationMode.expression:
        return LiteralDependencyValue(payload=repr(state.model_dump(mode="json")))
    chat_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        section_id,
        ChatSectionImpl,
    )
    if chat_impl.chatId is None:
        return LiteralDependencyValue(payload=repr(state.model_dump(mode="json")))
    chat_path = C.SETTA_FILES_FOLDER / "chats" / f"{chat_impl.chatId}.json"
    if representation is SectionRepresentationMode.file_read:
        return FileReadDependencyValue(str(chat_path))
    if representation is SectionRepresentationMode.file_path:
        return LiteralDependencyValue(str(chat_path))
    raise ValueError(
        f"Unsupported representation {representation.value} for Chat section {section_id}"
    )
