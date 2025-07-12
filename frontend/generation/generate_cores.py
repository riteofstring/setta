from pathlib import Path

from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.section_impls import BaseSectionImpl
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_modifiers import create_model_args_as_typed_dict
from .utils import (
    ImplClassInfoForGeneration,
    find_sub_classes,
    get_creation_fns,
    get_impl_classes,
)


def generate_cores(output_file, classes: dict[str, ImplClassInfoForGeneration]):
    code = """
from typing import Any, Literal, overload

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string  
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.modifiers import create_section_modifier, create_code_obj_modifier
"""

    modifier_names = []
    impl_fields = []

    for c in classes.values():
        modifier_names.append(c.modifier_name)
        impl_fields.append(c.impl_fields_name)

        if c.class_obj is BaseSectionImpl:
            code += f"""
class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: {c.modifier_name}
    unsharedKeys: list[{c.impl_fields_name}]

"""
        elif c.class_obj is BaseCodeObjImpl:
            code += f"""
class BaseCodeObjCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: {c.modifier_name}
    unsharedKeys: list[{c.impl_fields_name}]

"""
        else:
            code += f"""
class {c.core_name}({", ".join(c.parent_core_class_names)}):
    type: {c.type_type_annotation_and_value}
    sharedModifier: {c.modifier_annotation_and_value}
    unsharedKeys: {c.unshared_keys_annotation_and_value}

"""

    code += get_creation_fns(classes, "core")

    code = (
        f"""
from setta.types.generated.modifiers import {", ".join(modifier_names)}
from setta.types.generated.impl_field_literals import {", ".join(impl_fields)}
"""
        + code
    )

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_core_args_as_typed_dicts(
    output_file,
):
    import setta.types.generated.cores

    core_classes = find_sub_classes(
        setta.types.generated.cores,
        setta.types.generated.cores.BaseSectionCore,
    )
    core_classes += find_sub_classes(
        setta.types.generated.cores,
        setta.types.generated.cores.BaseCodeObjCore,
    )

    code = """
from typing import Literal, Any, NotRequired, TypedDict
from setta.types.code_obj_impls import CodeObjType
from setta.types.section_impls import SectionType
from setta.types.generated.modifiers import BaseCodeObjModifier, BaseSectionModifier
"""
    for c in core_classes:
        code += create_model_args_as_typed_dict(
            c,
            c.__bases__,
            [
                setta.types.generated.cores.BaseSectionCore,
                setta.types.generated.cores.BaseCodeObjCore,
            ],
            c.__name__ + "Args",
            [p.__name__ + "Args" for p in c.__bases__],
        )

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    classes = get_impl_classes()
    generate_cores(
        get_absolute_path(
            __file__, Path("../../backend/setta/types/generated") / "cores.py"
        ),
        classes,
    )
    generate_core_args_as_typed_dicts(
        get_absolute_path(
            __file__,
            Path("../../backend/setta/types/generated") / "core_args_as_typed_dicts.py",
        ),
    )
