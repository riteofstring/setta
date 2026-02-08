import copy
import json
from typing import Any

ALLOWED_PATCH_OPS = {"set", "add", "replace", "remove"}


def _parse_patch_line_core(line: str) -> tuple[dict[str, Any] | None, str | None]:
    """Return (payload, error_message). Blank/comment lines return (None, None)."""
    trimmed = line.strip()
    if not trimmed or trimmed.startswith("//"):
        return None, None
    try:
        payload = json.loads(trimmed)
    except json.JSONDecodeError as exc:
        return None, f"Invalid patch JSON line: {line!r} ({exc})"
    if not isinstance(payload, dict):
        return None, "Patch line must be a JSON object."
    op = payload.get("op")
    path = payload.get("path")
    if not isinstance(op, str) or op not in ALLOWED_PATCH_OPS:
        return None, f"Unsupported patch op: {op!r}"
    if not isinstance(path, str):
        return None, "Patch path must be a string."
    if path != "/root" and not path.startswith("/elements/"):
        return None, f"Unsupported patch path: {path!r}"
    if op != "remove" and "value" not in payload:
        return None, "Patch line missing required 'value'."
    return payload, None


def parse_patch_line(line: str) -> dict[str, Any] | None:
    """Parse a single JSONL patch line. Returns None for blanks/comments/invalid lines."""
    payload, _error = _parse_patch_line_core(line)
    return payload


def parse_patch_lines(patches: str) -> list[dict[str, Any]]:
    """
    Parse newline-delimited JSON patch operations.

    This is intentionally compatible with json-render `useUIStream` style patches:
    - Each line is a JSON object with keys: op, path, and (unless op=remove) value.
    - Blank lines and `// ...` comment lines are ignored.
    """
    ops: list[dict[str, Any]] = []
    for raw_line in patches.splitlines():
        payload, error = _parse_patch_line_core(raw_line)
        if payload is None:
            if error is None:
                continue
            raise ValueError(error)
        ops.append(payload)
    return ops


def apply_patch_ops(
    ops: list[dict[str, Any]],
    *,
    initial_spec: dict[str, Any] | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = (
        {"root": None, "elements": {}}
        if initial_spec is None
        else copy.deepcopy(initial_spec)
    )
    for op in ops:
        apply_patch_op(spec, op)
    return spec


def apply_patch_op(spec: dict[str, Any], op: dict[str, Any]) -> None:
    raw_op = op.get("op")
    raw_path = op.get("path")
    if not isinstance(raw_op, str) or raw_op not in ALLOWED_PATCH_OPS:
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
            if op == "replace":
                raise IndexError("Cannot replace missing array index.")
            parent.append(value)
            return
        index = _parse_array_index(key)
        if index > len(parent):
            # Avoid surprising holes.
            raise IndexError("Array index out of range.")
        if op == "replace" and index >= len(parent):
            raise IndexError("Cannot replace missing array index.")
        if index == len(parent):
            parent.append(value)
            return
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
