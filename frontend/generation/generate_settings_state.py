from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


def generate_settings_state() -> str:
    """
    Generate the SettingsState class with UserDefault attributes.

    The generated class will have:
    - Core settings (shortcuts, gui, backend, languageServer)
    - One attribute for each SectionType enum value (e.g., callableSectionDefault)
    - One attribute for each CodeObjType enum value (e.g., sliderParamDefault)
    """
    # Import the enums
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

    # Join imports
    imports_str = "\n".join(imports)

    # Build section defaults
    section_defaults = []
    for section_type in sorted(SectionType, key=lambda x: x.value):
        attr_name = (
            section_type.value[0].lower() + section_type.value[1:] + "SectionDefault"
        )
        class_name = f"UserDefault{section_type.value}SectionImpl"
        section_defaults.append(f"""    {attr_name}: {class_name} = Field(
        default_factory={class_name}
    )""")

    section_defaults_str = "\n".join(section_defaults)

    # Build code obj defaults
    code_obj_defaults = []
    for code_obj_type in sorted(CodeObjType, key=lambda x: x.value):
        attr_name = code_obj_type.value[0].lower() + code_obj_type.value[1:] + "Default"
        class_name = f"UserDefault{code_obj_type.value}CodeObjImpl"
        code_obj_defaults.append(f"""    {attr_name}: {class_name} = Field(
        default_factory={class_name}
    )""")

    code_obj_defaults_str = "\n".join(code_obj_defaults)

    # Generate the complete class
    output = f"""# Auto-generated SettingsState class - DO NOT EDIT MANUALLY
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

    return output


def main(output_file: Path):
    """Generate the SettingsState class."""
    code = generate_settings_state()
    formatted = ruff_format(code)
    output_file.write_text(formatted)
    print(f"Generated SettingsState class in {output_file}")


if __name__ == "__main__":
    main(
        get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
        / "settings_state.py"
    )
