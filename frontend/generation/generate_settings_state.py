from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import get_impl_classes


def generate_settings_state() -> str:
    """
    Generate the SettingsState class with UserDefault attributes.

    The generated class will have:
    - Core settings (shortcuts, gui, backend, languageServer)
    - One attribute for each SectionType enum value (e.g., callableSectionDefault)
    - One attribute for each CodeObjType enum value (e.g., sliderParamDefault)
    """
    classes = get_impl_classes()
    section_keys = sorted({k: v for k, v in classes.items() if v.is_for_section}.keys())
    code_obj_keys = sorted(
        {k: v for k, v in classes.items() if v.is_for_code_obj}.keys()
    )

    imports = []
    defaults = []
    for key in section_keys + code_obj_keys:
        cls_info = classes[key]
        if not cls_info.type_has_default:
            continue
        suffix = "SectionDefault" if cls_info.is_for_section else "CodeObjDefault"
        attr_name = cls_info.type_value[0].lower() + cls_info.type_value[1:] + suffix
        class_name = cls_info.user_default_name
        imports.append(class_name)
        defaults.append(f"""    {attr_name}: {class_name} = Field(
        default_factory={class_name}
    )""")

    defaults_str = "\n".join(defaults)

    imports_str = ",".join(imports)

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
    
{defaults_str}
"""

    return output


def main(output_file: Path):
    """Generate the SettingsState class."""
    code = generate_settings_state()
    formatted = ruff_format(code)
    output_file.write_text(formatted)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(
        get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
        / "settings_state.py"
    )
