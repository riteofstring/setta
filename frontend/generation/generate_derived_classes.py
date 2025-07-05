#!/usr/bin/env python3
"""
Consolidated generator for derived classes from impl classes.

This script generates:
1. Modifier TypedDicts - For partial updates to impl classes
2. Core classes - For managing shared/unshared state
3. Layering classes - For managing impl layering configurations
4. User default classes - For user-configurable defaults

All generated classes follow the same hierarchy as their source impl classes.
"""

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
from setta.utils.utils import get_absolute_path


# ============== Configuration ==============

# Exclusions for modifiers
MODIFIER_EXCLUSIONS = {"id", "name", "isPreset"}

# Exclusions for user defaults - class-specific
SECTION_USER_DEFAULT_EXCLUSIONS: Dict[str, Set[str]] = {
    "BaseSectionImpl": {
        "id",
        "name",
        "type",
        "parentId",
        "isInOtherProjectConfigs",
        "isPreset",
        "aspectRatioExtraHeight",
        "aspectRatioExtraWidth",
    },
    "BaseSectionWithParamsImpl": {
        "id",
        "name",
        "type",
        "codeObjImplLayeringMap",
        "pinnedParams",
        "selectedParams",
        "ignoreTypeErrors",
    },
    "BaseArtifactSectionImpl": {"id", "name", "type", "artifactGroupIds"},
    "BaseCanvasSectionImpl": {"id", "name", "type", "renderedValue"},
    "BaseCodeSectionImpl": {"id", "name", "type"},
    "BaseParentSectionImpl": {"id", "name", "type", "children"},
    "BaseDictSectionImpl": {
        "id",
        "name",
        "type",
        "topLevelParamIds",
        "jsonSourceMissing",
    },
}

CODE_OBJ_USER_DEFAULT_EXCLUSIONS: Dict[str, Set[str]] = {
    "BaseCodeObjImpl": {"id", "name", "type", "description", "isPreset"},
    "BaseParamCodeObjImpl": {"id", "name", "type", "passingStyle"},
    "BaseChildlessCodeObjImpl": {"id", "name", "type"},
    "BaseParentCodeObjImpl": {"id", "name", "type", "children"},
}

DEFAULT_USER_DEFAULT_EXCLUSIONS = {"id", "name", "type"}

# Default unsharedKeys for cores
DEFAULT_SECTION_UNSHARED_KEYS: Dict[str, Set[str]] = {
    "Callable": {"callable", "codeObjImplLayeringMap"},
    "Dict": {"topLevelParamIds", "codeObjImplLayeringMap"},
    "ListRoot": set(),
    "DictRoot": set(),
    "Group": set(),
    "Image": set(),
    "Chart": set(),
    "Draw": set(),
    "TextBlock": set(),
    "Social": set(),
    "GlobalVariables": set(),
    "Code": set(),
    "GenPythonCode": set(),
    "Terminal": set(),
    "IFrame": set(),
    "Chat": set(),
    "Browser": set(),
}

DEFAULT_CODE_OBJ_UNSHARED_KEYS: Dict[str, Set[str]] = {
    "CodeCallable": set(),
    "CodeParam": {"value"},
    "TextParam": {"value"},
    "SliderParam": {"value"},
    "SwitchParam": {"value"},
    "ColorPickerParam": {"value"},
    "DropdownParam": {"value"},
    "PasswordParam": {"value"},
    "NestedParam": set(),
}


# ============== Common Utilities ==============


def find_sub_classes(
    module: Any,
    base_class: Type[BaseModel],
    discriminator: str,
    return_base_classes: bool,
    return_input_base_class: bool,
) -> List[Type[BaseModel]]:
    """Find subclasses of a base class in a module."""
    classes = []

    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            fields = obj.model_fields
            if not return_input_base_class and obj is base_class:
                continue
            if (
                return_base_classes
                and discriminator in fields
                and fields[discriminator].default is PydanticUndefined
            ):
                classes.append(obj)
            elif (
                not return_base_classes
                and discriminator in fields
                and fields[discriminator].default is not PydanticUndefined
            ):
                classes.append(obj)

    # Sort by line number where the class is defined
    def get_line_number(cls):
        try:
            return inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            return float("inf")

    classes.sort(key=get_line_number)
    return classes


