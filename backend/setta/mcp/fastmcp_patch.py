import json
import types
from typing import Annotated, Any, Literal, Union, get_args, get_origin

from mcp.server.fastmcp.utilities.func_metadata import FuncMetadata

_PATCH_APPLIED = False


def _unwrap_annotated(annotation: Any) -> Any:
    origin = get_origin(annotation)
    if origin is Annotated:
        args = get_args(annotation)
        if args:
            return _unwrap_annotated(args[0])
    return annotation


def _is_string_annotation(annotation: Any) -> bool:
    annotation = _unwrap_annotated(annotation)
    origin = get_origin(annotation)
    if origin is None:
        return isinstance(annotation, type) and issubclass(annotation, str)
    if origin is Literal:
        args = get_args(annotation)
        return bool(args) and all(isinstance(arg, str) for arg in args)
    if origin in (types.UnionType, Union):
        args = get_args(annotation)
        if not args:
            return False
        return all(arg is type(None) or _is_string_annotation(arg) for arg in args)
    return False


def apply_fastmcp_preparse_patch() -> None:
    global _PATCH_APPLIED
    if _PATCH_APPLIED:
        return

    original_pre_parse = FuncMetadata.pre_parse_json

    def pre_parse_json(self: FuncMetadata, data: dict[str, Any]) -> dict[str, Any]:
        new_data = data.copy()
        for field_name, field in self.arg_model.model_fields.items():
            if field_name not in data:
                continue
            raw_value = data[field_name]
            if not isinstance(raw_value, str):
                continue
            if _is_string_annotation(field.annotation):
                continue
            try:
                pre_parsed = json.loads(raw_value)
            except json.JSONDecodeError:
                continue
            if isinstance(pre_parsed, str | int | float):
                continue
            new_data[field_name] = pre_parsed
        assert new_data.keys() == data.keys()
        return new_data

    FuncMetadata.pre_parse_json = pre_parse_json
    _PATCH_APPLIED = True
