import string
from dataclasses import dataclass, field
from typing import Literal, TypeVar

from setta.database.db_objs import DBE
from setta.mcp.tool_metadata import (
    ToolArgumentPreviewIdType,
    ToolArgumentPreviewMetadata,
)
from setta.mcp.utils import convert_temporary_ids_to_canonical
from setta.types.chat_messages import AssistantChatMessage
from setta.types.chat_stream_events import ToolArgumentPreviewDeltaEvent
from setta.types.id import ID

from .tool_calls import ManagedToolCallState
from .utils import is_setta_tool_name

_ToolIdType = TypeVar("_ToolIdType", bound=str)


@dataclass
class ManagedToolArgumentPreviewState:
    preview_values_by_index: dict[int, str] = field(default_factory=dict)
    preview_target_ids_by_index: dict[
        int, dict[ToolArgumentPreviewIdType, list[ID]]
    ] = field(default_factory=dict)


@dataclass
class _JsonContainerState:
    kind: Literal["object", "array"]
    value_owner_key: str | None
    object_key_owner: str | None = None
    expecting_key: bool = False
    expecting_value: bool = False
    pending_key: str | None = None


@dataclass
class PartialJsonStringToken:
    value: str
    kind: Literal["key", "value"]
    owner_key: str | None
    is_complete: bool


def build_preview_event(
    *,
    assistant_message: AssistantChatMessage,
    tool_call_state: ManagedToolCallState,
    preview_state: ManagedToolArgumentPreviewState,
    tool_call_index: int,
    arguments_delta: str,
    tokens: list[PartialJsonStringToken] | None,
    dbe: DBE,
    tool_argument_metadata_by_name: dict[str, ToolArgumentPreviewMetadata],
) -> ToolArgumentPreviewDeltaEvent | None:
    buffer = tool_call_state.argument_buffers.get(tool_call_index)
    if not buffer:
        return None
    tool_calls = assistant_message.tool_calls or []
    if tool_call_index >= len(tool_calls):
        return None
    tool_call = tool_calls[tool_call_index]
    tool_name = tool_call.function.name.strip()
    if not tool_name:
        return None
    if not is_setta_tool_name(tool_name):
        return None
    metadata = tool_argument_metadata_by_name.get(tool_name)
    if not metadata:
        return None
    if tokens is None:
        tokens = scan_partial_json_strings(buffer)
    preview_value = extract_preview_value_from_tokens(
        tokens,
        metadata.previewValuePath,
    )
    if preview_value is None:
        return None
    target_ids_by_type = extract_preview_target_ids_from_tokens(tokens, metadata)
    canonical_target_ids_by_type = canonicalize_preview_ids_by_type(
        dbe,
        target_ids_by_type,
        metadata.targetIdPathsByType,
    )
    if canonical_target_ids_by_type is None:
        return None
    last_value = preview_state.preview_values_by_index.get(tool_call_index, "")
    preview_value = coalesce_preview_value(last_value, preview_value)
    if last_value and not preview_value.startswith(last_value):
        return None
    preview_delta = preview_value[len(last_value) :]
    last_ids = preview_state.preview_target_ids_by_index.get(tool_call_index)
    ids_match = last_ids is not None and preview_ids_by_type_to_sets(
        last_ids
    ) == preview_ids_by_type_to_sets(canonical_target_ids_by_type)
    if not preview_delta and ids_match:
        return None
    preview_state.preview_values_by_index[tool_call_index] = preview_value
    preview_state.preview_target_ids_by_index[tool_call_index] = (
        canonical_target_ids_by_type
    )
    return ToolArgumentPreviewDeltaEvent(
        message_id=assistant_message.id,
        tool_call_id=tool_call.id,
        tool_name=tool_name,
        arguments_delta=arguments_delta,
        preview_kind=metadata.previewKind,
        target_ids_by_type=canonical_target_ids_by_type,
        preview_value_delta=preview_delta,
    )


