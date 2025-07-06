from pathlib import Path

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


def generate_effective_impl_overloads():
    """Generate overloaded effective impl functions."""
    classes = get_impl_classes()
    classes = {k: v for k, v in classes.items() if v.type_has_default}
    unions = get_impl_unions("SectionImpl") + get_impl_unions("CodeObjImpl")
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
    for u in unions:
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

    get_overloads_list = []
    for cls in classes.values():
        get_overloads_list.append(
            generate_get_effective_impl_overload(
                cls.original_name, cls.core_name, cls.layering_name
            )
        )
    get_overloads_specific = "".join(get_overloads_list)

    get_overloads_list = []
    for u in unions:
        get_overloads_list.append(
            generate_get_effective_impl_overload(*get_union_names(u))
        )
    get_overloads_unions = "".join(get_overloads_list)

    # implementation
    get_impl = """
def get_effective_impl(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    layering: BaseSectionLayeringUnion | BaseCodeObjLayeringUnion,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion,
    return apply_modifier(impl, core, layering)
"""

    set_overloads_list = []
    for cls in classes.values():
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                cls.original_name,
                cls.core_name,
                cls.layering_name,
                cls.impl_fields_name,
            )
        )
    set_overloads_specific = "".join(set_overloads_list)

    set_overloads_list = []
    for u in unions:
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(*get_union_names(u), "")
        )
    set_overloads_unions = "".join(set_overloads_list)

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
    return (
        imports
        + type_var_def
        + get_overloads_specific
        + get_overloads_unions
        + get_impl
        + set_overloads_specific
        + set_overloads_unions
        + set_impl
    )


def main(output_folder: Path):
    """Generate effective impl overloads."""
    code = generate_effective_impl_overloads()
    # code = ruff_format(code)
    output_file = output_folder / "effective_impls.py"
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
