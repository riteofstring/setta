#!/usr/bin/env python3
"""Base generator utilities for code generation."""

import inspect
import types
from collections.abc import Sequence as ABCSequence
from enum import Enum
from pathlib import Path
from typing import (
    Annotated,
    Any,
    Dict,
    List,
    Literal,
    Set,
    Tuple,
    Type,
    Union,
    get_args,
    get_origin,
)

from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format


class BaseGenerator:
    """Base class for code generators with common utilities."""

    def __init__(self, output_folder: Path):
        self.output_folder = output_folder
        self._module_cache = {}
        self._class_cache = {}

    def find_subclasses(
        self,
        module: Any,
        base_class: Type[BaseModel],
        discriminator: str = "type",
        concrete_only: bool = False,
        include_base: bool = False,
    ) -> List[Type[BaseModel]]:
        """Find subclasses with caching."""
        cache_key = (
            module.__name__,
            base_class.__name__,
            discriminator,
            concrete_only,
            include_base,
        )
        if cache_key in self._class_cache:
            return self._class_cache[cache_key]

        classes = []
        for _, obj in inspect.getmembers(module, inspect.isclass):
            if not issubclass(obj, base_class) or (
                not include_base and obj is base_class
            ):
                continue

            fields = obj.model_fields
            has_discriminator = discriminator in fields
            has_default = (
                has_discriminator
                and fields[discriminator].default is not PydanticUndefined
            )

            if concrete_only and has_default:
                classes.append(obj)
            elif not concrete_only and has_discriminator and not has_default:
                classes.append(obj)
            elif include_base and obj is base_class:
                classes.append(obj)

        # Sort by source line for consistent output
        classes.sort(key=lambda cls: self._get_line_number(cls))
        self._class_cache[cache_key] = classes
        return classes

    def _get_line_number(self, cls):
        """Get source line number for sorting."""
        try:
            return inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            return float("inf")

    def extract_type_value(self, class_name: str) -> str:
        """Extract enum value from impl class name."""
        for suffix in ["SectionImpl", "CodeObjImpl", "Core", "Modifier", "Layering"]:
            if class_name.endswith(suffix):
                return class_name[: -len(suffix)]
        return class_name

    def build_imports(self, items: List[str], module_name: str, indent: int = 4) -> str:
        """Build formatted import block."""
        if not items:
            return ""

        # The 'from' line uses the specified indent
        from_indent = " " * indent
        # Items inside parentheses should always be indented at least 4 spaces relative to 'from'
        item_indent = " " * (indent + 4)
        
        import_lines = [f"{item_indent}{item}," for item in sorted(set(items))]
        return f"{from_indent}from {module_name} import (\n" + "\n".join(import_lines) + f"\n{from_indent})"

    def render_template(self, template: str, **kwargs) -> str:
        """Render a template string with given values."""
        return template.format(**kwargs)

    def write_output(self, content: str, filename: str, description: str):
        """Write formatted content to file."""
        formatted = ruff_format(content)
        output_file = self.output_folder / filename
        output_file.write_text(formatted)
        print(f"Generated {description} in {output_file}")

    def get_all_concrete_classes(
        self, module: Any, base_class: Type[BaseModel]
    ) -> Dict[str, Type[BaseModel]]:
        """Get all concrete classes mapped by their type value."""
        classes = self.find_subclasses(module, base_class, concrete_only=True)
        return {cls.model_fields["type"].default.value: cls for cls in classes}

    def python_type_to_str(self, python_type) -> str:
        """Convert Python type to string representation."""
        if python_type is type(None):
            return "None"

        origin = get_origin(python_type)

        # Handle built-in types that aren't from typing module
        if origin is None:
            if python_type in (list, dict, set, tuple):
                origin = python_type

        if origin is Annotated:
            args = get_args(python_type)
            if args:
                return f"Annotated[{self.python_type_to_str(args[0])}, ...]"
            return "Any"

        if origin is Literal:
            args = get_args(python_type)
            literals = []
            for arg in args:
                if isinstance(arg, Enum):
                    literals.append(f"{arg.__class__.__name__}.{arg.name}")
                elif isinstance(arg, str):
                    literals.append(f'"{arg}"')
                elif isinstance(arg, bool):
                    literals.append(str(arg))
                else:
                    literals.append(str(arg))
            return f"Literal[{', '.join(literals)}]"

        if origin in (Union, types.UnionType):
            args = get_args(python_type)
            types_str = [self.python_type_to_str(t) for t in args]
            return " | ".join(types_str)

        if origin in (list, List, ABCSequence):
            args = get_args(python_type)
            if args:
                element_type = self.python_type_to_str(args[0])
                return f"list[{element_type}]"
            return "list"

        if origin in (dict, Dict):
            args = get_args(python_type)
            if args and len(args) >= 2:
                key_type = self.python_type_to_str(args[0])
                value_type = self.python_type_to_str(args[1])
                return f"dict[{key_type}, {value_type}]"
            return "dict"

        if origin in (set, Set):
            args = get_args(python_type)
            if args:
                element_type = self.python_type_to_str(args[0])
                return f"set[{element_type}]"
            return "set"

        if origin in (tuple, Tuple):
            args = get_args(python_type)
            types_str = [self.python_type_to_str(t) for t in args]
            return f"tuple[{', '.join(types_str)}]"

        if hasattr(python_type, "__name__"):
            return python_type.__name__

        return str(python_type)


class UnionGenerator:
    """Simplified union generation."""

    UNION_TEMPLATE = """
{union_name} = Union[{members}]

{union_name}WithDiscriminator = Annotated[
    {union_name}, Field(discriminator="{discriminator}")
]

{union_name}TypeAdapter = TypeAdapter({union_name}WithDiscriminator)

{union_name}TypeSet = set({type_set})
"""

    def generate_union(
        self,
        name: str,
        members: List[str],
        discriminator: str = "type",
        type_values: List[str] | None = None,
    ) -> str:
        """Generate a union type with associated utilities."""
        if not members:
            return f"# {name} is empty - no concrete implementations\n"

        if type_values is None:
            type_values = [m.replace("Impl", "").replace("Core", "") for m in members]

        return self.UNION_TEMPLATE.format(
            union_name=name,
            members=", ".join(members),
            discriminator=discriminator,
            type_set="[" + ", ".join(f'"{v}"' for v in type_values) + "]",
        )


class OverloadGenerator:
    """Simplified overload generation."""

    OVERLOAD_TEMPLATE = """
@overload
def {func_name}({params}) -> {return_type}: ...
"""

    def generate_overloads(
        self,
        func_name: str,
        overload_specs: List[Dict[str, Any]],
        base_overload: Dict[str, Any] | None = None,
    ) -> str:
        """Generate function overloads."""
        overloads = []

        # Specific overloads
        for spec in overload_specs:
            overloads.append(
                self.OVERLOAD_TEMPLATE.format(
                    func_name=func_name,
                    params=spec["params"],
                    return_type=spec["return_type"],
                )
            )

        # Base overload
        if base_overload:
            overloads.append(
                self.OVERLOAD_TEMPLATE.format(
                    func_name=func_name,
                    params=base_overload["params"],
                    return_type=base_overload["return_type"],
                )
            )

        return "".join(overloads)
