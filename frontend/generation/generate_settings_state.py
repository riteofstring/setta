from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_impl_classes


def get_user_default_attr_name(cls_info: ImplClassInfoForGeneration):
    suffix = "SectionDefault" if cls_info.is_for_section else "CodeObjDefault"
    return cls_info.type_value[0].lower() + cls_info.type_value[1:] + suffix


def generate_settings_state() -> str:
    """
    Generate the SettingsState class with UserDefault attributes.

    The generated class will have:
    - Core settings (shortcuts, gui, backend, chatWindowing, languageServer)
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
        attr_name = get_user_default_attr_name(cls_info)
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

from setta.types.settings_state import (
    ChatWindowingSettings,
    SectionSizingPolicy,
    SettingsBackend,
    SettingsGUI,
    SettingsShortcuts,
    get_default_language_server_settings,
)

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
    chatWindowing: ChatWindowingSettings = Field(
        default_factory=ChatWindowingSettings
    )
    sectionSizingPolicy: SectionSizingPolicy = Field(
        default_factory=SectionSizingPolicy
    )
    languageServer: dict = Field(
        default_factory=get_default_language_server_settings
    )
    
{defaults_str}
"""

    return output


def generate_default_getters():
    classes = get_impl_classes()
    section_impl_class_info = {
        k: v for k, v in classes.items() if v.is_for_section and v.type_has_default
    }
    code_obj_impl_class_info = {
        k: v for k, v in classes.items() if v.is_for_code_obj and v.type_has_default
    }

    code = """
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType

def get_user_default_section_from_settings(settings: SettingsState, type: SectionType):
    match type:
"""
    for v in section_impl_class_info.values():
        code += f"""
        case SectionType.{v.type_value}:
            return settings.{get_user_default_attr_name(v)}
"""

    code += """
def get_user_default_code_obj_from_settings(settings: SettingsState, type: CodeObjType):
    match type:
"""
    for v in code_obj_impl_class_info.values():
        code += f"""
        case CodeObjType.{v.type_value}:
            return settings.{get_user_default_attr_name(v)}
"""

    return code


def main(output_file: Path):
    """Generate the SettingsState class."""
    code = generate_settings_state()
    code += generate_default_getters()
    formatted = ruff_format(code)
    output_file.write_text(formatted)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(
        get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
        / "settings_state.py"
    )
