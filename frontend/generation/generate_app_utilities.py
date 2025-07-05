#!/usr/bin/env python3
"""
Application utilities generator.

This script generates:
1. SettingsState class - Main settings state with all user defaults
2. Creation functions - Functions to create impl instances with user defaults
3. Additional application-specific utilities as needed
"""

from pathlib import Path
from typing import List, Type

from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


# ============== Common Utilities ==============


def find_sub_classes(
    module,
    base_class: Type[BaseModel],
    discriminator: str,
    return_base_classes: bool,
    return_input_base_class: bool,
) -> List[Type[BaseModel]]:
    """Find subclasses of a base class in a module."""
    import inspect

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


# ============== Settings State Generator ==============


class SettingsStateGenerator:
    """Generates the SettingsState class with all user defaults."""

    def generate(self) -> str:
        """Generate the SettingsState class."""
        from setta.types.section_impls import SectionType
        from setta.types.code_obj_impls import CodeObjType

        # Build imports list
        imports = []

        # Process section types (sorted for consistent output)
        for section_type in sorted(SectionType, key=lambda x: x.value):
            class_name = f"UserDefault{section_type.value}SectionImpl"
            imports.append(f"    {class_name},")

        # Process code obj types (sorted for consistent output)
        for code_obj_type in sorted(CodeObjType, key=lambda x: x.value):
            class_name = f"UserDefault{code_obj_type.value}CodeObjImpl"
            imports.append(f"    {class_name},")

        imports_str = "\n".join(imports)

        # Build section defaults
        section_defaults = []
        for section_type in sorted(SectionType, key=lambda x: x.value):
            attr_name = (
                section_type.value[0].lower()
                + section_type.value[1:]
                + "SectionDefault"
            )
            class_name = f"UserDefault{section_type.value}SectionImpl"
            section_defaults.append(f"""    {attr_name}: {class_name} = Field(
        default_factory={class_name}
    )""")

        section_defaults_str = "\n".join(section_defaults)

        # Build code obj defaults
        code_obj_defaults = []
        for code_obj_type in sorted(CodeObjType, key=lambda x: x.value):
            attr_name = (
                code_obj_type.value[0].lower() + code_obj_type.value[1:] + "Default"
            )
            class_name = f"UserDefault{code_obj_type.value}CodeObjImpl"
            code_obj_defaults.append(f"""    {attr_name}: {class_name} = Field(
        default_factory={class_name}
    )""")

        code_obj_defaults_str = "\n".join(code_obj_defaults)

        # Generate the complete class
        return f"""# Auto-generated SettingsState class - DO NOT EDIT MANUALLY
# Generated from SectionType and CodeObjType enums

from pydantic import BaseModel, Field

from setta.types.settings_state import SettingsShortcuts, SettingsGUI, SettingsBackend

# Import all UserDefault classes
from setta.types.generated.user_defaults import (
{imports_str}
)


class SettingsState(BaseModel, extra="forbid"):
    \"\"\"Application settings state including all user defaults.\"\"\"
    
    # Core settings
    shortcuts: SettingsShortcuts = Field(default_factory=SettingsShortcuts)
    gui: SettingsGUI = Field(default_factory=SettingsGUI)
    backend: SettingsBackend = Field(default_factory=SettingsBackend)
    languageServer: dict = Field(default_factory=dict)  # TODO: make a model for this?
    
    # Section defaults
{section_defaults_str}
    
    # Code object defaults
{code_obj_defaults_str}
"""


# ============== Creation Functions Generator ==============


