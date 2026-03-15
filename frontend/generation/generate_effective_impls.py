from pathlib import Path

from .utils import get_impl_classes, resolve_generation_path


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


def generate_effective_impl_overloads():
    """Generate overloaded effective impl functions."""
    classes = get_impl_classes()

    section_impl_imports = []
    code_obj_impl_imports = []
    args_imports = []
    for cls in classes.values():
        if not cls.type_has_default:
            continue
        if cls.is_for_section:
            section_impl_imports.append(cls.original_name)
        elif cls.is_for_code_obj:
            code_obj_impl_imports.append(cls.original_name)
        args_imports.append(cls.args_with_callable_name)

    section_impl_imports = list(dict.fromkeys(section_impl_imports))
    code_obj_impl_imports = list(dict.fromkeys(code_obj_impl_imports))
    args_imports = list(dict.fromkeys(args_imports))

    # Generate imports using triple quotes
    imports = f"""# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Callable, TypeVar, overload
from pydantic import BaseModel

from setta.types.core import Core, Variant
from setta.types.section_impls import (
    {", ".join(section_impl_imports)}
)
from setta.types.code_obj_impls import (
    {", ".join(code_obj_impl_imports)}
)
from setta.types.generated.unions import (
    BaseCodeObjImplUnion,
    BaseSectionImplUnion,
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
    for cls in classes.values():
        if not cls.type_has_default:
            continue
        set_overloads_list.append(
            generate_set_effective_impl_value_overload(
                cls.original_name,
                cls.args_with_callable_name,
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
    main(resolve_generation_path(__file__, Path("../../backend/setta/types/generated")))
