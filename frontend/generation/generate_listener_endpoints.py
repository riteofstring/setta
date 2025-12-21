import inspect
import types
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Annotated, Any, Literal, Union, get_args, get_origin, get_type_hints

from setta.listeners.listener_router_endpoint_registry import (
    get_listener_router_endpoint_specs_by_method_name,
)
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


def _render_type(
    annotation: object,
    imports: dict[str, set[str]],
    typing_imports: set[str],
) -> str:
    if annotation is inspect.Parameter.empty:
        return "None"
    if annotation is None or annotation is type(None):
        return "None"
    if annotation is Any:
        return "object"

    origin = get_origin(annotation)
    if origin is Annotated:
        args = get_args(annotation)
        return _render_type(args[0], imports, typing_imports) if args else "object"
    if origin is Literal:
        typing_imports.add("Literal")
        args = get_args(annotation)
        return f"Literal[{', '.join(repr(arg) for arg in args)}]"
    if origin in (list, set, tuple, dict, Sequence, Mapping):
        args = get_args(annotation)
        if origin in (list, Sequence):
            inner = _render_type(args[0], imports, typing_imports) if args else "object"
            return f"list[{inner}]"
        if origin is set:
            inner = _render_type(args[0], imports, typing_imports) if args else "object"
            return f"set[{inner}]"
        if origin is tuple:
            if not args:
                return "tuple[object, ...]"
            rendered = ", ".join(
                _render_type(arg, imports, typing_imports) for arg in args
            )
            return f"tuple[{rendered}]"
        if origin in (dict, Mapping):
            if len(args) >= 2:
                key = _render_type(args[0], imports, typing_imports)
                value = _render_type(args[1], imports, typing_imports)
                return f"dict[{key}, {value}]"
            return "dict[str, object]"

    if origin in (Union, types.UnionType):
        rendered = " | ".join(
            _render_type(arg, imports, typing_imports) for arg in get_args(annotation)
        )
        return rendered

    if origin is None and isinstance(annotation, type):
        if annotation.__module__ == "builtins":
            return annotation.__name__
        module_imports = imports.setdefault(annotation.__module__, set())
        module_imports.add(annotation.__name__)
        return annotation.__name__

    return "object"


def generate_listener_endpoints(output_file: Path) -> None:
    specs = get_listener_router_endpoint_specs_by_method_name()
    imports: dict[str, set[str]] = {}
    typing_imports: set[str] = {"Awaitable", "Callable", "TypedDict"}
    method_defs: list[str] = []
    typed_dict_defs: list[str] = []
    typed_dict_names: dict[type[object], str] = {}
    needs_not_required = False

    for method_name in sorted(specs):
        spec = specs[method_name]
        request_model = spec.request_model
        if request_model not in typed_dict_names:
            typed_dict_names[request_model] = f"Listener{request_model.__name__}Payload"

    for request_model, typed_dict_name in sorted(
        typed_dict_names.items(), key=lambda item: item[1]
    ):
        lines = [f"class {typed_dict_name}(TypedDict):"]
        for field_name, field in request_model.model_fields.items():
            field_type = field.annotation
            rendered_type = _render_type(field_type, imports, typing_imports)
            is_required = field.is_required()
            if field_name == "projectConfigId":
                is_required = False
            if is_required:
                lines.append(f"    {field_name}: {rendered_type}")
            else:
                needs_not_required = True
                lines.append(f"    {field_name}: NotRequired[{rendered_type}]")
        if len(lines) == 1:
            lines.append("    pass")
        typed_dict_defs.append("\n".join(lines))

    for method_name in sorted(specs):
        spec = specs[method_name]
        type_hints = get_type_hints(spec.endpoint)
        return_type = type_hints.get("return", None)
        payload_type = typed_dict_names[spec.request_model]
        result_type = _render_type(return_type, imports, typing_imports)
        method_defs.append(
            "\n".join(
                [
                    f"    async def {method_name}(",
                    f"        self, payload: {payload_type}",
                    f"    ) -> {result_type}:",
                    f'        return await self._caller("{spec.endpoint_name}", payload)',
                ]
            )
        )

    if needs_not_required:
        typing_imports.add("NotRequired")

    lines: list[str] = [
        f"from typing import {', '.join(sorted(typing_imports))}",
    ]
    for module in sorted(imports):
        names = ", ".join(sorted(imports[module]))
        lines.append(f"from {module} import {names}")
    lines.append("")
    lines.append("")
    lines.extend(typed_dict_defs)
    lines.append("")
    lines.append("class RouterEndpointAPI:")
    lines.append(
        "    def __init__(self, caller: Callable[[str, object], Awaitable[object]]) -> None:"
    )
    lines.append("        self._caller = caller")
    lines.append("")
    lines.extend(method_defs)
    lines.append("")

    code = ruff_format("\n".join(lines))
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    output_path = get_absolute_path(
        __file__, Path("../../backend/setta/api/generated_listener_endpoints.py")
    )
    generate_listener_endpoints(output_file=output_path)
