from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_backend_union_types import find_sub_classes


def generate_creation_function(class_name: str) -> str:
    """Generate a creation function for a specific class."""
    # Skip base classes - they're abstract
    if class_name.startswith("Base"):
        return ""

    user_default_class = f"UserDefault{class_name}"

    # Simple function that just applies defaults and overrides
    function = f"""
def create{class_name}(
    defaults: {user_default_class},
    **overrides
) -> {class_name}:
    \"\"\"Create {class_name} with user defaults.\"\"\"
    return {class_name}(**{{**defaults.model_dump(), **overrides}})
"""

    return function


def generate_creation_functions_module() -> str:
    """Generate the module containing all creation functions."""
    # Get all concrete classes
    import setta.types.code_obj_impls
    import setta.types.section_impls

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
        func = generate_creation_function(cls.__name__)
        if func:
            section_functions.append(func)

    code_obj_functions = []
    for cls in code_obj_classes:
        func = generate_creation_function(cls.__name__)
        if func:
            code_obj_functions.append(func)

    section_functions_str = "\n".join(section_functions)
    code_obj_functions_str = "\n".join(code_obj_functions)

    # Build the complete module
    output = f"""# Auto-generated creation functions - DO NOT EDIT MANUALLY
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

    return output


def main(output_folder: Path):
    """Generate all creation functions."""
    # Generate the code
    code = generate_creation_functions_module()

    # Format with ruff
    formatted = ruff_format(code)

    # Write output
    output_file = output_folder / "creation_functions.py"
    output_file.write_text(formatted)
    print(f"Generated creation functions in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
