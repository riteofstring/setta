from pathlib import Path
from typing import get_args

from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
from setta.types.generated.section_type_unions import BaseSectionImplUnion
from setta.utils.utils import get_absolute_path


def get_union_members(union_type):
    """Extract member types from a Union type."""
    return get_args(union_type)


def get_type_name(type_obj):
    """Get the name of a type object."""
    return type_obj.__name__


def extract_type_value(impl_name):
    """Extract the enum value from impl class name (e.g., CallableSectionImpl -> Callable)."""
    if impl_name.endswith("SectionImpl"):
        return impl_name[:-11]  # Remove "SectionImpl"
    elif impl_name.endswith("CodeObjImpl"):
        return impl_name[:-11]  # Remove "CodeObjImpl"
    else:
        raise ValueError(f"Unexpected impl name format: {impl_name}")


def generate_conversion_function():
    """Generate the impl to core conversion function."""

    # Extract types from unions
    section_impl_types = get_union_members(BaseSectionImplUnion)
    code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

    section_impl_names = [get_type_name(t) for t in section_impl_types]
    code_obj_impl_names = [get_type_name(t) for t in code_obj_impl_types]

    # Generate imports using triple quotes
    imports = """from typing import Union, overload

"""

    # Section impl imports
    section_imports = []
    for impl_name in section_impl_names:
        section_imports.append(f"    {impl_name},")
    section_imports_str = "\n".join(section_imports)

    imports += f"""from setta.types.section_impls import (
{section_imports_str}
)

"""

    # Code obj impl imports
    code_obj_imports = []
    for impl_name in code_obj_impl_names:
        code_obj_imports.append(f"    {impl_name},")
    code_obj_imports_str = "\n".join(code_obj_imports)

    imports += f"""from setta.types.code_obj_impls import (
{code_obj_imports_str}
)

"""

    # Core imports - section cores
    section_core_imports = []
    for impl_name in section_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "SectionCore"
        section_core_imports.append(f"    {core_name},")
    section_core_imports_str = "\n".join(section_core_imports)

    imports += f"""from setta.types.generated.section_cores import (
{section_core_imports_str}
)

"""

    # Core imports - code obj cores
    code_obj_core_imports = []
    for impl_name in code_obj_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "CodeObjCore"
        code_obj_core_imports.append(f"    {core_name},")
    code_obj_core_imports_str = "\n".join(code_obj_core_imports)

    imports += f"""from setta.types.generated.code_obj_cores import (
{code_obj_core_imports_str}
)

"""

    # Union imports
    imports += """from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
)
from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
)
from setta.types.section_core import BaseSectionCore
from setta.types.code_obj_core import BaseCodeObjCore
"""

    # Generate overloads for better type inference
    overloads = "\n# Overloads for specific type inference"

    # Section overloads
    for impl_name in section_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "SectionCore"
        overloads += f"""
@overload
def create_core_for_impl(impl: {impl_name}) -> {core_name}: ..."""

    # Code obj overloads
    for impl_name in code_obj_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "CodeObjCore"
        overloads += f"""
@overload
def create_core_for_impl(impl: {impl_name}) -> {core_name}: ..."""

    # General overload
    overloads += """
@overload
def create_core_for_impl(impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion]) -> Union[BaseSectionCore, CodeObjCore]: ...
"""

    # Generate the main function
    function = """

def create_core_for_impl(impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion]) -> Union[BaseSectionCore, CodeObjCore]:
    \"\"\"Convert an Impl instance to its corresponding Core object.\"\"\"
"""

    # Generate cases
    first = True
    for impl_name in section_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "SectionCore"
        if first:
            function += f"""    if isinstance(impl, {impl_name}):
        return {core_name}()"""
            first = False
        else:
            function += f"""
    elif isinstance(impl, {impl_name}):
        return {core_name}()"""

    for impl_name in code_obj_impl_names:
        type_value = extract_type_value(impl_name)
        core_name = type_value + "CodeObjCore"
        function += f"""
    elif isinstance(impl, {impl_name}):
        return {core_name}()"""

    # Error case
    function += """
    else:
        raise ValueError(f"Unknown impl type: {type(impl).__name__}")"""

    # Combine all parts
    return imports + overloads + function


def main(output_folder):
    generated_code = generate_conversion_function()

    output_file = output_folder / "impl_to_core.py"
    with open(output_file, "w") as f:
        f.write(generated_code)

    print(f"Generated impl to core conversion function written to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
