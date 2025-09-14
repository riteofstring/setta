from pathlib import Path
from typing import get_args

from setta.utils.utils import get_absolute_path

from .utils import get_impl_classes, get_impl_unions


def generate_set_effective_impl_value_overload(impl_name: str, args_name: str) -> str:
    """Generate a single set_effective_impl_value overload."""
    return f"""
@overload
def set_effective_impl_value(
    impl: {impl_name},
    core: Core,
    variant: Variant,
    args: {args_name}
) -> {impl_name}: ..."""


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

    # Get unions with their actual objects
    section_unions = get_impl_unions(["Section", "Impl"], ["Args"])
    code_obj_unions = get_impl_unions(["CodeObj", "Impl"], ["Args"])
    all_union_data = section_unions + code_obj_unions

    # Sort unions by specificity
    sorted_union_names = sort_unions_by_specificity(all_union_data)

    section_impl_imports = []
    code_obj_impl_imports = []
    args_imports = []
    for cls in classes.values():
        if cls.is_for_section:
            section_impl_imports.append(cls.original_name)
        elif cls.is_for_code_obj:
            code_obj_impl_imports.append(cls.original_name)
        args_imports.append(cls.args_name)
        args_imports.append(cls.args_with_callable_name)
    for u in sorted_union_names:
        args_imports.append(u.replace("Union", "Args"))
        args_imports.append(u.replace("Union", "ArgsWithCallable"))

    # Generate imports using triple quotes
    imports = f"""# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import overload, Any, TypeVar, Callable, Any
from pydantic import BaseModel

from setta.types.core import Core, Variant
from setta.types.section_impls import (
    {", ".join(section_impl_imports)}
)
from setta.types.code_obj_impls import (
    {", ".join(code_obj_impl_imports)}
)
from setta.types.generated.unions import (
    {", ".join(sorted_union_names)}
)
from setta.types.generated.impl_args_as_typed_dicts import (
    {", ".join(args_imports)}
)


T = TypeVar("T", bound=BaseModel)


def get_effective_impl(
    impl: T,
    core: Core,
    variant: Variant,
) -> T:
    return impl.model_copy(
        update={{**core.sharedModifier, **variant.modifier}}, deep=True
    )

"""

    # Generate set_effective_impl_value overloads
    set_overloads_list = []

    # First, specific class overloads
    non_base_classes = {k: v for k, v in classes.items() if v.type_has_default}
    for cls in non_base_classes.values():
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                cls.original_name,
                cls.args_with_callable_name,
            )
        )

    # Then, union overloads (already sorted by specificity)
    for u in sorted_union_names:
        # add union
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                u, u.replace("Union", "ArgsWithCallable")
            )
        )
        # add base class too
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                u.replace("Union", ""), u.replace("Union", "ArgsWithCallable")
            )
        )

    set_overloads = "".join(set_overloads_list)

    set_impl = """
def set_effective_impl_value( # type: ignore
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: Core,
    variant: Variant,
    args: dict[str, Any | Callable[[Any], Any]],
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    \"\"\"Set a value in the effective implementation.

    The value is set in the appropriate location based on:
    - If impl is not a preset: directly on the impl
    - If key is in unsharedKeys: in the modifier
    - Otherwise: in the core's sharedModifier

    Args is a dict where each value can be either:
    - A direct value to set
    - A callable that takes the current value and returns a new value

    The overloaded signatures above provide type-safe field names for each
    specific impl type.
    \"\"\"
    curr = get_effective_impl(impl, core, variant)
    for k, v in args.items():
        currV = getattr(curr, k, None)
        if k not in core.unsharedKeys:
            core.sharedModifier[k] = v(currV) if callable(v) else v
        elif not impl.isPreset:
            setattr(impl, k, v(currV) if callable(v) else v)
        else:
            variant.modifier[k] = v(currV) if callable(v) else v
    return get_effective_impl(impl, core, variant)
"""

    # Combine all parts
    return imports + set_overloads + set_impl


def main(output_folder: Path):
    """Generate effective impl overloads."""
    code = generate_effective_impl_overloads()
    # code = ruff_format(code)
    output_file = output_folder / "effective_impls.py"
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
