from __future__ import annotations

import types
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Union, get_args, get_origin

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_impl_classes, python_type_to_str

DEFAULT_UNSHARED_KEYS = {
    "callable",
    "codeObjVariantMap",
    "layers",
    "topLevelParamId",
    "value",
}
EXCLUDED_FIELDS = {"type"}
UNION_TYPES: tuple[Any, ...] = tuple(
    t for t in (Union, getattr(types, "UnionType", None)) if t is not None
)


@dataclass
class FieldTypeInfo:
    components: dict[str, Any] = field(default_factory=dict)
    sources: set[str] = field(default_factory=set)
    has_none: bool = False


def _add_typing_import(imports: dict[str, set[str]], name: str):
    imports["typing"].add(name)


def collect_literal_dependencies(imports: dict[str, set[str]], args: Iterable[Any]):
    _add_typing_import(imports, "Literal")
    for arg in args:
        if arg is None:
            continue
        if isinstance(arg, Enum):
            module = arg.__class__.__module__
            if module == "builtins":
                continue
            imports[module].add(arg.__class__.__qualname__)


def collect_annotation_dependencies(imports: dict[str, set[str]], annotation: Any):
    """Populate imports required by annotation."""
    origin = get_origin(annotation)
    if origin is None:
        if annotation is Any:
            _add_typing_import(imports, "Any")
            return
        if annotation is type(None):
            return
        module = getattr(annotation, "__module__", "")
        name = getattr(annotation, "__qualname__", "")
        if module == "builtins" or not module or not name:
            return
        if module.startswith("typing"):
            imports[module].add(name)
            return
        imports[module].add(name)
        return

    if origin in (list, set, dict, tuple):
        for arg in get_args(annotation):
            collect_annotation_dependencies(imports, arg)
        return

    if origin in UNION_TYPES:
        for arg in get_args(annotation):
            collect_annotation_dependencies(imports, arg)
        return

    if origin.__module__ == "typing":  # e.g. typing.Callable, Annotated, Literal
        name = origin.__qualname__
        _add_typing_import(imports, name.split(".")[0])
        args = get_args(annotation)
        if name.startswith("Literal"):
            collect_literal_dependencies(imports, args)
            return
        for arg in args:
            collect_annotation_dependencies(imports, arg)
        return

    # For collections.abc.Callable etc.
    module = origin.__module__
    name = origin.__qualname__
    if module.startswith("collections"):
        _add_typing_import(imports, name.split(".")[0])
    else:
        imports[module].add(name.split(".")[0])
    for arg in get_args(annotation):
        collect_annotation_dependencies(imports, arg)


def flatten_annotation(annotation: Any) -> list[Any]:
    """Expand union annotations into their components."""
    origin = get_origin(annotation)
    if origin in UNION_TYPES:
        flattened: list[Any] = []
        for arg in get_args(annotation):
            flattened.extend(flatten_annotation(arg))
        return flattened
    return [annotation]


def gather_field_definitions(
    classes: dict[str, ImplClassInfoForGeneration],
) -> dict[str, FieldTypeInfo]:
    """Collect all modifier-capable field annotations and their origins."""
    field_infos: dict[str, FieldTypeInfo] = defaultdict(FieldTypeInfo)

    for class_info in classes.values():
        for name, model_field in class_info.class_obj.model_fields.items():
            if name in DEFAULT_UNSHARED_KEYS or name in EXCLUDED_FIELDS:
                continue
            annotation = model_field.annotation
            if annotation is None:
                continue
            info = field_infos[name]
            info.sources.add(class_info.original_name)
            for component in flatten_annotation(annotation):
                if component is type(None):
                    info.has_none = True
                    continue
                component_str = python_type_to_str(component)
                info.components.setdefault(component_str, component)

    return field_infos


def render_shared_modifier(field_infos: dict[str, FieldTypeInfo]) -> str:
    """Render SharedModifier source code based on collected field annotations."""
    imports: dict[str, set[str]] = defaultdict(set)
    imports["pydantic"].add("BaseModel")

    lines = []
    multi_type_fields: list[tuple[str, list[str]]] = []

    for field_name in sorted(field_infos):
        info = field_infos[field_name]
        component_names = sorted(info.components.keys())
        if len(component_names) > 1:
            multi_type_fields.append((field_name, component_names))
        for component in info.components.values():
            collect_annotation_dependencies(imports, component)
        annotation_str = " | ".join(component_names) if component_names else "Any"
        if info.has_none or not component_names:
            if "None" not in annotation_str.split(" | "):
                annotation_str = (
                    f"{annotation_str} | None" if annotation_str else "None"
                )
        else:
            annotation_str = f"{annotation_str} | None"
        lines.append(f"    {field_name}: {annotation_str} = None")

    imports_lines: list[str] = []
    for module in sorted(imports):
        names = ", ".join(sorted(imports[module]))
        imports_lines.append(f"from {module} import {names}")

    if lines:
        class_body = "\n".join(lines)
        helper_methods = """

    def as_dict(self) -> dict[str, Any]:
        \"\"\"Return a dict view excluding unset values.\"\"\"
        return self.model_dump(exclude_none=True)

    def __getitem__(self, key: str) -> Any:
        return getattr(self, key)

    def __setitem__(self, key: str, value: Any) -> None:
        setattr(self, key, value)

    def __contains__(self, key: object) -> bool:
        return isinstance(key, str) and getattr(self, key, None) is not None

    def get(self, key: str, default: Any = None) -> Any:
        if key not in self:
            return default
        return getattr(self, key)

    def items(self):
        return self.as_dict().items()

    def __iter__(self):
        return iter(self.as_dict())
"""
        body = f"{class_body}{helper_methods}"
    else:
        body = "    pass"

    if multi_type_fields:
        conflicts = "\n".join(
            f"# Field '{name}' present with multiple annotations: {', '.join(types)}"
            for name, types in multi_type_fields
        )
        body = f"""{conflicts}
{body}"""

    code = f"""# Auto-generated shared modifier model - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

{chr(10).join(imports_lines)}


class SharedModifier(BaseModel, extra="forbid"):
{body}
"""
    return ruff_format(code)


def main(output_folder: Path):
    classes = get_impl_classes()
    field_infos = gather_field_definitions(classes)
    code = render_shared_modifier(field_infos)
    output_file = output_folder / "shared_modifier.py"
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
