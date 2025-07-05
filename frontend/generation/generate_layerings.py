from pathlib import Path

from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    get_impl_classes,
    get_name_without_impl,
    python_type_to_str,
)


def generate_layerings(output_file, classes):
    code = """
from typing import Any, Literal, overload

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string  
from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType
"""

    modifier_names = []

    for c in classes:
        modifier_name = get_name_without_impl(c.__name__) + "Modifier"
        modifier_names.append(modifier_name)
        if c.__name__ == "BaseSectionImpl":
            code += f"""
class BaseSectionLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: {modifier_name}

"""
        elif c.__name__ == "BaseCodeObjImpl":
            code += f"""
class BaseCodeObjLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: {modifier_name}

"""
        else:
            class_name = get_name_without_impl(c.__name__) + "Layering"
            parent_class_names = ", ".join(
                get_name_without_impl(b.__name__) + "Layering" for b in c.__bases__
            )
            type_attribute = python_type_to_str(c.model_fields["type"].annotation)
            if c.model_fields["type"].default is not PydanticUndefined:
                default_val = c.model_fields["type"].default
                type_attribute += (
                    f" = {default_val.__class__.__name__}.{default_val.value}"
                )

            code += f"""
class {class_name}({parent_class_names}):
    type: {type_attribute}
    modifier: {modifier_name} # type: ignore

"""

    cases = {}
    for c in classes:
        if c.model_fields["type"].default is PydanticUndefined:
            continue
        layering_name = f"{get_name_without_impl(c.__name__)}Layering"
        type_attribute = python_type_to_str(c.model_fields["type"].annotation)
        default_val = c.model_fields["type"].default
        cases[f"{default_val.__class__.__name__}.{default_val.value}"] = layering_name
        code += f"""
@overload
def create_layering(type_: {type_attribute}) -> {layering_name}:
    ...
"""

    cases_str = []
    for type_name, modifier_name in cases.items():
        curr_case = f"""
        case {type_name}:
            return {modifier_name}(type=type_)
        """
        cases_str.append(curr_case)

    code += f"""
def create_layering(type_: SectionType | CodeObjType):
    match type_:
{"\n".join(cases_str)}
"""

    code = (
        f"""
from setta.types.generated.modifiers import {", ".join(modifier_names)}
"""
        + code
    )

    code = ruff_format(code)
    output_file.write_text(code)


if __name__ == "__main__":
    classes = get_impl_classes()
    generate_layerings(
        get_absolute_path(
            __file__, Path("../../backend/setta/types/generated") / "layerings.py"
        ),
        classes,
    )
