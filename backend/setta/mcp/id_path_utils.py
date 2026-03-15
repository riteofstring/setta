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
            if path == "$":
                values = [payload]
            else:
                segments = [segment for segment in path.split(".") if segment]
                values = [payload]
                for segment in segments:
                    next_values: list[Any] = []
                    for item in values:
                        if not isinstance(item, dict):
                            continue
                        if segment not in item:
                            continue
                        next_values.append(item[segment])
                    values = next_values
                    if not values:
                        break
            for value in values:
                if isinstance(value, list):
                    ids = [ID(entry) for entry in value if isinstance(entry, str) and entry]
                elif isinstance(value, str):
                    ids = [ID(value)] if value else []
                else:
                    ids = None
                if ids is None and allow_dict_keys and isinstance(value, dict):
                    dict_keys = [key for key in value.keys() if isinstance(key, str)]
                    ids = [ID(entry) for entry in dict_keys if entry]
                if ids is None:
                    continue
                found_types.add(id_type)
                if ids:
                    ids_by_type.setdefault(id_type, set()).update(ids)
    return ids_by_type, found_types