def get_all_classes(
    module, base_class: Type[BaseModel], discriminator: str
) -> Tuple[List[Type[BaseModel]], List[Type[BaseModel]]]:
    """Get all base and concrete classes from a module."""
    base_classes = find_sub_classes(module, base_class, discriminator, True, False)
    concrete_classes = find_sub_classes(module, base_class, discriminator, False, False)

    # Sort concrete classes by type value
    concrete_classes.sort(key=lambda cls: cls.model_fields[discriminator].default.value)

    return base_classes, concrete_classes


def extract_type_value(impl_name: str) -> str:
    """Extract the enum value from impl class name."""
    if impl_name.endswith("SectionImpl"):
        return impl_name[:-11]  # Remove "SectionImpl"
    elif impl_name.endswith("CodeObjImpl"):
        return impl_name[:-11]  # Remove "CodeObjImpl"
    else:
        raise ValueError(f"Unexpected impl name format: {impl_name}")


def build_parent_mapping(all_classes: List[Type[BaseModel]]) -> Dict[str, str]:
    """Build a mapping of class names to their parent class names."""
    parent_mapping = {}
    all_class_names = {cls.__name__ for cls in all_classes}

    for cls in all_classes:
        for parent in cls.__bases__:
            if hasattr(parent, "model_fields") and parent.__name__ in all_class_names:
                parent_mapping[cls.__name__] = parent.__name__
                break

    return parent_mapping


def extract_class_source_info(
    source_lines: List[str], class_name: str
) -> Tuple[List[str], str]:
    """Extract source lines for a specific class and its parent class name."""
    class_lines = []
    parent_class = None
    in_class = False
    indent_level = None

    for line in source_lines:
        if line.strip().startswith(f"class {class_name}"):
            in_class = True
            indent_level = len(line) - len(line.lstrip())
            class_lines.append(line)

            # Extract parent class from the line
            if "(" in line and ")" in line:
                parent_part = line.split("(")[1].split(")")[0]
                parent_class = parent_part.split(",")[0].strip()

        elif in_class:
            if indent_level is None:
                raise ValueError(f"Could not determine indent level for {class_name}")
            if line.strip() == "":
                class_lines.append(line)
            elif len(line) - len(line.lstrip()) > indent_level:
                class_lines.append(line)
            else:
                # End of class
                break

    if parent_class is None and class_lines:
        # Try to extract from first line
        first_line = class_lines[0]
        if "(" in first_line and ")" in first_line:
            parent_part = first_line.split("(")[1].split(")")[0]
            parent_class = parent_part.split(",")[0].strip()

    return class_lines, parent_class or ""


def python_type_to_str(python_type) -> str:
    """Convert Python type to string representation."""
    if python_type is type(None):
        return "None"

    origin = get_origin(python_type)

    if origin is None:
        if python_type in (list, dict, set, tuple):
            origin = python_type

    if origin is Annotated:
        args = get_args(python_type)
        if args:
            return f"Annotated[{python_type_to_str(args[0])}, {python_type_to_str(args[1])}]"
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
        return f"Literal[{' | '.join(literals)}]"

    if origin in (Union, types.UnionType):
        args = get_args(python_type)
        types_str = [python_type_to_str(t) for t in args]
        return " | ".join(types_str)

    if origin in (list, List, ABCSequence):
        args = get_args(python_type)
        if args:
            element_type = python_type_to_str(args[0])
            return f"list[{element_type}]"
        return "list[Any]"

    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_type = python_type_to_str(args[0])
            value_type = python_type_to_str(args[1])
            return f"dict[{key_type}, {value_type}]"
        return "dict[str, Any]"

    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            element_type = python_type_to_str(args[0])
            return f"set[{element_type}]"
        return "set[Any]"

    if origin in (tuple, Tuple):
        args = get_args(python_type)
        types_str = [python_type_to_str(t) for t in args]
        return f"tuple[{', '.join(types_str)}]"

    if hasattr(python_type, "__name__"):
        return python_type.__name__

    return str(python_type)


