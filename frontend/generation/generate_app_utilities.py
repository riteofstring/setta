#!/usr/bin/env python3
"""Simplified app utilities generator."""

from pathlib import Path

from setta.utils.utils import get_absolute_path

# When running as a script, use local import
if __name__ == "__main__":
    from generation_base_generator import BaseGenerator, UnionGenerator
else:
    from .generation_base_generator import BaseGenerator, UnionGenerator

import setta.types.code_obj_impls
import setta.types.section_impls
from setta.types.websocket import (
    WebsocketMsgTypeForBackend,
    WebsocketMsgTypeForFrontend,
)


class AppUtilitiesGenerator(BaseGenerator):
    """Generates application utilities."""

    SETTINGS_STATE_TEMPLATE = """# Auto-generated SettingsState class - DO NOT EDIT MANUALLY
# Generated from SectionType and CodeObjType enums

from pydantic import BaseModel, Field

from setta.types.settings_state import SettingsShortcuts, SettingsGUI, SettingsBackend

# Import all UserDefault classes
from setta.types.generated.user_defaults import (
{imports}
)


class SettingsState(BaseModel, extra="forbid"):
    \"\"\"Application settings state including all user defaults.\"\"\"
    
    # Core settings
    shortcuts: SettingsShortcuts = Field(default_factory=SettingsShortcuts)
    gui: SettingsGUI = Field(default_factory=SettingsGUI)
    backend: SettingsBackend = Field(default_factory=SettingsBackend)
    languageServer: dict = Field(default_factory=dict)  # TODO: make a model for this?
    
    # Section defaults
{section_defaults}
    
    # Code object defaults
{code_obj_defaults}
"""

    CREATION_FUNCTION_TEMPLATE = """
def create{class_name}(
    defaults: UserDefault{class_name},
    **overrides
) -> {class_name}:
    \"\"\"Create {class_name} with user defaults.\"\"\"
    return {class_name}(**{{**defaults.model_dump(), **overrides}})
"""

    CREATION_FUNCTIONS_HEADER = """# Auto-generated creation functions - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

# Import implementation classes
from setta.types.section_impls import (
{section_imports}
)

from setta.types.code_obj_impls import (
{code_obj_imports}
)

# Import user default classes
from setta.types.generated.user_defaults import (
{user_default_imports}
)

"""

    def __init__(self, output_folder: Path):
        super().__init__(output_folder)
        self.union_gen = UnionGenerator()

    def run(self):
        """Run the generation process."""
        # Generate SettingsState
        self._generate_settings_state()

        # Generate creation functions
        self._generate_creation_functions()

        # Generate WebSocket unions
        self._generate_websocket_unions()

        # Generate format utils (if needed)
        self._generate_format_utils()

        print("Application utilities generation complete!")

    def _generate_settings_state(self):
        """Generate the SettingsState class."""
        from setta.types.code_obj_impls import CodeObjType
        from setta.types.section_impls import SectionType

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

        content = self.SETTINGS_STATE_TEMPLATE.format(
            imports=imports_str,
            section_defaults="\n".join(section_defaults),
            code_obj_defaults="\n".join(code_obj_defaults),
        )

        self.write_output(content, "settings_state.py", "SettingsState class")

    def _generate_creation_functions(self):
        """Generate creation functions for impl classes."""
        # Get concrete classes
        section_classes = self.find_subclasses(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            concrete_only=True,
        )

        code_obj_classes = self.find_subclasses(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            concrete_only=True,
        )

        # Build imports
        section_imports = [f"    {cls.__name__}," for cls in section_classes]
        code_obj_imports = [f"    {cls.__name__}," for cls in code_obj_classes]
        user_default_imports = [
            f"    UserDefault{cls.__name__},"
            for cls in section_classes + code_obj_classes
        ]

        header = self.CREATION_FUNCTIONS_HEADER.format(
            section_imports="\n".join(section_imports),
            code_obj_imports="\n".join(code_obj_imports),
            user_default_imports="\n".join(user_default_imports),
        )

        # Generate functions
        functions = []

        functions.append("\n# ============== Section Creation Functions ==============")
        for cls in section_classes:
            functions.append(
                self.CREATION_FUNCTION_TEMPLATE.format(class_name=cls.__name__)
            )

        functions.append(
            "\n# ============== Code Object Creation Functions =============="
        )
        for cls in code_obj_classes:
            functions.append(
                self.CREATION_FUNCTION_TEMPLATE.format(class_name=cls.__name__)
            )

        content = header + "\n".join(functions)
        self.write_output(content, "creation_functions.py", "creation functions")

    def _generate_websocket_unions(self):
        """Generate WebSocket message unions."""
        content = """# Auto-generated WebSocket type unions - DO NOT EDIT MANUALLY
# Generated from WebSocket message types

from typing import Annotated, Union
from pydantic import Field, TypeAdapter

"""

        # Import message classes
        backend_msg_names = [
            f"WebsocketMsg{msg_type.name}" for msg_type in WebsocketMsgTypeForBackend
        ]
        frontend_msg_names = [
            f"WebsocketMsg{msg_type.name}" for msg_type in WebsocketMsgTypeForFrontend
        ]

        all_msg_names = sorted(set(backend_msg_names + frontend_msg_names))
        content += f"from setta.types.websocket import {', '.join(all_msg_names)}\n"

        # Generate backend union
        backend_type_values = [msg_type.name for msg_type in WebsocketMsgTypeForBackend]
        content += self.union_gen.generate_union(
            "WebsocketMsgForBackendUnion",
            backend_msg_names,
            "messageType",
            backend_type_values,
        )
        content += "\n"

        # Generate frontend union
        frontend_type_values = [
            msg_type.name for msg_type in WebsocketMsgTypeForFrontend
        ]
        content += self.union_gen.generate_union(
            "WebsocketMsgForFrontendUnion",
            frontend_msg_names,
            "messageType",
            frontend_type_values,
        )

        self.write_output(content, "websocket_type_unions.py", "WebSocket unions")

    def _generate_format_utils(self):
        """Generate formatting utilities."""
        content = """import os
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

        self.write_output(content, "utils.py", "format utilities")


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