def extract_stream_ids_by_type_from_tokens(
    tokens: list[PartialJsonStringToken],
    paths_by_id_type: dict[_ToolIdType, list[str]],
) -> dict[_ToolIdType, set[ID]]:
    keys_by_type: dict[_ToolIdType, set[str]] = {}
    for id_type, paths in paths_by_id_type.items():
        for path in paths:
            if path == "$":
                continue
            segments = [segment for segment in path.split(".") if segment]
            if not segments:
                continue
            keys_by_type.setdefault(id_type, set()).add(segments[-1])
    if not keys_by_type:
        return {}
    key_to_types: dict[str, set[_ToolIdType]] = {}
    for id_type, keys in keys_by_type.items():
        for key in keys:
            key_to_types.setdefault(key, set()).add(id_type)
    combined: dict[_ToolIdType, set[ID]] = {}
    for token in tokens:
        if not token.is_complete:
            continue
        if not token.value:
            continue
        owner_key = token.owner_key
        if not owner_key:
            continue
        types_for_key = key_to_types.get(owner_key)
        if not types_for_key:
            continue
        for id_type in types_for_key:
            combined.setdefault(id_type, set()).add(ID(token.value))
    return combined


def extract_preview_target_ids_from_tokens(
    tokens: list[PartialJsonStringToken],
    metadata: ToolArgumentPreviewMetadata,
) -> dict[ToolArgumentPreviewIdType, list[ID]]:
    combined = extract_stream_ids_by_type_from_tokens(
        tokens,
        metadata.targetIdPathsByType,
    )
    return {id_type: list(ids) for id_type, ids in combined.items() if ids}


def extract_preview_value_from_tokens(
    tokens: list[PartialJsonStringToken],
    preview_value_path: str,
) -> str | None:
    key = preview_value_key(preview_value_path)
    if not key:
        return None
    last_value: str | None = None
    for token in tokens:
        if token.kind != "value":
            continue
        if token.owner_key != key:
            continue
        last_value = token.value
    return last_value


def preview_value_key(preview_value_path: str) -> str | None:
    if preview_value_path == "$":
        return None
    segments = [segment for segment in preview_value_path.split(".") if segment]
    if not segments:
        return None
    return segments[-1]


def preview_ids_by_type_to_sets(
    ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]],
) -> dict[ToolArgumentPreviewIdType, set[ID]]:
    return {id_type: set(ids) for id_type, ids in ids_by_type.items() if ids}


def canonicalize_preview_ids_by_type(
    dbe: DBE,
    ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]],
    required_paths_by_type: dict[ToolArgumentPreviewIdType, list[str]],
) -> dict[ToolArgumentPreviewIdType, list[ID]] | None:
    if not ids_by_type:
        return None
    temporary_to_canonical, _ = dbe.read_temporary_id_map()
    filtered: dict[ToolArgumentPreviewIdType, list[ID]] = {}
    for id_type, ids in ids_by_type.items():
        if not ids:
            continue
        resolved = [entry for entry in ids if entry in temporary_to_canonical]
        if resolved:
            filtered[id_type] = resolved
    if not filtered:
        return None
    for id_type in required_paths_by_type.keys():
        if id_type not in filtered or not filtered[id_type]:
            return None
    return convert_temporary_ids_to_canonical(filtered, temporary_to_canonical)


def coalesce_preview_value(last_value: str | None, next_value: str) -> str:
    if last_value is None:
        return next_value
    if len(next_value) < len(last_value) and last_value.startswith(next_value):
        return last_value
    return next_value


