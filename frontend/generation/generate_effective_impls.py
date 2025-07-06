from pathlib import Path
from typing import get_args

from setta.utils.utils import get_absolute_path

from .utils import get_impl_classes, get_impl_unions


def generate_get_effective_impl_overload(
    impl_name: str, core_name: str, layering_name: str
) -> str:
    """Generate a single get_effective_impl overload."""
    return f"""
@overload
def get_effective_impl(
    impl: {impl_name},
    core: {core_name},
    layering: {layering_name},
) -> {impl_name}: ..."""


def generate_set_effective_impl_value_overload(
    impl_name: str, core_name: str, layering_name: str, field_literal_name: str
) -> str:
    """Generate a single set_effective_impl_value overload."""
    return f"""
@overload
def set_effective_impl_value(
    impl: {impl_name},
    core: {core_name},
    layering: {layering_name},
    key: str,
    value: Any,
) -> {impl_name}: ..."""


# returns impl, core, and layering names
def get_union_names(u):
    return (
        u,
        u.replace("Impl", "Core"),
        u.replace("Impl", "Layering"),
    )


def get_union_types(union_obj):
    """Extract the set of types from a Union object."""
    return set(get_args(union_obj))


def sort_unions_by_specificity(union_data, debug=False):
    """Sort unions from most specific (smallest) to most general (largest).

    union_data: list of tuples (name, union_object)
    debug: if True, print the inferred hierarchy
    """
    # Build a mapping of union names to their types
    union_types = {}
    union_names = []
    for name, union_obj in union_data:
        union_types[name] = get_union_types(union_obj)
        union_names.append(name)

    # Simply sort by the number of types (size) - smaller unions are more specific
    sorted_unions = sorted(union_names, key=lambda name: len(union_types[name]))

    if debug:
        # Show subset relationships for debugging
        print("\nInferred Union Hierarchy:")
        print("-" * 50)
        for name in sorted_unions:
            a_types = union_types[name]
            supersets = []
            for other in sorted_unions:
                if name != other:
                    b_types = union_types[other]
                    if a_types < b_types:  # a is strict subset of b
                        supersets.append(other)
            if supersets:
                print(f"{name} ({len(a_types)} types) ⊆ {', '.join(supersets)}")
            else:
                print(f"{name} ({len(a_types)} types) - no supersets")
        print("-" * 50)

        print("\nSorted order (most specific to most general):")
        for i, name in enumerate(sorted_unions):
            print(f"{i + 1}. {name} ({len(union_types[name])} types)")
        print()

    return sorted_unions


def generate_effective_impl_overloads():
    """Generate overloaded effective impl functions."""
    classes = get_impl_classes()
    classes = {k: v for k, v in classes.items() if v.type_has_default}

    # Get unions with their actual objects
    section_unions = get_impl_unions(["Section", "Impl"])
    code_obj_unions = get_impl_unions(["CodeObj", "Impl"])
    all_union_data = section_unions + code_obj_unions

    # Sort unions by specificity
    sorted_union_names = sort_unions_by_specificity(all_union_data)

    section_impl_imports = []
    code_obj_impl_imports = []
    core_imports = []
    layering_imports = []
    union_imports = []
    for cls in classes.values():
        if cls.is_section_impl:
            section_impl_imports.append(cls.original_name)
        elif cls.is_code_obj_impl:
            code_obj_impl_imports.append(cls.original_name)
        core_imports.append(cls.core_name)
        layering_imports.append(cls.layering_name)
    for u in sorted_union_names:
        union_imports.extend(get_union_names(u))

    # Generate imports using triple quotes
    imports = f"""# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import overload, Any, TypeVar

from setta.types.section_impls import (
    {", ".join(section_impl_imports)}
)
from setta.types.code_obj_impls import (
    {", ".join(code_obj_impl_imports)}
)
from setta.types.generated.cores import (
    {", ".join(core_imports)}
)
from setta.types.generated.layerings import (
    {", ".join(layering_imports)}
)
from setta.types.generated.unions import (
    {", ".join(union_imports)}
)
"""

    # TypeVar definition
    type_var_def = """
TImpl = TypeVar("TImpl", bound=BaseCodeObjImplUnion | BaseSectionImplUnion)


def apply_modifier(
    impl: TImpl, core: BaseSectionCoreUnion | BaseCodeObjCoreUnion, layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion
) -> TImpl:
    return impl.model_copy(update={**core.sharedModifier, **layering.modifier}, deep=True)
"""

    # Generate get_effective_impl overloads
    get_overloads_list = []

    # First, specific class overloads
    for cls in classes.values():
        get_overloads_list.append(
            generate_get_effective_impl_overload(
                cls.original_name, cls.core_name, cls.layering_name
            )
        )

    # Then, union overloads (already sorted by specificity)
    for u in sorted_union_names:
        get_overloads_list.append(
            generate_get_effective_impl_overload(*get_union_names(u))
        )

    get_overloads = "".join(get_overloads_list)

    # implementation
    get_impl = """
def get_effective_impl(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    return apply_modifier(impl, core, layering)
"""

    # Generate set_effective_impl_value overloads
    set_overloads_list = []

    # First, specific class overloads
    for cls in classes.values():
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                cls.original_name,
                cls.core_name,
                cls.layering_name,
                cls.impl_fields_name,
            )
        )

    # Then, union overloads (already sorted by specificity)
    for u in sorted_union_names:
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(*get_union_names(u), "")
        )

    set_overloads = "".join(set_overloads_list)

    set_impl = """
def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion,
    key: str,
    value: Any,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    \"\"\"Set a value in the effective implementation.
    
    The value is set in the appropriate location based on:
    - If impl is not a preset: directly on the impl
    - If key is in unsharedKeys: in the modifier
    - Otherwise: in the core's sharedModifier
    
    The overloaded signatures above provide type-safe field names for each
    specific impl type.
    \"\"\"
    if not impl.isPreset:
        setattr(impl, key, value)
    elif key in core.unsharedKeys:
        layering.modifier[key] = value
    else:
        core.sharedModifier[key] = value
    return get_effective_impl(impl, core, layering)
"""

    # Combine all parts
    return imports + type_var_def + get_overloads + get_impl + set_overloads + set_impl


def main(output_folder: Path):
    """Generate effective impl overloads."""
    code = generate_effective_impl_overloads()
    # code = ruff_format(code)
    output_file = output_folder / "effective_impls.py"
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
