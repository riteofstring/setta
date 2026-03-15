from typing import Any

from setta.mcp.tool_metadata import FollowIdType
from setta.types.id import ID


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


def coerce_id_list(raw_value: Any) -> list[ID] | None:
    if isinstance(raw_value, list):
        return [ID(value) for value in raw_value if isinstance(value, str) and value]
    if isinstance(raw_value, str):
        return [ID(raw_value)] if raw_value else []
    return None
