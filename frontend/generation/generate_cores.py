from pathlib import Path

from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.section_impls import BaseSectionImpl
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    ImplClassInfoForGeneration,
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
from setta.types.generated.modifiers import create_modifier
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
    unsharedKeys: {c.impl_fields_name}

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
    unsharedKeys: {c.impl_fields_name}

"""
        else:
            code += f"""
class {c.core_name}({", ".join(c.parent_core_class_names)}):
    type: {c.type_type_annotation_and_value}
    sharedModifier: {c.modifier_annotation_and_value}
    unsharedKeys: {c.unshared_keys_annotation_and_value}

"""

    core_cases = {}
    for c in classes.values():
        if not c.type_has_default:
            continue
        core_cases[c.type_value] = c.core_name
        code += f"""
@overload
def create_core(type_: {c.type_type_annotation}) -> {c.core_name}:
    ...
"""

    cases_str = []
    for type_name, core_name in core_cases.items():
        curr_case = f"""
        case {type_name}:
            return {core_name}(type=type_)
        """
        cases_str.append(curr_case)

    code += f"""
def create_core(type_: SectionType | CodeObjType):
    match type_:
{"\n".join(cases_str)}
"""

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


if __name__ == "__main__":
    classes = get_impl_classes()
    generate_cores(
        get_absolute_path(
            __file__, Path("../../backend/setta/types/generated") / "cores.py"
        ),
        classes,
    )