class CreationFunctionsGenerator:
    """Generates creation functions for impl instances."""

    def generate_function(self, class_name: str) -> str:
        """Generate a creation function for a specific class."""
        # Skip base classes - they're abstract
        if class_name.startswith("Base"):
            return ""

        user_default_class = f"UserDefault{class_name}"

        return f"""
def create{class_name}(
    defaults: {user_default_class},
    **overrides
) -> {class_name}:
    \"\"\"Create {class_name} with user defaults.\"\"\"
    return {class_name}(**{{**defaults.model_dump(), **overrides}})
"""

    def generate(self) -> str:
        """Generate all creation functions."""
        import setta.types.section_impls
        import setta.types.code_obj_impls

        # Get all concrete classes
        section_classes = find_sub_classes(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            "type",
            False,  # Only concrete classes
            False,
        )

        code_obj_classes = find_sub_classes(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            "type",
            False,  # Only concrete classes
            False,
        )

        # Build imports
        section_imports = [cls.__name__ for cls in section_classes]
        code_obj_imports = [cls.__name__ for cls in code_obj_classes]

        section_imports_str = ",\n    ".join(section_imports)
        code_obj_imports_str = ",\n    ".join(code_obj_imports)

        # Build user default imports
        user_default_section_imports = [
            f"UserDefault{cls.__name__}" for cls in section_classes
        ]
        user_default_code_obj_imports = [
            f"UserDefault{cls.__name__}" for cls in code_obj_classes
        ]

        user_default_imports_str = ",\n    ".join(
            user_default_section_imports + user_default_code_obj_imports
        )

        # Generate functions
        section_functions = []
        for cls in section_classes:
            func = self.generate_function(cls.__name__)
            if func:
                section_functions.append(func)

        code_obj_functions = []
        for cls in code_obj_classes:
            func = self.generate_function(cls.__name__)
            if func:
                code_obj_functions.append(func)

        section_functions_str = "\n".join(section_functions)
        code_obj_functions_str = "\n".join(code_obj_functions)

        # Build the complete module
        return f"""# Auto-generated creation functions - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

# Import implementation classes
from setta.types.section_impls import (
    {section_imports_str}
)

from setta.types.code_obj_impls import (
    {code_obj_imports_str}
)

# Import user default classes
from setta.types.generated.user_defaults import (
    {user_default_imports_str}
)


# ============== Section Creation Functions ==============
{section_functions_str}

# ============== Code Object Creation Functions ==============
{code_obj_functions_str}
"""


# ============== Additional Utilities ==============


class UtilityCodeGenerator:
    """Generates additional utility code as needed."""

    def generate_format_utils(self) -> str:
        """Generate formatting utilities."""
        return """import os
import subprocess


def format_generated_code(output_file):
    # Suppress Node warnings
    env = os.environ.copy()
    env["NODE_NO_WARNINGS"] = "1"

    try:
        subprocess.run(
            ["npx", "prettier", str(output_file), "--write"], check=True, env=env
        )
        print(f"Formatted {output_file} with Prettier")
    except subprocess.CalledProcessError:
        print("Warning: Prettier formatting failed.")
"""


# ============== Main Generator ==============


class AppUtilitiesGenerator:
    """Main generator for application utilities."""

    def __init__(self, output_folder: Path):
        self.output_folder = output_folder
        self.settings_gen = SettingsStateGenerator()
        self.creation_gen = CreationFunctionsGenerator()
        self.utility_gen = UtilityCodeGenerator()

    def write_output(self, content: str, filename: str, description: str):
        """Write formatted content to file."""
        formatted = ruff_format(content)
        output_file = self.output_folder / filename
        output_file.write_text(formatted)
        print(f"Generated {description} in {output_file}")

    def run(self):
        """Run the complete generation process."""
        # Generate SettingsState
        print("Generating SettingsState class...")
        settings_code = self.settings_gen.generate()
        self.write_output(settings_code, "settings_state.py", "SettingsState class")

        # Generate creation functions
        print("Generating creation functions...")
        creation_code = self.creation_gen.generate()
        self.write_output(creation_code, "creation_functions.py", "creation functions")

        # Generate format utils
        print("Generating format utilities...")
        format_utils_code = self.utility_gen.generate_format_utils()
        self.write_output(format_utils_code, "utils.py", "format utilities")

        print("Application utilities generation complete!")


def main(output_folder: Path):
    """Main entry point."""
    generator = AppUtilitiesGenerator(output_folder)
    generator.run()


if __name__ == "__main__":
    import sys

    output_folder = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("../../backend/setta/types/generated")
    )
    # Note: This script should be run AFTER generate_derived_classes.py
    # since it depends on generated user defaults
    main(get_absolute_path(__file__, output_folder))
