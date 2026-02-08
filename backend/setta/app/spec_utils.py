from setta.types.chat_messages import JSONValue


def is_ui_element(value: JSONValue | None) -> bool:
    if not isinstance(value, dict):
        return False
    return isinstance(value.get("key"), str) and isinstance(value.get("type"), str)


def get_data_path(props: dict[str, JSONValue]) -> str | None:
    value = props.get("dataPath")
    if isinstance(value, str):
        return value
    return None


def decode_pointer_segment(segment: str) -> str:
    return segment.replace("~1", "/").replace("~0", "~")


def resolve_pointer(value: JSONValue, pointer: str) -> JSONValue | None:
    if pointer == "":
        return value
    if not pointer.startswith("/"):
        return None
    current: JSONValue = value
    segments = [decode_pointer_segment(segment) for segment in pointer.split("/")[1:]]
    for segment in segments:
        if isinstance(current, list):
            if not segment.isdigit():
                return None
            index = int(segment)
            if index < 0 or index >= len(current):
                return None
            current = current[index]
            continue
        if not isinstance(current, dict):
            return None
        if segment not in current:
            return None
        current = current[segment]
    return current


def resolve_binding_record(
    data_bindings: dict[str, JSONValue] | None,
    data_path: str | None,
) -> dict[str, JSONValue] | None:
    if not data_bindings or data_path is None:
        return None
    if data_path == "" or data_path.startswith("/"):
        resolved = resolve_pointer(data_bindings, data_path)
    else:
        resolved = data_bindings.get(data_path)
    if isinstance(resolved, dict):
        return resolved
    return None


def resolve_binding_string(
    binding: dict[str, JSONValue] | None,
    key: str,
) -> str | None:
    if binding is None:
        return None
    value = binding.get(key)
    if isinstance(value, str):
        return value
    return None

