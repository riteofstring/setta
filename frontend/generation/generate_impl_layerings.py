from pathlib import Path

from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes


def generate_base_impl_layering_class() -> str:
    """Generate the root BaseImplLayering class."""
    return """
class BaseImplLayering(BaseModel):
    \"\"\"Base class for all ImplLayering types.\"\"\"
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: Any
"""


def impl_to_layering_name(impl_class_name: str) -> str:
    """Convert impl class name to layering class name."""
    # Remove 'Impl' suffix and add 'Layering'
    if impl_class_name.endswith("Impl"):
        return impl_class_name[:-4] + "ImplLayering"
    else:
        raise ValueError(f"Unexpected impl class name: {impl_class_name}")


def generate_layering_class(impl_class: type, base_class: type, enum_type: str) -> str:
    """Generate a single ImplLayering class."""

    impl_class_name = impl_class.__name__
    layering_name = impl_to_layering_name(impl_class_name)
    modifier_name = impl_class_name + "Modifier"

    # Determine parent class
    if impl_class is base_class:
        parent_class = "BaseImplLayering"
    else:
        parent_impl_name = impl_class.__base__.__name__
        parent_class = impl_to_layering_name(parent_impl_name)

    # Check if it's a base class (no type field) or concrete class
    is_base_class = impl_class.model_fields["type"].default is PydanticUndefined

    if is_base_class:
        # Base classes have Any type
        return f"""
class {layering_name}({parent_class}):
    \"\"\"Base class for {layering_name.replace("BaseImplLayering", "").replace("Base", "")} types.\"\"\"
    type: Any
    modifier: {modifier_name}
"""
    else:
        # Concrete classes have specific types
        type_value = impl_class.model_fields["type"].default.value
        return f"""
class {layering_name}({parent_class}):
    type: Literal[{enum_type}.{type_value}] = {enum_type}.{type_value}
    modifier: {modifier_name}
"""


def generate_impl_layerings() -> str:
    """Generate all ImplLayering classes."""
    import setta.types.code_obj_impls
    import setta.types.section_impls

    # Get all section impl classes (base and concrete)
    section_classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        True,  # Base classes
        False,
    )
    section_classes += find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        False,  # Concrete classes
        False,
    )
    section_classes = [setta.types.section_impls.BaseSectionImpl] + section_classes

    # Get all code obj impl classes (base and concrete)
    code_obj_classes = find_sub_classes(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        True,  # Base classes
        False,
    )
    code_obj_classes += find_sub_classes(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        False,  # Concrete classes
        False,
    )
    code_obj_classes = [setta.types.code_obj_impls.BaseCodeObjImpl] + code_obj_classes

    # Build imports - get unique modifier names
    modifier_imports = set()

    for cls in section_classes:
        modifier_imports.add(f"    {cls.__name__}Modifier,")
    for cls in code_obj_classes:
        modifier_imports.add(f"    {cls.__name__}Modifier,")

    modifier_imports_str = "\n".join(sorted(modifier_imports))

    # Generate header and imports
    header = f"""# Auto-generated ImplLayering classes - DO NOT EDIT MANUALLY
# Generated from impl modifier classes

from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType

from setta.types.generated.impl_modifiers import (
{modifier_imports_str}
)
"""

    # Generate base layering class
    base_class_def = generate_base_impl_layering_class()

    # Generate section layering classes
    section_layerings = []
    for cls in section_classes:
        layering = generate_layering_class(
            cls, setta.types.section_impls.BaseSectionImpl, "SectionType"
        )
        section_layerings.append(layering)

    # Generate code obj layering classes
    code_obj_layerings = []
    for cls in code_obj_classes:
        layering = generate_layering_class(
            cls, setta.types.code_obj_impls.BaseCodeObjImpl, "CodeObjType"
        )
        code_obj_layerings.append(layering)

    # Combine all parts
    all_layerings = (
        [base_class_def]
        + ["\n\n# ============== Section Layering Classes =============="]
        + section_layerings
        + ["\n\n# ============== Code Object Layering Classes =============="]
        + code_obj_layerings
    )

    return header + "".join(all_layerings)


def main(output_folder: Path):
    """Generate all ImplLayering classes."""
    # Generate the code
    code = generate_impl_layerings()

    # Format with ruff
    formatted = ruff_format(code)

    # Write output
    output_file = output_folder / "impl_layerings.py"
    output_file.write_text(formatted)
    print(f"Generated ImplLayering classes in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
