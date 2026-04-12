import types
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Union, get_args, get_origin

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_impl_classes, python_type_to_str

EXCLUDED_FIELDS = {"type"}
UNION_TYPES: tuple[Any, ...] = tuple(
    t for t in (Union, getattr(types, "UnionType", None)) if t is not None
)


@dataclass
class FieldTypeInfo:
    components: dict[str, Any] = field(default_factory=dict)
    sources: set[str] = field(default_factory=set)
    has_none: bool = False
    non_base_signatures: dict[tuple[str, ...], set[str]] = field(default_factory=dict)


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
            if name in EXCLUDED_FIELDS:
                continue
            annotation = model_field.annotation
            if annotation is None:
                continue
            info = field_infos[name]
            info.sources.add(class_info.original_name)
            class_components: set[str] = set()
            class_has_none = False
            for component in flatten_annotation(annotation):
                if component is type(None):
                    info.has_none = True
                    class_has_none = True
                    continue
                component_str = python_type_to_str(component)
                info.components.setdefault(component_str, component)
                class_components.add(component_str)
            if class_info.type_has_default:
                signature_components = set(class_components)
                if class_has_none:
                    signature_components.add("None")
                signature = tuple(sorted(signature_components))
                info.non_base_signatures.setdefault(signature, set()).add(
                    class_info.original_name
                )

    return field_infos


def render_shared_modifier(field_infos: dict[str, FieldTypeInfo]) -> str:
    """Render SharedModifier source code based on collected field annotations."""
    imports: dict[str, set[str]] = defaultdict(set)
    _add_typing_import(imports, "TypedDict")
    _add_typing_import(imports, "NotRequired")

    lines = []
    multi_type_fields: list[tuple[str, list[str]]] = []

    for field_name in sorted(field_infos):
        info = field_infos[field_name]
        component_names = sorted(info.components.keys())
        if len(info.non_base_signatures) > 1:
            conflict_descriptions: list[str] = []
            for signature, classes in sorted(
                info.non_base_signatures.items(),
                key=lambda item: item[0],
            ):
                if signature:
                    annotation_label = " | ".join(signature)
                else:
                    annotation_label = "Any"
                class_list = ", ".join(sorted(classes))
                conflict_descriptions.append(f"{annotation_label} ({class_list})")
            multi_type_fields.append((field_name, conflict_descriptions))
        for component in info.components.values():
            collect_annotation_dependencies(imports, component)
        annotation_str = " | ".join(component_names) if component_names else "Any"
        if info.has_none or not component_names:
            if "None" not in annotation_str.split(" | "):
                annotation_str = (
                    f"{annotation_str} | None" if annotation_str else "None"
                )
        annotation_str = f"NotRequired[{annotation_str}]"
        lines.append(f"    {field_name}: {annotation_str}")

    imports_lines: list[str] = []
    for module in sorted(imports):
        names = ", ".join(sorted(imports[module]))
        imports_lines.append(f"from {module} import {names}")

    if lines:
        body = "\n".join(lines)
    else:
        body = "    pass"

    if multi_type_fields:
        conflicts = "\n".join(
            f"# Field '{name}' present with conflicting annotations: {', '.join(details)}"
            for name, details in multi_type_fields
        )
        body = f"""{conflicts}
{body}"""

    code = f"""# Auto-generated shared modifier model - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

{chr(10).join(imports_lines)}


class SharedModifier(TypedDict):
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
