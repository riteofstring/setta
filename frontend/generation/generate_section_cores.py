from pathlib import Path
from typing import Dict, Set

from pydantic import BaseModel
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes

# Default unsharedKeys for each section type
# Add or modify entries here to set default unshared keys
# Example: "Callable": {"hideParams", "callable", "configLanguage"}
DEFAULT_UNSHARED_KEYS: Dict[str, Set[str]] = {
    "Callable": {"callable", "codeObjImplLayeringMap"},
    "Dict": set(),
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


def get_all_field_names(impl_class: type[BaseModel]) -> Set[str]:
    """Get all field names for a class, including inherited fields."""
    field_names = set()

    # Get fields from the class and all its parent classes
    for cls in impl_class.__mro__:
        if issubclass(cls, BaseModel) and cls is not BaseModel:
            field_names.update(cls.model_fields.keys())

    return field_names


def generate_section_core_class(section_type: str, impl_class: type[BaseModel]) -> str:
    """Generate a single SectionCore class definition."""

    # Get all field names for the impl class
    field_names = get_all_field_names(impl_class)

    # Sort field names for consistent output
    sorted_fields = sorted(field_names)

    # Create the Literal type string for unsharedKeys
    literal_values = ", ".join(f'"{field}"' for field in sorted_fields)

    # Get default unshared keys for this section type
    default_keys = DEFAULT_UNSHARED_KEYS[section_type]

    # Validate that default keys exist in the impl class
    invalid_keys = default_keys - field_names
    if invalid_keys:
        raise ValueError(
            f"Invalid default unshared keys for {section_type}: {invalid_keys}. "
            f"Valid keys are: {sorted_fields}"
        )

    # Generate default factory
    if default_keys:
        # Sort for consistent output
        sorted_default_keys = sorted(default_keys)
        default_values = ", ".join(f'"{key}"' for key in sorted_default_keys)
        default_factory = f"lambda: {{{default_values}}}"
    else:
        default_factory = "set"

    # Generate the class definition
    class_def = f"""
class {section_type}SectionCore(BaseSectionCore):
    \"\"\"Core configuration for {section_type} sections.\"\"\"
    sharedModifier: {section_type}SectionImplModifier
    unsharedKeys: set[Literal[{literal_values}]] = Field(default_factory={default_factory})
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
    for cls in concrete_classes:
        section_type = cls.model_fields["type"].default.value
        modifier_imports.append(f"    {section_type}SectionImplModifier,")
    modifier_imports_str = "\n".join(modifier_imports)

    # Generate imports
    imports = f"""from typing import Literal
from pydantic import Field

from setta.types.section_core import BaseSectionCore

from setta.types.generated.impl_modifiers import (
{modifier_imports_str}
)"""

    # Generate class definitions
    class_definitions = []
    for cls in concrete_classes:
        section_type = cls.model_fields["type"].default.value
        class_def = generate_section_core_class(section_type, cls)
        class_definitions.append(class_def)

    # Combine all parts
    header = """# Auto-generated SectionCore classes - DO NOT EDIT MANUALLY
# Generated from section implementations

"""

    classes_str = "\n".join(class_definitions)

    return f"{header}{imports}\n\n{classes_str}"


def main(output_folder: Path):
    """Generate all SectionCore classes."""
    # Generate the code
    code = generate_section_cores()

    # Format with ruff
    formatted = ruff_format(code)

    # Write output
    output_file = output_folder / "section_cores.py"
    output_file.write_text(formatted)
    print(f"Generated SectionCore classes in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
