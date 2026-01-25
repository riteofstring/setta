from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import ImplClassInfoForGeneration, get_creation_fns, get_impl_classes


def additional_args_types_callback(c: ImplClassInfoForGeneration):
    return f"defaults: {c.user_default_name}, overrides: {c.args_name} | None = None"


def additional_args_generic_type_callback():
    return "defaults: Any, overrides: Any = None"


def implementation_callback(
    c: ImplClassInfoForGeneration, _additional_args: str
) -> str:
    return f"""
                    if overrides is None:
                        overrides = {{}}
                    return {c.original_name}(**{{**defaults.model_dump(), **overrides}})
"""


def generate_creation_functions_module() -> str:
    """Generate the module containing all creation functions."""
    classes = get_impl_classes()
    classes = {k: v for k, v in classes.items() if v.type_has_default}

    section_imports_str = ",\n    ".join(
        [cls.original_name for cls in classes.values() if cls.is_for_section]
    )
    code_obj_imports_str = ",\n    ".join(
        [cls.original_name for cls in classes.values() if cls.is_for_code_obj]
    )
    user_default_imports = ",\n    ".join(
        [cls.user_default_name for cls in classes.values()]
    )
    args_imports = ",\n    ".join([cls.args_name for cls in classes.values()])

    code = get_creation_fns(
        classes,
        "impl",
        additional_args_types_callback=additional_args_types_callback,
        additional_args_generic_type_callback=additional_args_generic_type_callback,
        implementation_callback=implementation_callback,
    )

    # Build the complete module
    code = f"""# Auto-generated creation functions - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Literal, overload
from setta.types.code_obj_impls import CodeObjType
from setta.types.section_impls import SectionType

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

from setta.types.generated.impl_args_as_typed_dicts import (
    {args_imports}
)


{code}
"""

    return code


def main(output_folder: Path):
    """Generate all creation functions."""
    code = generate_creation_functions_module()
    code = ruff_format(code)
    output_file = output_folder / "impl_creation_fns.py"
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
