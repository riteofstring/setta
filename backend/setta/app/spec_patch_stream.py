import json
from typing import Any

_ALLOWED_OPS = {"set", "add", "replace", "remove"}


def parse_patch_lines(patches: str) -> list[dict[str, Any]]:
    """
    Parse newline-delimited JSON patch operations.

    This is intentionally compatible with json-render `useUIStream` style patches:
    - Each line is a JSON object with keys: op, path, and (unless op=remove) value.
    - Blank lines and `// ...` comment lines are ignored.
    """
    ops: list[dict[str, Any]] = []
    for raw_line in patches.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("//"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid patch JSON line: {raw_line!r}") from exc
        if not isinstance(payload, dict):
            raise ValueError("Patch line must be a JSON object.")
        op = payload.get("op")
        path = payload.get("path")
        if not isinstance(op, str) or op not in _ALLOWED_OPS:
            raise ValueError(f"Unsupported patch op: {op!r}")
        if not isinstance(path, str):
            raise ValueError("Patch path must be a string.")
        if path != "/root" and not path.startswith("/elements/"):
            raise ValueError(f"Unsupported patch path: {path!r}")
        if op != "remove" and "value" not in payload:
            raise ValueError("Patch line missing required 'value'.")
        ops.append(payload)
    return ops


def apply_patch_ops(
    ops: list[dict[str, Any]],
    *,
    initial_spec: dict[str, Any] | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = (
        {"root": None, "elements": {}} if initial_spec is None else dict(initial_spec)
    )
    for op in ops:
        apply_patch_op(spec, op)
    return spec


def apply_patch_op(spec: dict[str, Any], op: dict[str, Any]) -> None:
    raw_op = op.get("op")
    raw_path = op.get("path")
    if not isinstance(raw_op, str) or raw_op not in _ALLOWED_OPS:
        raise ValueError(f"Unsupported patch op: {raw_op!r}")
    if not isinstance(raw_path, str):
        raise ValueError("Patch path must be a string.")
    if raw_path != "/root" and not raw_path.startswith("/elements/"):
        raise ValueError(f"Unsupported patch path: {raw_path!r}")

    if raw_path == "/root":
        if raw_op == "remove":
            spec["root"] = None
            return
        spec["root"] = op.get("value")
        return

    tokens = _decode_pointer_tokens(raw_path)
    parent, key = _resolve_pointer_parent(spec, tokens, create=True)
    if raw_op == "remove":
        _remove_at(parent, key)
        return
    _set_at(parent, key, op.get("value"), op=raw_op)


def _decode_pointer_tokens(path: str) -> list[str]:
    if not path.startswith("/"):
        raise ValueError("Patch path must be a JSON Pointer starting with '/'.")
    tokens = [segment for segment in path.split("/")[1:] if segment != ""]
    return [_decode_pointer_token(token) for token in tokens]


def _decode_pointer_token(token: str) -> str:
    # JSON Pointer escape rules.
    return token.replace("~1", "/").replace("~0", "~")


def _resolve_pointer_parent(
    root: dict[str, Any] | list[Any],
    tokens: list[str],
    *,
    create: bool,
) -> tuple[dict[str, Any] | list[Any], str]:
    if not tokens:
        raise ValueError("Patch path cannot be empty.")
    current: Any = root
    for i, token in enumerate(tokens[:-1]):
        next_token = tokens[i + 1]
        if isinstance(current, dict):
            if token not in current or current[token] is None:
                if not create:
                    raise KeyError(f"Missing path segment: {token}")
                current[token] = _infer_container(next_token)
            current = current[token]
            continue
        if isinstance(current, list):
            if token == "-":
                if not create:
                    raise ValueError("'-' array index is only valid for add/set.")
                index = len(current)
            else:
                index = _parse_array_index(token)
            if index == len(current):
                if not create:
                    raise IndexError("Array index out of range.")
                current.append(_infer_container(next_token))
            current = current[index]
            continue
        raise TypeError("Patch path traversed into a non-container value.")
    return current, tokens[-1]


def _infer_container(next_token: str) -> dict[str, Any] | list[Any]:
    if next_token == "-" or next_token.isdigit():
        return []
    return {}


def _parse_array_index(token: str) -> int:
    if not token.isdigit():
        raise ValueError("Array index must be a non-negative integer.")
    return int(token)


def _set_at(
    parent: dict[str, Any] | list[Any], key: str, value: Any, *, op: str
) -> None:
    if isinstance(parent, dict):
        if op == "replace" and key not in parent:
            raise KeyError(f"Cannot replace missing key: {key}")
        parent[key] = value
        return
    if isinstance(parent, list):
        if key == "-":
            parent.append(value)
            return
        index = _parse_array_index(key)
        if index < 0:
            # '-' is handled above; negative isn't allowed.
            raise ValueError("Array index must be non-negative.")
        if index > len(parent):
            # Avoid surprising holes.
            raise IndexError("Array index out of range.")
        if index == len(parent):
            parent.append(value)
            return
        if op == "replace" and index >= len(parent):
            raise IndexError("Cannot replace missing array index.")
        parent[index] = value
        return
    raise TypeError("Patch set target is not a container.")


def _remove_at(parent: dict[str, Any] | list[Any], key: str) -> None:
    if isinstance(parent, dict):
        parent.pop(key, None)
        return
    if isinstance(parent, list):
        if key == "-":
            return
        index = _parse_array_index(key)
        if index < 0 or index >= len(parent):
            return
        parent.pop(index)
        return
    raise TypeError("Patch remove target is not a container.")