def scan_partial_json_strings(buffer: str) -> list[PartialJsonStringToken]:
    tokens: list[PartialJsonStringToken] = []
    containers: list[_JsonContainerState] = []
    i = 0
    while i < len(buffer):
        char = buffer[i]
        if char == '"':
            value, next_index, is_complete = parse_partial_json_string_with_end(
                buffer, i + 1
            )
            container = containers[-1] if containers else None
            if container and container.kind == "object":
                if container.expecting_key:
                    tokens.append(
                        PartialJsonStringToken(
                            value=value,
                            kind="key",
                            owner_key=container.object_key_owner,
                            is_complete=is_complete,
                        )
                    )
                    if is_complete:
                        container.pending_key = value
                        container.expecting_key = False
                elif container.expecting_value:
                    tokens.append(
                        PartialJsonStringToken(
                            value=value,
                            kind="value",
                            owner_key=container.pending_key,
                            is_complete=is_complete,
                        )
                    )
                    if is_complete:
                        container.pending_key = None
                        container.expecting_value = False
                else:
                    tokens.append(
                        PartialJsonStringToken(
                            value=value,
                            kind="value",
                            owner_key=None,
                            is_complete=is_complete,
                        )
                    )
            elif container and container.kind == "array":
                tokens.append(
                    PartialJsonStringToken(
                        value=value,
                        kind="value",
                        owner_key=container.value_owner_key,
                        is_complete=is_complete,
                    )
                )
            else:
                tokens.append(
                    PartialJsonStringToken(
                        value=value,
                        kind="value",
                        owner_key=None,
                        is_complete=is_complete,
                    )
                )
            i = next_index
            if not is_complete:
                break
            continue
        if char == "{":
            value_owner_key = None
            object_key_owner = None
            if containers:
                parent = containers[-1]
                if (
                    parent.kind == "object"
                    and parent.expecting_value
                    and parent.pending_key is not None
                ):
                    value_owner_key = parent.pending_key
                    object_key_owner = parent.pending_key
                    parent.expecting_value = False
                    parent.pending_key = None
                elif parent.kind == "array":
                    value_owner_key = parent.value_owner_key
            containers.append(
                _JsonContainerState(
                    kind="object",
                    value_owner_key=value_owner_key,
                    object_key_owner=object_key_owner,
                    expecting_key=True,
                )
            )
            i += 1
            continue
        if char == "[":
            value_owner_key = None
            if containers:
                parent = containers[-1]
                if (
                    parent.kind == "object"
                    and parent.expecting_value
                    and parent.pending_key is not None
                ):
                    value_owner_key = parent.pending_key
                    parent.expecting_value = False
                    parent.pending_key = None
                elif parent.kind == "array":
                    value_owner_key = parent.value_owner_key
            containers.append(
                _JsonContainerState(
                    kind="array",
                    value_owner_key=value_owner_key,
                )
            )
            i += 1
            continue
        if char == ":":
            if containers and containers[-1].kind == "object":
                container = containers[-1]
                if container.pending_key is not None and not container.expecting_value:
                    container.expecting_value = True
            i += 1
            continue
        if char == ",":
            if containers and containers[-1].kind == "object":
                container = containers[-1]
                container.expecting_key = True
                container.expecting_value = False
                container.pending_key = None
            i += 1
            continue
        if char == "}":
            if containers and containers[-1].kind == "object":
                containers.pop()
            i += 1
            continue
        if char == "]":
            if containers and containers[-1].kind == "array":
                containers.pop()
            i += 1
            continue
        if containers and containers[-1].kind == "object":
            container = containers[-1]
            if container.expecting_value and not char.isspace():
                i = consume_non_string_value(buffer, i, container)
                continue
        i += 1
    return tokens


def consume_non_string_value(
    buffer: str,
    start_index: int,
    container: _JsonContainerState,
) -> int:
    container.expecting_value = False
    container.pending_key = None
    i = start_index
    while i < len(buffer) and buffer[i] not in ",]}":
        i += 1
    return i


def parse_partial_json_string_with_end(
    buffer: str,
    start_index: int,
) -> tuple[str, int, bool]:
    parsed: list[str] = []
    i = start_index
    while i < len(buffer):
        char = buffer[i]
        if char == '"':
            return "".join(parsed), i + 1, True
        if char != "\\":
            parsed.append(char)
            i += 1
            continue
        i += 1
        if i >= len(buffer):
            return "".join(parsed), len(buffer), False
        escape = buffer[i]
        if escape == '"':
            parsed.append('"')
        elif escape == "\\":
            parsed.append("\\")
        elif escape == "/":
            parsed.append("/")
        elif escape == "b":
            parsed.append("\b")
        elif escape == "f":
            parsed.append("\f")
        elif escape == "n":
            parsed.append("\n")
        elif escape == "r":
            parsed.append("\r")
        elif escape == "t":
            parsed.append("\t")
        elif escape == "u":
            if i + 4 >= len(buffer):
                return "".join(parsed), len(buffer), False
            code = buffer[i + 1 : i + 5]
            if not is_hex_digits(code):
                return "".join(parsed), len(buffer), False
            parsed.append(chr(int(code, 16)))
            i += 5
            continue
        else:
            parsed.append(escape)
        i += 1
    return "".join(parsed), len(buffer), False


def is_hex_digits(value: str) -> bool:
    return all(char in string.hexdigits for char in value)
