import json
from ast import literal_eval

from pydantic import ValidationError

from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
)
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    set_chat_section_state,
    set_param_entered_value,
    set_text_block_text,
)
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    ChatSectionState,
    PluginSectionImpl,
    SectionType,
)


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
        state = _parse_chat_section_state(payload=literal.payload)
        set_chat_section_state(project_state, section_id, state)
        return None

    if impl.type is SectionType.Plugin:
        literal = _expect_literal_value(dependency_name=section_id, value=value)
        _apply_plugin_section_update(
            project_state=project_state,
            section_id=section_id,
            payload=literal.payload,
        )
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


def _parse_chat_section_state(payload: object) -> ChatSectionState:
    if isinstance(payload, str):
        try:
            return ChatSectionState.model_validate_json(payload)
        except ValidationError:
            return ChatSectionState.model_validate(literal_eval(payload))
    return ChatSectionState.model_validate(payload)


def _apply_plugin_section_update(
    *,
    project_state: ProjectStateSingleConfig,
    section_id: ID,
    payload: object,
) -> None:
    parsed_payload = _parse_plugin_payload(section_id=section_id, payload=payload)
    if not isinstance(parsed_payload, dict):
        raise ListenerDependencyUpdateError(
            f"listener emit expected object payload for plugin section {section_id}"
        )
    plugin_impl = get_curr_effective_section_impl_with_type_guard(
        project_state, section_id, PluginSectionImpl
    )
    next_args: dict[str, object] = {}

    control_keys = {"data", "kind", "schemaVersion", "merge"}
    has_control_payload = "data" in parsed_payload
    if has_control_payload:
        unknown_keys = sorted(set(parsed_payload.keys()) - control_keys)
        if len(unknown_keys) > 0:
            raise ListenerDependencyUpdateError(
                (
                    "listener emit plugin section payload contains unsupported keys: "
                    f"{', '.join(unknown_keys)}"
                )
            )
        merge_value = parsed_payload.get("merge", True)
        if not isinstance(merge_value, bool):
            raise ListenerDependencyUpdateError(
                "listener emit plugin section merge flag must be boolean"
            )
        raw_data = parsed_payload.get("data", {})
        if not isinstance(raw_data, dict):
            raise ListenerDependencyUpdateError(
                "listener emit plugin section data field must be an object"
            )
        next_data = dict(raw_data)
        if merge_value:
            current_data = plugin_impl.data
            if not isinstance(current_data, dict):
                current_data = {}
            next_data = {
                **dict(current_data),
                **next_data,
            }
        next_args["data"] = next_data
        if "kind" in parsed_payload:
            raw_kind = parsed_payload["kind"]
            if not isinstance(raw_kind, str):
                raise ListenerDependencyUpdateError(
                    "listener emit plugin section kind field must be a string"
                )
            next_args["kind"] = raw_kind
        if "schemaVersion" in parsed_payload:
            raw_schema_version = parsed_payload["schemaVersion"]
            if raw_schema_version is not None and not isinstance(
                raw_schema_version, int
            ):
                raise ListenerDependencyUpdateError(
                    "listener emit plugin section schemaVersion must be int or null"
                )
            next_args["schemaVersion"] = raw_schema_version
        set_curr_effective_section_impl_value(project_state, section_id, next_args)
        return None

    next_data = dict(parsed_payload)
    current_data = plugin_impl.data
    if not isinstance(current_data, dict):
        current_data = {}
    next_args["data"] = {
        **dict(current_data),
        **next_data,
    }
    set_curr_effective_section_impl_value(project_state, section_id, next_args)


def _parse_plugin_payload(*, section_id: ID, payload: object) -> object:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        payload_text = payload.strip()
        if payload_text == "":
            raise ListenerDependencyUpdateError(
                f"listener emit plugin section payload is empty for {section_id}"
            )
        try:
            return json.loads(payload_text)
        except json.JSONDecodeError as exc:
            raise ListenerDependencyUpdateError(
                (
                    "listener emit plugin section payload must be valid JSON "
                    f"for {section_id}"
                )
            ) from exc
    raise ListenerDependencyUpdateError(
        f"listener emit plugin section payload has unsupported type {type(payload).__name__}"
    )
