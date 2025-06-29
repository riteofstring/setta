from pathlib import Path
from typing import Dict, Set

from pydantic import BaseModel
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes

# Default unsharedKeys for each section type
# Add or modify entries here to set default unshared keys
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

# Default unsharedKeys for each code obj type
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


def generate_core_class(
    type_name: str,
    impl_class: type[BaseModel],
    core_class_suffix: str,
    modifier_suffix: str,
    default_keys: Set[str],
    enum_prefix: str,
    modifier_creation_fn_name: str,
) -> str:
    """Generate a single Core class definition."""

    # Generate default factory
    if default_keys:
        # Sort for consistent output
        sorted_default_keys = sorted(default_keys)
        default_values = ", ".join(f'"{key}"' for key in sorted_default_keys)
        default_factory = f"lambda: {{{default_values}}}"
    else:
        default_factory = "set"

    # Get the field literal type name
    field_literal_type = f"{impl_class.__name__}Fields"

    # Generate the class definition
    class_def = f"""
class {type_name}{core_class_suffix}(Base{core_class_suffix}):
    type: Literal[{enum_prefix}.{type_name}] = {enum_prefix}.{type_name}
    sharedModifier: {type_name}{modifier_suffix} = Field(default_factory=lambda: {modifier_creation_fn_name}({enum_prefix}.{type_name}))
    unsharedKeys: set[{field_literal_type}] = Field(default_factory={default_factory})
"""

    return class_def


def generate_section_cores() -> str:
    """Generate all SectionCore classes."""
    import setta.types.section_impls

    # Get all concrete section impl classes
    concrete_classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        False,  # Only concrete classes
        False,
    )

    # Sort classes by their type value for consistent output
    concrete_classes.sort(key=lambda cls: cls.model_fields["type"].default.value)

    # Generate modifier imports list
    modifier_imports = []
    field_literal_imports = []
    for cls in concrete_classes:
        section_type = cls.model_fields["type"].default.value
        modifier_imports.append(f"    {section_type}SectionImplModifier,")
        field_literal_imports.append(f"    {cls.__name__}Fields,")
    modifier_imports_str = "\n".join(modifier_imports)
    field_literal_imports_str = "\n".join(field_literal_imports)

    # Generate imports
    imports = f"""from typing import Literal
from pydantic import Field

from setta.types.section_core import BaseSectionCore
from setta.types.section_impls import SectionType

from setta.types.generated.type_to_modifier import create_modifier_for_section_type
from setta.types.generated.impl_modifiers import (
{modifier_imports_str}
)
from setta.types.generated.impl_field_literals import (
{field_literal_imports_str}
)"""

    # Generate class definitions
    class_definitions = []
    for cls in concrete_classes:
        section_type = cls.model_fields["type"].default.value
        default_keys = DEFAULT_SECTION_UNSHARED_KEYS[section_type]
        class_def = generate_core_class(
            section_type,
            cls,
            "SectionCore",
            "SectionImplModifier",
            default_keys,
            "SectionType",
            "create_modifier_for_section_type",
        )
        class_definitions.append(class_def)

    # Combine all parts
    header = """# Auto-generated SectionCore classes - DO NOT EDIT MANUALLY
# Generated from section implementations

"""

    classes_str = "\n".join(class_definitions)

    return f"{header}{imports}\n\n{classes_str}"


def generate_code_obj_cores() -> str:
    """Generate all CodeObjCore classes."""
    import setta.types.code_obj_impls

    # Get all concrete code obj impl classes
    concrete_classes = find_sub_classes(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        False,  # Only concrete classes
        False,
    )

    # Sort classes by their type value for consistent output
    concrete_classes.sort(key=lambda cls: cls.model_fields["type"].default.value)

    # Generate modifier imports list
    modifier_imports = []
    field_literal_imports = []
    for cls in concrete_classes:
        code_obj_type = cls.model_fields["type"].default.value
        modifier_imports.append(f"    {code_obj_type}CodeObjImplModifier,")
        field_literal_imports.append(f"    {cls.__name__}Fields,")
    modifier_imports_str = "\n".join(modifier_imports)
    field_literal_imports_str = "\n".join(field_literal_imports)

    # Generate imports
    imports = f"""from typing import Literal
from pydantic import Field

from setta.types.code_obj_core import BaseCodeObjCore
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.type_to_modifier import create_modifier_for_code_obj_type
from setta.types.generated.impl_modifiers import (
{modifier_imports_str}
)
from setta.types.generated.impl_field_literals import (
{field_literal_imports_str}
)"""

    # Generate class definitions
    class_definitions = []
    for cls in concrete_classes:
        code_obj_type = cls.model_fields["type"].default.value
        default_keys = DEFAULT_CODE_OBJ_UNSHARED_KEYS[code_obj_type]
        class_def = generate_core_class(
            code_obj_type,
            cls,
            "CodeObjCore",
            "CodeObjImplModifier",
            default_keys,
            "CodeObjType",
            "create_modifier_for_code_obj_type",
        )
        class_definitions.append(class_def)

    # Combine all parts
    header = """# Auto-generated CodeObjCore classes - DO NOT EDIT MANUALLY
# Generated from code obj implementations

"""

    classes_str = "\n".join(class_definitions)

    return f"{header}{imports}\n\n{classes_str}"


def main(output_folder: Path):
    """Generate all Core classes."""
    # Generate section cores
    section_code = generate_section_cores()
    formatted_section = ruff_format(section_code)

    section_output_file = output_folder / "section_cores.py"
    section_output_file.write_text(formatted_section)
    print(f"Generated SectionCore classes in {section_output_file}")

    # Generate code obj cores
    code_obj_code = generate_code_obj_cores()
    formatted_code_obj = ruff_format(code_obj_code)

    code_obj_output_file = output_folder / "code_obj_cores.py"
    code_obj_output_file.write_text(formatted_code_obj)
    print(f"Generated CodeObjCore classes in {code_obj_output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
