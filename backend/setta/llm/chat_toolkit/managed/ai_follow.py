import json
from typing import Any

from mcp.types import CallToolResult, TextContent

from setta.database.db_objs import DBE
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    AIFollowToolResultMetadata,
    FollowIdType,
    SettaToolAnnotations,
)
from setta.mcp.utils import convert_temporary_ids_to_canonical
from setta.types.chat_messages import AssistantChatMessage, ToolCall
from setta.types.id import ID

from .tool_argument_preview import (
    PartialJsonStringToken,
    extract_stream_ids_by_type_from_tokens,
    scan_partial_json_strings,
)
from .tool_calls import ManagedToolCallState
from .utils import is_setta_tool_name


def build_streaming_follow_ids(
    *,
    assistant_message: AssistantChatMessage,
    tool_call_state: ManagedToolCallState,
    tokens_by_index: dict[int, list[PartialJsonStringToken]] | None,
    dbe: DBE,
    annotations_by_name: dict[str, SettaToolAnnotations],
) -> dict[FollowIdType, list[ID]] | None:
    ids_by_type = extract_stream_ids_by_type_from_buffers(
        assistant_message=assistant_message,
        tool_call_state=tool_call_state,
        tokens_by_index=tokens_by_index,
        annotations_by_name=annotations_by_name,
    )
    return canonicalize_ai_follow_ids_by_type(
        dbe,
        ids_by_type,
        filter_to_known=True,
    )


def build_tool_call_follow_ids(
    *,
    tool_calls: list[ToolCall],
    dbe: DBE,
    annotations_by_name: dict[str, SettaToolAnnotations],
) -> dict[FollowIdType, list[ID]] | None:
    ids_by_type = collect_ai_follow_ids_by_type_from_tool_calls(
        tool_calls,
        annotations_by_name,
    )
    return canonicalize_ai_follow_ids_by_type(
        dbe,
        ids_by_type,
        filter_to_known=False,
    )


def build_tool_result_follow_ids(
    *,
    tool_name: str,
    call_result: CallToolResult,
    dbe: DBE,
    annotations_by_name: dict[str, SettaToolAnnotations],
) -> dict[FollowIdType, list[ID]] | None:
    if call_result.isError:
        return None
    if not is_setta_tool_name(tool_name):
        return None
    annotations = annotations_by_name.get(tool_name)
    if not annotations or not annotations.aiFollowToolResult:
        return None
    metadata = annotations.aiFollowToolResult
    if not call_result.content:
        return None
    text_entry = call_result.content[0]
    if not isinstance(text_entry, TextContent):
        raise TypeError("Expected text content in tool result")
    text = (text_entry.text or "").strip()
    if all(path == "$" for paths in metadata.pathsByIdType.values() for path in paths):
        payload: Any = text
    else:
        payload = json.loads(text)
    ids_by_type = extract_ai_follow_tool_result_ids(payload, metadata)
    return canonicalize_ai_follow_ids_by_type(
        dbe,
        ids_by_type,
        filter_to_known=False,
    )


def extract_stream_ids_by_type_from_buffers(
    *,
    assistant_message: AssistantChatMessage,
    tool_call_state: ManagedToolCallState,
    tokens_by_index: dict[int, list[PartialJsonStringToken]] | None,
    annotations_by_name: dict[str, SettaToolAnnotations],
) -> dict[FollowIdType, list[ID]]:
    combined: dict[FollowIdType, set[ID]] = {}
    tool_calls = assistant_message.tool_calls or []
    for index, buffer in tool_call_state.argument_buffers.items():
        if not buffer:
            continue
        tool_name = (
            tool_calls[index].function.name.strip() if index < len(tool_calls) else ""
        )
        if not tool_name:
            continue
        if not is_setta_tool_name(tool_name):
            continue
        annotations = annotations_by_name.get(tool_name)
        if not annotations or not annotations.aiFollowToolArguments:
            continue
        metadata = annotations.aiFollowToolArguments
        tokens = tokens_by_index.get(index) if tokens_by_index else None
        if tokens is None:
            buffer_ids_by_type = extract_stream_ids_by_type_from_buffer(
                buffer,
                metadata.pathsByIdType,
            )
        else:
            buffer_ids_by_type = extract_stream_ids_by_type_from_tokens(
                tokens,
                metadata.pathsByIdType,
            )
        for id_type, ids in buffer_ids_by_type.items():
            combined.setdefault(id_type, set()).update(ids)
    return {id_type: list(ids) for id_type, ids in combined.items() if ids}


def extract_stream_ids_by_type_from_buffer(
    buffer: str,
    paths_by_id_type: dict[FollowIdType, list[str]],
) -> dict[FollowIdType, set[ID]]:
    tokens = scan_partial_json_strings(buffer)
    return extract_stream_ids_by_type_from_tokens(tokens, paths_by_id_type)


def extract_ai_follow_tool_result_ids(
    payload: Any,
    metadata: AIFollowToolResultMetadata,
) -> dict[FollowIdType, list[ID]]:
    ids_by_type, _ = collect_ai_follow_ids_from_paths(
        payload,
        metadata.pathsByIdType,
        allow_dict_keys=False,
    )
    return {id_type: list(ids) for id_type, ids in ids_by_type.items()}