# ============== Generator Classes ==============


class ModifierGenerator:
    """Generates TypedDict modifier classes."""

    def generate(self, impl_class: Type[BaseModel], base_class: Type[BaseModel]) -> str:
        """Generate a TypedDict modifier for an impl class."""
        name = impl_class.__name__
        attributes = []

        for field_name, field_info in impl_class.model_fields.items():
            # Skip if field is in exclusions for base class
            if impl_class is base_class and field_name in MODIFIER_EXCLUSIONS:
                continue

            # For non-base classes, skip if field is defined in ANY parent class (except type)
            if impl_class is not base_class and field_name != "type":
                field_in_parent = False
                for parent in impl_class.__bases__:
                    if (
                        hasattr(parent, "model_fields")
                        and field_name in parent.model_fields
                    ):
                        field_in_parent = True
                        break
                if field_in_parent:
                    continue

            annotation = python_type_to_str(field_info.annotation)
            if field_name != "type":
                annotation = f"NotRequired[{annotation}]"
            attributes.append(f"    {field_name}: {annotation}")

        attributes_str = "\n".join(attributes) if attributes else "    pass"

        if impl_class is base_class:
            parent_class = "TypedDict"
        else:
            parent_classes = []
            for parent in impl_class.__bases__:
                if hasattr(parent, "model_fields"):
                    parent_classes.append(f"{parent.__name__}Modifier")
            parent_class = ", ".join(parent_classes) if parent_classes else "TypedDict"

        return f"""
class {name}Modifier({parent_class}):
{attributes_str}
"""


class CoreGenerator:
    """Generates Core classes."""

    def __init__(self, enum_type: str, core_suffix: str, creation_fn: str):
        self.enum_type = enum_type
        self.core_suffix = core_suffix
        self.creation_fn = creation_fn

    def generate(
        self,
        impl_class: Type[BaseModel],
        base_class: Type[BaseModel],
        type_value: str,
        default_unshared_keys: Set[str],
        is_base_class: bool,
    ) -> str:
        """Generate a Core class for an impl class."""

        # Determine core class name
        if is_base_class:
            base_type_name = impl_class.__name__[:-4]  # Remove "Impl"
            if self.core_suffix == "SectionCore" and base_type_name.endswith("Section"):
                core_class_name = base_type_name + "Core"
            elif self.core_suffix == "CodeObjCore" and base_type_name.endswith(
                "CodeObj"
            ):
                core_class_name = base_type_name + "Core"
            else:
                core_class_name = base_type_name + self.core_suffix
        else:
            core_class_name = type_value + self.core_suffix

        # Determine parent core class
        if impl_class == base_class:
            parent_core_class = f"Base{self.core_suffix}"
        else:
            parent_impl = impl_class.__bases__[0]
            if parent_impl == base_class:
                parent_core_class = f"Base{self.core_suffix}"
            else:
                parent_base_name = parent_impl.__name__[:-4]
                if self.core_suffix == "SectionCore" and parent_base_name.endswith(
                    "Section"
                ):
                    parent_core_class = parent_base_name + "Core"
                elif self.core_suffix == "CodeObjCore" and parent_base_name.endswith(
                    "CodeObj"
                ):
                    parent_core_class = parent_base_name + "Core"
                else:
                    parent_core_class = parent_base_name + self.core_suffix

        # Generate fields
        field_literal_type = f"{impl_class.__name__}Fields"

        if is_base_class:
            modifier_type = impl_class.__name__[:-4] + "ImplModifier"
            return f"""
class {core_class_name}({parent_core_class}):
    type: Any
    sharedModifier: {modifier_type}
    unsharedKeys: list[{field_literal_type}] = Field(default_factory=list)
"""
        else:
            modifier_type = type_value + f"{self.core_suffix[:-4]}ImplModifier"

            # Generate default factory for unsharedKeys
            if default_unshared_keys:
                sorted_keys = sorted(default_unshared_keys)
                default_values = ", ".join(f'"{key}"' for key in sorted_keys)
                default_factory = f"lambda: [{default_values}]"
            else:
                default_factory = "list"

            return f"""
class {core_class_name}({parent_core_class}):
    type: Literal[{self.enum_type}.{type_value}] = {self.enum_type}.{type_value}
    sharedModifier: {modifier_type} = Field(default_factory=lambda: {self.creation_fn}({self.enum_type}.{type_value}))
    unsharedKeys: list[{field_literal_type}] = Field(default_factory={default_factory})
"""


