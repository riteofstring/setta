from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_impl_classes


def generate_creation_function(class_info: ImplClassInfoForGeneration) -> str:
    # Simple function that just applies defaults and overrides
    function = f"""
def create{class_info.original_name}(
    defaults: {class_info.user_default_name},
    **overrides
) -> {class_info.original_name}:
    return {class_info.original_name}(**{{**defaults.model_dump(), **overrides}})
"""

    return function


def generate_creation_functions_module() -> str:
    """Generate the module containing all creation functions."""
    classes = get_impl_classes()
    classes = {k: v for k, v in classes.items() if v.type_has_default}

    section_imports_str = ",\n    ".join(
        [cls.original_name for cls in classes.values() if cls.is_section_impl]
    )
    code_obj_imports_str = ",\n    ".join(
        [cls.original_name for cls in classes.values() if cls.is_code_obj_impl]
    )
    user_default_imports = ",\n    ".join(
        [cls.user_default_name for cls in classes.values()]
    )

    functions = []
    for cls in classes.values():
        func = generate_creation_function(cls)
        if func:
            functions.append(func)

    functions_str = "\n".join(functions)

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
    {user_default_imports}
)


{functions_str}
"""

    return output


def main(output_folder: Path):
    """Generate all creation functions."""
    code = generate_creation_functions_module()
    code = ruff_format(code)
    output_file = output_folder / "impl_creation_fns.py"
    output_file.write_text(code)
    print(f"Generated creation functions in {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
