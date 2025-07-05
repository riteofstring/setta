#!/usr/bin/env python3
"""Simplified derived class generator."""

import inspect
from pathlib import Path
from typing import Any, Dict, List, Set, Type

from pydantic import BaseModel
from setta.utils.utils import get_absolute_path

# When running as a script, use local import
if __name__ == "__main__":
    from generation_base_generator import BaseGenerator, UnionGenerator
else:
    from .generation_base_generator import BaseGenerator, UnionGenerator

import setta.types.code_obj_impls
import setta.types.section_impls


class DerivedClassGenerator(BaseGenerator):
    """Generates derived classes from impl classes."""

    # Templates for different class types
    MODIFIER_TEMPLATE = """
class {name}Modifier({parent}):
{fields}
"""

    CORE_TEMPLATE = """
class {name}({parent}):
    {type_field}
    sharedModifier: {modifier_type}{modifier_default}
    unsharedKeys: list[{field_literal}] = Field(default_factory={unshared_default})
"""

    LAYERING_TEMPLATE = """
class {name}({parent}):
    {docstring}type: {type_annotation}
    modifier: {modifier_type}  # type: ignore[assignment]
"""

    USER_DEFAULT_TEMPLATE = """
class UserDefault{name}({parent}, extra="forbid"):
    \"\"\"User-configurable defaults for {name}\"\"\"
{fields}
"""

    def __init__(self, output_folder: Path):
        super().__init__(output_folder)
        self.union_gen = UnionGenerator()

        # Configuration for what to exclude
        self.modifier_exclusions = {"id", "name", "isPreset"}

        # Default user default exclusions
        self.user_default_exclusions = {
            "default": {"id", "name", "type", "isPreset"},
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

        # Code obj user default exclusions
        self.code_obj_user_default_exclusions = {
            "default": {"id", "name", "type", "isPreset"},
            "BaseCodeObjImpl": {"id", "name", "type", "description", "isPreset"},
            "BaseParamCodeObjImpl": {"id", "name", "type", "passingStyle"},
            "BaseChildlessCodeObjImpl": {"id", "name", "type"},
            "BaseParentCodeObjImpl": {"id", "name", "type", "children"},
        }

        # Default unshared keys configuration
        self.default_unshared_keys = {
            "SectionCore": {
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
            },
            "CodeObjCore": {
                "CodeCallable": set(),
                "CodeParam": {"value"},
                "TextParam": {"value"},
                "SliderParam": {"value"},
                "SwitchParam": {"value"},
                "ColorPickerParam": {"value"},
                "DropdownParam": {"value"},
                "PasswordParam": {"value"},
                "NestedParam": set(),
            },
        }

    def generate_for_module(
        self,
        module_name: str,
        module: Any,
        base_class: Type[BaseModel],
        source_file: Path,
    ) -> Dict[str, List[str]]:
        """Generate all derived classes for a module."""
        # Get all classes
        base_classes = self.find_subclasses(module, base_class)
        concrete_classes = self.find_subclasses(module, base_class, concrete_only=True)
        all_classes = [base_class] + base_classes + concrete_classes

        # Determine core suffix based on module
        core_suffix = "SectionCore" if "section" in module_name else "CodeObjCore"

        results = {
            "modifiers": [],
            "cores": [],
            "layerings": [],
            "user_defaults": [],
            "field_literals": [],
        }

        # Generate for each class
        for cls in all_classes:
            is_base = cls == base_class or cls in base_classes
            is_concrete = cls in concrete_classes
            type_value = self.extract_type_value(cls.__name__) if is_concrete else ""

            # Generate modifier
            results["modifiers"].append(self._generate_modifier(cls, base_class))

            # Generate core
            results["cores"].append(
                self._generate_core(
                    cls, base_class, type_value, is_concrete, core_suffix
                )
            )

            # Generate layering
            results["layerings"].append(
                self._generate_layering(cls, type_value, is_concrete, is_base)
            )

            # Generate user default
            exclusions = (
                self.user_default_exclusions
                if "section" in module_name
                else self.code_obj_user_default_exclusions
            )
            user_default = self._generate_user_default(cls, source_file, exclusions)
            if user_default:
                results["user_defaults"].append(user_default)

            # Generate field literal
            field_literal = self._generate_field_literal(cls)
            if field_literal:
                results["field_literals"].append(field_literal)

        return results

    def _generate_modifier(
        self, cls: Type[BaseModel], base_class: Type[BaseModel]
    ) -> str:
        """Generate a modifier class."""
        # Get fields to include
        fields = []
        for field_name, field_info in cls.model_fields.items():
            # Skip excluded fields for base class
            if cls == base_class and field_name in self.modifier_exclusions:
                continue

            # For non-base classes, skip inherited fields (except type)
            if cls != base_class and field_name != "type":
                if any(
                    hasattr(parent, "model_fields")
                    and field_name in parent.model_fields
                    for parent in cls.__bases__
                ):
                    continue

            # Add field
            field_type = self.python_type_to_str(field_info.annotation)
            if field_name != "type":
                field_type = f"NotRequired[{field_type}]"
            fields.append(f"    {field_name}: {field_type}")

        # Determine parent(s)
        if cls == base_class:
            parent = "TypedDict"
        else:
            parent_modifiers = []
            for parent_cls in cls.__bases__:
                if hasattr(parent_cls, "model_fields"):
                    parent_modifiers.append(f"{parent_cls.__name__}Modifier")
            parent = ", ".join(parent_modifiers) if parent_modifiers else "TypedDict"

        fields_str = "\n".join(fields) if fields else "    pass"

        return self.MODIFIER_TEMPLATE.format(
            name=cls.__name__, parent=parent, fields=fields_str
        )

    def _generate_core(
        self,
        cls: Type[BaseModel],
        base_class: Type[BaseModel],
        type_value: str,
        is_concrete: bool,
        core_suffix: str,
    ) -> str:
        """Generate a core class."""
        # Determine core class name
        if not is_concrete:
            base_name = cls.__name__[:-4]  # Remove "Impl"
            if base_name.endswith("Section") or base_name.endswith("CodeObj"):
                core_name = base_name + "Core"
            else:
                core_name = base_name + core_suffix
        else:
            core_name = type_value + core_suffix

        # Determine parent(s)
        parent_names = []
        if cls == base_class:
            parent_names = ["BaseModel"]
        else:
            for parent in cls.__bases__:
                if hasattr(parent, "model_fields"):
                    parent_base = parent.__name__[:-4]
                    if parent_base.endswith("Section") or parent_base.endswith(
                        "CodeObj"
                    ):
                        parent_names.append(parent_base + "Core")
                    else:
                        parent_names.append(parent_base + core_suffix)

        parent = ", ".join(parent_names) if parent_names else "BaseModel"

        # Determine modifier type
        modifier_type = cls.__name__ + "Modifier"

        # Build core class
        if is_concrete:
            # Get enum type
            enum_type = "SectionType" if "Section" in core_suffix else "CodeObjType"
            type_field = (
                f"type: Literal[{enum_type}.{type_value}] = {enum_type}.{type_value}"
            )

            # Get unshared keys
            unshared_keys = self.default_unshared_keys.get(core_suffix, {}).get(
                type_value, set()
            )
            if unshared_keys:
                unshared_default = (
                    f"lambda: [{', '.join(f'"{k}"' for k in sorted(unshared_keys))}]"
                )
            else:
                unshared_default = "list"

            modifier_default = f" = Field(default_factory=lambda: {modifier_type}(type={enum_type}.{type_value}))"
        else:
            type_field = "type: Any"
            unshared_default = "list"
            modifier_default = ""

            # Add extra fields for root base class
            if cls == base_class:
                type_field = """id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str = ""
    type: Any"""

        field_literal = f"{cls.__name__}Fields"

        return self.CORE_TEMPLATE.format(
            name=core_name,
            parent=parent,
            type_field=type_field,
            modifier_type=modifier_type,
            modifier_default=modifier_default,
            field_literal=field_literal,
            unshared_default=unshared_default,
        )

    def _generate_layering(
        self, cls: Type[BaseModel], type_value: str, is_concrete: bool, is_base: bool
    ) -> str:
        """Generate a layering class."""
        layering_name = cls.__name__[:-4] + "ImplLayering"
        modifier_name = cls.__name__ + "Modifier"

        # Determine parent
        parent_names = []
        for parent in cls.__bases__:
            if hasattr(parent, "model_fields") and parent.__name__.endswith("Impl"):
                parent_names.append(parent.__name__[:-4] + "ImplLayering")

        parent = ", ".join(parent_names) if parent_names else "BaseImplLayering"
        
        # Determine type annotation and docstring
        if is_concrete:
            enum_type = "SectionType" if "Section" in cls.__name__ else "CodeObjType"
            type_annotation = (
                f"Literal[{enum_type}.{type_value}] = {enum_type}.{type_value}"
            )
            docstring = ""
        else:
            type_annotation = "Any"
            # Add docstring for base classes
            type_name = layering_name.replace("ImplLayering", "").replace("Base", "")
            docstring = f'"""Base class for {type_name} layering types."""\n    '

        return self.LAYERING_TEMPLATE.format(
            name=layering_name,
            parent=parent,
            type_annotation=type_annotation,
            modifier_type=modifier_name,
            docstring=docstring,
        )

    def _generate_user_default(
        self,
        cls: Type[BaseModel],
        source_file: Path,
        exclusions_map: Dict[str, Set[str]],
    ) -> str:
        """Generate a user default class by transforming source."""
        class_name = cls.__name__
        exclusions = exclusions_map.get(class_name, exclusions_map["default"])

        # Extract class source
        source_lines = source_file.read_text().splitlines(keepends=True)
        class_lines, _ = self._extract_class_source_info(source_lines, class_name)
        if not class_lines:
            return ""

        # Transform to UserDefault
        new_lines = []
        i = 0

        while i < len(class_lines):
            line = class_lines[i]

            if line.strip().startswith(f"class {class_name}"):
                # Determine parent
                parent = None
                for parent_cls in cls.__bases__:
                    if hasattr(parent_cls, "model_fields") and parent_cls.__name__.endswith("Impl"):
                        parent = f"UserDefault{parent_cls.__name__}"
                        break
                if not parent:
                    parent = "BaseModel"

                # Create new class definition
                indent = " " * (len(line) - len(line.lstrip()))
                new_class_def = f'{indent}class UserDefault{class_name}({parent}, extra="forbid"):\n'
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

    def _extract_class_source_info(
        self, source_lines: List[str], class_name: str
    ) -> tuple[List[str], str]:
        """Extract source lines for a specific class."""
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
                    raise ValueError(
                        f"Could not determine indent level for {class_name}"
                    )
                if line.strip() == "":
                    class_lines.append(line)
                elif len(line) - len(line.lstrip()) > indent_level:
                    class_lines.append(line)
                else:
                    # End of class
                    break

        return class_lines, parent_class or ""

    def _generate_field_literal(self, cls: Type[BaseModel]) -> str:
        """Generate field literal type."""
        field_names = set(cls.model_fields.keys())
        excluded = {"id", "name", "type", "isPreset"}

        relevant_fields = field_names - excluded
        if not relevant_fields:
            return ""

        literal_values = ", ".join(f'"{f}"' for f in sorted(relevant_fields))
        return f"{cls.__name__}Fields = Literal[{literal_values}]"

    def run(self):
        """Run the generation process."""
        # Generate for sections
        section_results = self.generate_for_module(
            "section",
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            Path(inspect.getfile(setta.types.section_impls)),
        )

        # Generate for code objs
        code_obj_results = self.generate_for_module(
            "code_obj",
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            Path(inspect.getfile(setta.types.code_obj_impls)),
        )

        # Write output files
        self._write_modifiers(section_results, code_obj_results)
        self._write_cores(section_results, code_obj_results)
        self._write_layerings(section_results, code_obj_results)
        self._write_user_defaults(section_results, code_obj_results)
        self._write_field_literals(section_results, code_obj_results)

    def _write_modifiers(self, section_results, code_obj_results):
        """Write modifier classes."""
        content = """# Auto-generated modifier classes - DO NOT EDIT MANUALLY
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
{section_modifiers}

# ============== Code Object Modifiers ==============
{code_obj_modifiers}
""".format(
            section_modifiers="".join(section_results["modifiers"]),
            code_obj_modifiers="".join(code_obj_results["modifiers"]),
        )

        self.write_output(content, "impl_modifiers.py", "modifiers")

    def _write_cores(self, section_results, code_obj_results):
        """Write core classes."""
        # Extract base and concrete core classes
        base_section_cores = []
        concrete_section_cores = []
        for core in section_results["cores"]:
            if "Literal[SectionType." in core:
                concrete_section_cores.append(core)
            else:
                base_section_cores.append(core)

        base_code_obj_cores = []
        concrete_code_obj_cores = []
        for core in code_obj_results["cores"]:
            if "Literal[CodeObjType." in core:
                concrete_code_obj_cores.append(core)
            else:
                base_code_obj_cores.append(core)

        # Generate section cores
        section_core_content = f"""# Auto-generated SectionCore classes - DO NOT EDIT MANUALLY
# Generated from section implementations

from typing import Literal, Any
from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.types.section_impls import SectionType
from setta.types.generated.impl_modifiers import (
{self._format_core_imports([cls.__name__ + "Modifier" for cls in self._get_all_section_classes()])}
)
from setta.types.generated.impl_field_literals import (
{self._format_core_imports([cls.__name__ + "Fields" for cls in self._get_all_section_classes()])}
)

# ============== Base Section Core Classes ==============
{"".join(base_section_cores)}

# ============== Concrete Section Core Classes ==============
{"".join(concrete_section_cores)}
"""
        self.write_output(section_core_content, "section_cores.py", "section cores")

        # Generate code obj cores
        code_obj_core_content = f"""# Auto-generated CodeObjCore classes - DO NOT EDIT MANUALLY
# Generated from code obj implementations

from typing import Literal, Any
from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_modifiers import (
{self._format_core_imports([cls.__name__ + "Modifier" for cls in self._get_all_code_obj_classes()])}
)
from setta.types.generated.impl_field_literals import (
{self._format_core_imports([cls.__name__ + "Fields" for cls in self._get_all_code_obj_classes()])}
)

# ============== Base Code Object Core Classes ==============
{"".join(base_code_obj_cores)}

# ============== Concrete Code Object Core Classes ==============
{"".join(concrete_code_obj_cores)}
"""
        self.write_output(code_obj_core_content, "code_obj_cores.py", "code obj cores")

    def _write_layerings(self, section_results, code_obj_results):
        """Write layering classes."""
        content = f"""# Auto-generated ImplLayering classes - DO NOT EDIT MANUALLY
# Generated from impl modifier classes

from typing import Any, Literal
from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_modifiers import (
{self._format_core_imports(sorted(set([cls.__name__ + "Modifier" for cls in self._get_all_section_classes() + self._get_all_code_obj_classes()])))}
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
        self.write_output(content, "impl_layerings.py", "impl layerings")

    def _write_user_defaults(self, section_results, code_obj_results):
        """Write user default classes."""
        content = f"""# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY
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
        self.write_output(content, "user_defaults.py", "user defaults")

    def _write_field_literals(self, section_results, code_obj_results):
        """Write field literal types."""
        content = f"""# Auto-generated Literal type aliases for impl fields - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal

# Section implementation field literals
{chr(10).join(section_results["field_literals"])}

# Code object implementation field literals
{chr(10).join(code_obj_results["field_literals"])}
"""
        self.write_output(content, "impl_field_literals.py", "field literals")

    def _format_core_imports(self, imports: List[str]) -> str:
        """Format a list of imports with proper indentation."""
        return "\n".join(f"    {imp}," for imp in imports)

    def _get_all_section_classes(self):
        import setta.types.section_impls

        base_classes = self.find_subclasses(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
        )
        concrete_classes = self.find_subclasses(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            concrete_only=True,
        )
        return (
            [setta.types.section_impls.BaseSectionImpl]
            + base_classes
            + concrete_classes
        )

    def _get_all_code_obj_classes(self):
        import setta.types.code_obj_impls

        base_classes = self.find_subclasses(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
        )
        concrete_classes = self.find_subclasses(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            concrete_only=True,
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