class LayeringGenerator:
    """Generates Layering classes."""

    def __init__(self, enum_type: str):
        self.enum_type = enum_type

    def generate(
        self,
        impl_class: Type[BaseModel],
        base_class: Type[BaseModel],
        type_value: str,
        is_base_class: bool,
    ) -> str:
        """Generate a Layering class for an impl class."""

        impl_class_name = impl_class.__name__
        layering_name = (
            impl_class_name[:-4] + "ImplLayering"
        )  # Remove "Impl", add "ImplLayering"
        modifier_name = impl_class_name + "Modifier"

        # Determine parent class
        if impl_class == base_class:
            parent_class = "BaseImplLayering"
        else:
            parent_classes = []
            for parent in impl_class.__bases__:
                if hasattr(parent, "model_fields"):
                    parent_layering_name = parent.__name__[:-4] + "ImplLayering"
                    parent_classes.append(parent_layering_name)
            parent_class = (
                ", ".join(parent_classes) if parent_classes else "BaseImplLayering"
            )

        if is_base_class:
            return f"""
class {layering_name}({parent_class}):
    \"\"\"Base class for {layering_name.replace("BaseImplLayering", "").replace("Base", "")} types.\"\"\"
    type: Any
    modifier: {modifier_name}  # type: ignore[assignment]
"""
        else:
            return f"""
class {layering_name}({parent_class}):
    type: Literal[{self.enum_type}.{type_value}] = {self.enum_type}.{type_value}
    modifier: {modifier_name}  # type: ignore[assignment]
"""


class UserDefaultGenerator:
    """Generates UserDefault classes."""

    def __init__(self, source_file: Path):
        self.source_lines = source_file.read_text().splitlines(keepends=True)

    def generate(
        self,
        impl_class: Type[BaseModel],
        base_class: Type[BaseModel],
        exclusions_map: Dict[str, Set[str]],
        parent_mapping: Dict[str, str],
    ) -> str:
        """Generate a UserDefault class by transforming source."""

        class_name = impl_class.__name__
        exclusions = exclusions_map.get(class_name, DEFAULT_USER_DEFAULT_EXCLUSIONS)

        # Extract class source
        class_lines, _ = extract_class_source_info(self.source_lines, class_name)
        if not class_lines:
            return ""

        # Transform to UserDefault
        new_lines = []
        i = 0

        while i < len(class_lines):
            line = class_lines[i]

            if line.strip().startswith(f"class {class_name}"):
                # Determine parent
                parent = parent_mapping.get(class_name)
                if parent:
                    new_parent = f"UserDefault{parent}"
                else:
                    new_parent = "BaseModel"

                # Create new class definition
                indent = " " * (len(line) - len(line.lstrip()))
                new_class_def = f'{indent}class UserDefault{class_name}({new_parent}, extra="forbid"):\n'
                new_lines.append(new_class_def)

                # Add docstring
                new_lines.append(
                    f'{indent}    """User-configurable defaults for {class_name}"""\n'
                )

                i += 1

            elif i > 0:  # After the class definition
                stripped = line.strip()
                if (
                    ":" in stripped
                    and not stripped.startswith("#")
                    and not stripped.startswith('"""')
                    and not stripped.startswith("'''")
                ):
                    field_name = stripped.split(":")[0].strip()
                    if field_name not in exclusions:
                        # Add this line
                        new_lines.append(line)

                        # Check if field definition continues on next lines
                        paren_count = line.count("(") - line.count(")")
                        i += 1

                        # Continue adding lines until parentheses are balanced
                        while i < len(class_lines) and paren_count > 0:
                            new_lines.append(class_lines[i])
                            paren_count += class_lines[i].count("(") - class_lines[
                                i
                            ].count(")")
                            i += 1
                        continue
                    else:
                        # Skip excluded field
                        paren_count = line.count("(") - line.count(")")
                        i += 1

                        # Skip lines until parentheses are balanced
                        while i < len(class_lines) and paren_count > 0:
                            paren_count += class_lines[i].count("(") - class_lines[
                                i
                            ].count(")")
                            i += 1
                        continue
                elif stripped == "pass" and len(new_lines) == 2:
                    # Only keep pass if no fields were added
                    new_lines.append(line)
                    i += 1
                else:
                    i += 1
            else:
                i += 1

        # If no fields were added and no pass statement exists, add one
        if len(new_lines) == 2:  # Only class def and docstring
            indent = " " * 4
            new_lines.append(f"{indent}pass\n")

        return "".join(new_lines)


