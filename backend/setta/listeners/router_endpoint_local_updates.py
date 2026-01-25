from dataclasses import dataclass

from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.section_impls import ChatSectionState


@dataclass(frozen=True, slots=True)
class LocalDependencyUpdate:
    dependency_key: BaseDependencyKeyUnion
    value: BaseDependencyValueUnion


def build_local_router_endpoint_updates(
    *,
    endpoint_name: str,
    payload: dict[str, object],
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
    literal_value = LiteralDependencyValue(payload=repr(state.model_dump(mode="json")))
    return [
        LocalDependencyUpdate(
            dependency_key=SectionDependencyKey(sectionId=section_id),
            value=literal_value,
        )
    ]
