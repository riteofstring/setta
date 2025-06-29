from pathlib import Path
from typing import get_args

from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion

# Import the actual union types
from setta.types.generated.section_type_unions import BaseSectionImplUnion
from setta.utils.utils import get_absolute_path


def get_union_members(union_type):
    """Extract member types from a Union type."""
    return get_args(union_type)


def get_type_name(type_obj):
    """Get the name of a type object."""
    return type_obj.__name__


def generate_conversion_function():
    """Generate the impl to modifier conversion function."""

    # Extract types from unions
    section_impl_types = get_union_members(BaseSectionImplUnion)
    code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

    section_impl_names = [get_type_name(t) for t in section_impl_types]
    code_obj_impl_names = [get_type_name(t) for t in code_obj_impl_types]

    # Generate imports
    imports = ["from typing import Union, overload\n"]

    # Section imports
    imports.append("from setta.types.section_impls import (")
    for impl_name in section_impl_names:
        imports.append(f"    {impl_name},")
    imports.append(")\n")

    # Code obj imports
    imports.append("from setta.types.code_obj_impls import (")
    for impl_name in code_obj_impl_names:
        imports.append(f"    {impl_name},")
    imports.append(")\n")

    # Modifier imports
    imports.append("from setta.types.generated.impl_modifiers import (")
    for impl_name in section_impl_names:
        modifier_name = impl_name + "Modifier"
        imports.append(f"    {modifier_name},")
    for impl_name in code_obj_impl_names:
        modifier_name = impl_name + "Modifier"
        imports.append(f"    {modifier_name},")
    imports.append(")\n")

    # Union imports
    imports.append("""from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
)
from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
)
from setta.types.generated.impl_modifier_unions import (
    AllImplModifierUnion,
)
""")

    # Generate overloads for better type inference
    overloads = ["\n# Overloads for specific type inference"]

    # Section overloads
    for impl_name in section_impl_names:
        modifier_name = impl_name + "Modifier"
        overloads.append(f"""
@overload
def create_modifier_for_impl(impl: {impl_name}) -> {modifier_name}: ...""")

    # Code obj overloads
    for impl_name in code_obj_impl_names:
        modifier_name = impl_name + "Modifier"
        overloads.append(f"""
@overload
def create_modifier_for_impl(impl: {impl_name}) -> {modifier_name}: ...""")

    # General overload
    overloads.append("""
@overload
def create_modifier_for_impl(impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion]) -> AllImplModifierUnion: ...
""")

    # Generate the main function
    function = [
        "\n\ndef create_modifier_for_impl(impl: Union[BaseSectionImplUnion, BaseCodeObjImplUnion]) -> AllImplModifierUnion:"
    ]
    function.append(
        '    """Convert an Impl instance to its corresponding ImplModifier."""'
    )

    # Section impl cases
    first = True
    for impl_name in section_impl_names + code_obj_impl_names:
        modifier_name = impl_name + "Modifier"
        if first:
            function.append(f"    if isinstance(impl, {impl_name}):")
            first = False
        else:
            function.append(f"    elif isinstance(impl, {impl_name}):")
        function.append(f"        return {modifier_name}(type=impl.type)")

    # Error case
    function.append("    else:")
    function.append(
        '        raise ValueError(f"Unknown impl type: {type(impl).__name__}")'
    )

    # Combine all parts
    output = []
    output.extend(imports)
    output.extend(overloads)
    output.extend(function)

    return "\n".join(output)


def main(output_folder):
    generated_code = generate_conversion_function()

    output_file = output_folder / "impl_to_modifier.py"
    with open(output_file, "w") as f:
        f.write(generated_code)

    print(f"Generated conversion function written to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