def extract_ai_follow_tool_argument_ids(
    arguments: dict[str, Any],
    metadata: AIFollowToolArgumentsMetadata,
) -> dict[FollowIdType, list[ID]] | None:
    ids_by_type, found_types = collect_ai_follow_ids_from_paths(
        arguments,
        metadata.pathsByIdType,
        allow_dict_keys=True,
    )
    if not found_types:
        return None
    return {id_type: list(ids_by_type.get(id_type, set())) for id_type in found_types}


def collect_ai_follow_ids_by_type_from_tool_calls(
    tool_calls: list[ToolCall],
    annotations_by_name: dict[str, SettaToolAnnotations],
) -> dict[FollowIdType, list[ID]] | None:
    if not tool_calls:
        return None
    combined: dict[FollowIdType, set[ID]] = {}
    found_any = False
    for tool_call in tool_calls:
        tool_name = tool_call.function.name.strip()
        if not tool_name:
            continue
        arguments = tool_call.function.arguments or {}
        ids_by_type = extract_ai_follow_ids_by_type_for_tool(
            tool_name,
            arguments,
            annotations_by_name,
        )
        if ids_by_type is None:
            continue
        found_any = True
        for id_type, ids in ids_by_type.items():
            combined.setdefault(id_type, set()).update(ids)
    if not found_any:
        return None
    return {id_type: list(ids) for id_type, ids in combined.items()}


def extract_ai_follow_ids_by_type_for_tool(
    tool_name: str,
    arguments: dict[str, Any],
    annotations_by_name: dict[str, SettaToolAnnotations],
) -> dict[FollowIdType, list[ID]] | None:
    if not is_setta_tool_name(tool_name):
        return None
    annotations = annotations_by_name.get(tool_name)
    if not annotations or not annotations.aiFollowToolArguments:
        return None
    return extract_ai_follow_tool_argument_ids(
        arguments,
        annotations.aiFollowToolArguments,
    )


def collect_ai_follow_ids_from_paths(
    payload: Any,
    paths_by_id_type: dict[FollowIdType, list[str]],
    *,
    allow_dict_keys: bool,
) -> tuple[dict[FollowIdType, set[ID]], set[FollowIdType]]:
    ids_by_type: dict[FollowIdType, set[ID]] = {}
    found_types: set[FollowIdType] = set()
    for id_type, paths in paths_by_id_type.items():
        for path in paths:
            values = select_values_by_path(payload, path)
            for value in values:
                ids = coerce_id_list(value)
                if ids is None and allow_dict_keys and isinstance(value, dict):
                    dict_keys = [key for key in value.keys() if isinstance(key, str)]
                    ids = coerce_id_list(dict_keys)
                if ids is None:
                    continue
                found_types.add(id_type)
                if ids:
                    ids_by_type.setdefault(id_type, set()).update(ids)
    return ids_by_type, found_types


def select_values_by_path(payload: Any, path: str) -> list[Any]:
    if path == "$":
        return [payload]
    segments = [segment for segment in path.split(".") if segment]
    current: list[Any] = [payload]
    for segment in segments:
        next_values: list[Any] = []
        for item in current:
            if not isinstance(item, dict):
                continue
            if segment not in item:
                continue
            next_values.append(item[segment])
        current = next_values
        if not current:
            break
    return current


def canonicalize_ai_follow_ids_by_type(
    dbe: DBE,
    ids_by_type: dict[FollowIdType, list[ID]] | None,
    *,
    filter_to_known: bool,
) -> dict[FollowIdType, list[ID]] | None:
    if not ids_by_type:
        return None
    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    if not filter_to_known:
        return convert_temporary_ids_to_canonical(
            ids_by_type,
            temporary_to_canonical,
        )
    filtered: dict[FollowIdType, list[ID]] = {}
    for id_type, ids in ids_by_type.items():
        resolved = [entry for entry in ids if entry in temporary_to_canonical]
        if resolved:
            filtered[id_type] = resolved
    if not filtered:
        return None
    return convert_temporary_ids_to_canonical(
        filtered,
        temporary_to_canonical,
    )


def normalize_ids_by_type(
    ids_by_type: dict[FollowIdType, list[ID]],
) -> dict[FollowIdType, list[ID]]:
    normalized: dict[FollowIdType, list[ID]] = {}
    for id_type, ids in ids_by_type.items():
        if not ids:
            continue
        normalized[id_type] = list(dict.fromkeys(ids))
    return normalized


def ids_by_type_to_sets(
    ids_by_type: dict[FollowIdType, list[ID]],
) -> dict[FollowIdType, set[ID]]:
    return {id_type: set(ids) for id_type, ids in ids_by_type.items() if ids}


def coerce_id_list(raw_value: Any) -> list[ID] | None:
    if isinstance(raw_value, list):
        return [ID(value) for value in raw_value if isinstance(value, str) and value]
    if isinstance(raw_value, str):
        return [ID(raw_value)] if raw_value else []
    return None
