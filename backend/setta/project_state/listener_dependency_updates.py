from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
)
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl2 import (
    set_chat_section_state,
    set_param_entered_value,
    set_text_block_text,
)
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionState, SectionType


class ListenerDependencyUpdateError(ValueError):
    """Raised when listener dependency updates cannot be applied to project state."""


def apply_listener_dependency_updates(
    *,
    project_state: ProjectStateSingleConfig,
    updates: list[ListenerFrontendEmitKeyAndValue],
) -> None:
    for entry in updates:
        _apply_single_update(
            project_state=project_state,
            entry=entry,
        )


def _apply_single_update(
    *,
    project_state: ProjectStateSingleConfig,
    entry: ListenerFrontendEmitKeyAndValue,
) -> None:
    dep_key = entry.dependencyKey
    if isinstance(dep_key, SectionParamDependencyKey):
        _apply_section_param_update(
            project_state=project_state,
            dep_key=dep_key,
            value=entry.value,
        )
        return None
    if isinstance(dep_key, SectionDependencyKey):
        return _apply_section_update(
            project_state=project_state,
            section_id=dep_key.sectionId,
            value=entry.value,
        )
    raise ListenerDependencyUpdateError(
        f"listener emit targeted unsupported dependency type {dep_key.type}"
    )


def _apply_section_param_update(
    *,
    project_state: ProjectStateSingleConfig,
    dep_key: SectionParamDependencyKey,
    value: BaseDependencyValueUnion,
) -> None:
    literal = _expect_literal_value(
        dependency_name=f"{dep_key.sectionId}:{dep_key.codeObjId}",
        value=value,
    )
    try:
        set_param_entered_value(
            project_state,
            dep_key.sectionId,
            dep_key.codeObjId,
            literal.payload,
        )
    except KeyError as exc:
        raise ListenerDependencyUpdateError(
            f"listener emit targeted unknown parameter "
            f"{dep_key.sectionId}:{dep_key.codeObjId}"
        ) from exc


def _apply_section_update(
    *,
    project_state: ProjectStateSingleConfig,
    section_id: ID,
    value: BaseDependencyValueUnion,
) -> None:
    try:
        impl = get_curr_effective_section_impl(project_state, section_id)
    except KeyError as exc:
        raise ListenerDependencyUpdateError(
            f"listener emit targeted missing section {section_id}"
        ) from exc

    if impl.type is SectionType.TextBlock:
        literal = _expect_literal_value(dependency_name=section_id, value=value)
        set_text_block_text(project_state, section_id, literal.payload)
        return None

    if impl.type is SectionType.Chat:
        literal = _expect_literal_value(dependency_name=section_id, value=value)
        payload = literal.payload
        if isinstance(payload, str):
            state = ChatSectionState.model_validate_json(payload)
        else:
            state = ChatSectionState.model_validate(payload)
        set_chat_section_state(project_state, section_id, state)
        return None

    if impl.type is SectionType.Image:
        raise NotImplementedError(
            "listener dependency updates for Image sections are not supported yet"
        )

    raise ListenerDependencyUpdateError(
        f"listener emit targeted unsupported section type {impl.type} "
        f"(section {section_id})"
    )


def _expect_literal_value(
    *, dependency_name: str, value: BaseDependencyValueUnion
) -> LiteralDependencyValue:
    if isinstance(value, LiteralDependencyValue):
        return value
    raise ListenerDependencyUpdateError(
        f"listener emit expected literal payload for {dependency_name}, "
        f"received {type(value).__name__}"
    )