# ============== Main Generation Logic ==============


class DerivedClassGenerator:
    """Main generator that coordinates all derived class generation."""

    def __init__(self, output_folder: Path):
        self.output_folder = output_folder
        self.modifier_gen = ModifierGenerator()

    def generate_for_module(
        self,
        module_name: str,
        module,
        base_class: Type[BaseModel],
        source_file: Path,
        user_default_exclusions: Dict[str, Set[str]],
        default_unshared_keys: Dict[str, Set[str]],
        enum_type: str,
        core_suffix: str,
        creation_fn: str,
    ) -> Dict[str, Any]:
        """Generate all derived classes for a module."""

        base_classes, concrete_classes = get_all_classes(module, base_class, "type")
        all_classes = [base_class] + base_classes + concrete_classes

        # Build generators
        core_gen = CoreGenerator(enum_type, core_suffix, creation_fn)
        layering_gen = LayeringGenerator(enum_type)
        user_default_gen = UserDefaultGenerator(source_file)

        # Build parent mapping
        parent_mapping = build_parent_mapping(all_classes)

        results = {
            "modifiers": [],
            "cores": [],
            "layerings": [],
            "user_defaults": [],
            "field_literals": [],
        }

        # Generate for base classes
        for cls in [base_class] + base_classes:
            # Modifier
            modifier = self.modifier_gen.generate(cls, base_class)
            results["modifiers"].append(modifier)

            # Core
            core = core_gen.generate(cls, base_class, "", set(), True)
            results["cores"].append(core)

            # Layering
            layering = layering_gen.generate(cls, base_class, "", True)
            results["layerings"].append(layering)

            # User Default
            user_default = user_default_gen.generate(
                cls, base_class, user_default_exclusions, parent_mapping
            )
            if user_default:
                results["user_defaults"].append(user_default)

            # Field Literal
            field_names = set(cls.model_fields.keys())
            if field_names - {"id", "name", "type", "isPreset"}:
                literal_values = ", ".join(
                    f'"{f}"'
                    for f in sorted(field_names)
                    if f not in {"id", "name", "type", "isPreset"}
                )
                results["field_literals"].append(
                    f"{cls.__name__}Fields = Literal[{literal_values}]"
                )

        # Generate for concrete classes
        for cls in concrete_classes:
            type_value = cls.model_fields["type"].default.value

            # Modifier
            modifier = self.modifier_gen.generate(cls, base_class)
            results["modifiers"].append(modifier)

            # Core
            unshared_keys = default_unshared_keys.get(type_value, set())
            core = core_gen.generate(cls, base_class, type_value, unshared_keys, False)
            results["cores"].append(core)

            # Layering
            layering = layering_gen.generate(cls, base_class, type_value, False)
            results["layerings"].append(layering)

            # User Default
            user_default = user_default_gen.generate(
                cls, base_class, user_default_exclusions, parent_mapping
            )
            if user_default:
                results["user_defaults"].append(user_default)

            # Field Literal
            field_names = set(cls.model_fields.keys())
            if field_names - {"id", "name", "type", "isPreset"}:
                literal_values = ", ".join(
                    f'"{f}"'
                    for f in sorted(field_names)
                    if f not in {"id", "name", "type", "isPreset"}
                )
                results["field_literals"].append(
                    f"{cls.__name__}Fields = Literal[{literal_values}]"
                )

        return results

    def write_output(self, content: str, filename: str, description: str):
        """Write formatted content to file."""
        formatted = ruff_format(content)
        output_file = self.output_folder / filename
        output_file.write_text(formatted)
        print(f"Generated {description} in {output_file}")

    def run(self):
        """Run the complete generation process."""
        import setta.types.section_impls
        import setta.types.code_obj_impls

        # Get source files
        section_file = Path(inspect.getfile(setta.types.section_impls))
        code_obj_file = Path(inspect.getfile(setta.types.code_obj_impls))

        # Generate sections
        print("Generating section derived classes...")
        section_results = self.generate_for_module(
            "section",
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            section_file,
            SECTION_USER_DEFAULT_EXCLUSIONS,
            DEFAULT_SECTION_UNSHARED_KEYS,
            "SectionType",
            "SectionCore",
            "create_modifier_for_section_type",
        )

        # Generate code objs
        print("Generating code obj derived classes...")
        code_obj_results = self.generate_for_module(
            "code_obj",
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            code_obj_file,
            CODE_OBJ_USER_DEFAULT_EXCLUSIONS,
            DEFAULT_CODE_OBJ_UNSHARED_KEYS,
            "CodeObjType",
            "CodeObjCore",
            "create_modifier_for_code_obj_type",
        )

        # Write modifiers
        modifier_content = f"""# Auto-generated modifier classes - DO NOT EDIT MANUALLY
# Generated from impl classes

from typing import TypedDict, Literal, Any, NotRequired
from setta.types.section_impls import (
    ChartSettings, DrawAreaCanvasSettings, SectionSize, Visibility,
    CodeLanguage, ConfigLanguage, TextBlockDisplayMode, TextBlockFormat,
    SectionType, SectionSizeMode
)
from setta.types.code_obj_impls import (
    ParameterPassingStyle, ParamNameType, ColorPickerChoice, CodeObjType
)

# ============== Section Modifiers ==============
{"".join(section_results["modifiers"])}

# ============== Code Object Modifiers ==============
{"".join(code_obj_results["modifiers"])}
"""
        self.write_output(modifier_content, "impl_modifiers.py", "modifiers")

        # Write section cores
        section_core_content = f"""# Auto-generated SectionCore classes - DO NOT EDIT MANUALLY
# Generated from section implementations

from typing import Literal, Any
from pydantic import Field

from setta.types.section_core import BaseSectionCore
from setta.types.section_impls import SectionType
from setta.types.generated.type_to_modifier import create_modifier_for_section_type
from setta.types.generated.impl_modifiers import (
{self._format_imports([f"{cls.__name__}Modifier" for cls in self._get_all_section_classes()])}
)
from setta.types.generated.impl_field_literals import (
{self._format_imports([f"{cls.__name__}Fields" for cls in self._get_all_section_classes()])}
)

# ============== Base Section Core Classes ==============
{"".join(section_results["cores"][: len(self._get_section_base_classes()) + 1])}

# ============== Concrete Section Core Classes ==============
{"".join(section_results["cores"][len(self._get_section_base_classes()) + 1 :])}
"""
        self.write_output(section_core_content, "section_cores.py", "section cores")

        # Write code obj cores
        code_obj_core_content = f"""# Auto-generated CodeObjCore classes - DO NOT EDIT MANUALLY
# Generated from code obj implementations

from typing import Literal, Any
from pydantic import Field

from setta.types.code_obj_core import BaseCodeObjCore
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.type_to_modifier import create_modifier_for_code_obj_type
from setta.types.generated.impl_modifiers import (
{self._format_imports([f"{cls.__name__}Modifier" for cls in self._get_all_code_obj_classes()])}
)
from setta.types.generated.impl_field_literals import (
{self._format_imports([f"{cls.__name__}Fields" for cls in self._get_all_code_obj_classes()])}
)

# ============== Base Code Object Core Classes ==============
{"".join(code_obj_results["cores"][: len(self._get_code_obj_base_classes()) + 1])}

# ============== Concrete Code Object Core Classes ==============
{"".join(code_obj_results["cores"][len(self._get_code_obj_base_classes()) + 1 :])}
"""
        self.write_output(code_obj_core_content, "code_obj_cores.py", "code obj cores")

        # Write layerings
        layering_content = f"""# Auto-generated ImplLayering classes - DO NOT EDIT MANUALLY
# Generated from impl modifier classes

from typing import Any, Literal
from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_modifiers import (
{
            self._format_imports(
                sorted(
                    set(
                        [
                            f"{cls.__name__}Modifier"
                            for cls in self._get_all_section_classes()
                        ]
                        + [
                            f"{cls.__name__}Modifier"
                            for cls in self._get_all_code_obj_classes()
                        ]
                    )
                )
            )
        }
)

# Base layering class
class BaseImplLayering(BaseModel):
    \"\"\"Base class for all ImplLayering types.\"\"\"
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: Any

# ============== Section Layering Classes ==============
{"".join(section_results["layerings"])}

# ============== Code Object Layering Classes ==============
{"".join(code_obj_results["layerings"])}
"""
        self.write_output(layering_content, "impl_layerings.py", "impl layerings")

        # Write user defaults
        user_default_content = f"""# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

# Section type imports
from setta.types.section_impls import (
    ChartSettings, CodeLanguage, ConfigLanguage, DrawAreaCanvasSettings,
    SectionSize, SectionSizeMode, SectionType, TextBlockDisplayMode,
    TextBlockFormat, Visibility,
)

# Code object type imports
from setta.types.code_obj_impls import (
    CodeObjType, ColorPickerChoice, ParameterPassingStyle, ParamNameType,
)

# ============== Section UserDefault Classes ==============
{"".join(section_results["user_defaults"])}

# ============== Code Object UserDefault Classes ==============
{"".join(code_obj_results["user_defaults"])}
"""
        self.write_output(user_default_content, "user_defaults.py", "user defaults")

        # Write field literals
        field_literal_content = f"""# Auto-generated Literal type aliases for impl fields - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal

# Section implementation field literals
{chr(10).join(section_results["field_literals"])}

# Code object implementation field literals
{chr(10).join(code_obj_results["field_literals"])}
"""
        self.write_output(
            field_literal_content, "impl_field_literals.py", "field literals"
        )

    def _format_imports(self, imports: List[str]) -> str:
        """Format a list of imports with proper indentation."""
        return "\n".join(f"    {imp}," for imp in imports)

    def _get_section_base_classes(self):
        import setta.types.section_impls

        return find_sub_classes(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            "type",
            True,
            False,
        )

    def _get_code_obj_base_classes(self):
        import setta.types.code_obj_impls

        return find_sub_classes(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            "type",
            True,
            False,
        )

    def _get_all_section_classes(self):
        import setta.types.section_impls

        base_classes, concrete_classes = get_all_classes(
            setta.types.section_impls, setta.types.section_impls.BaseSectionImpl, "type"
        )
        return (
            [setta.types.section_impls.BaseSectionImpl]
            + base_classes
            + concrete_classes
        )

    def _get_all_code_obj_classes(self):
        import setta.types.code_obj_impls

        base_classes, concrete_classes = get_all_classes(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            "type",
        )
        return (
            [setta.types.code_obj_impls.BaseCodeObjImpl]
            + base_classes
            + concrete_classes
        )


def main(output_folder: Path):
    """Main entry point."""
    generator = DerivedClassGenerator(output_folder)
    generator.run()


if __name__ == "__main__":
    import sys

    output_folder = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("../../backend/setta/types/generated")
    )
    main(get_absolute_path(__file__, output_folder))
