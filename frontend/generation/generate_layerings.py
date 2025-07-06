from pathlib import Path

from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.section_impls import BaseSectionImpl
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    ImplClassInfoForGeneration,
    get_creation_fns,
    get_impl_classes,
)


def generate_layerings(output_file, classes: dict[str, ImplClassInfoForGeneration]):
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

    for c in classes.values():
        modifier_names.append(c.modifier_name)
        if c.class_obj is BaseSectionImpl:
            code += f"""
class BaseSectionLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: {c.modifier_name}

"""
        elif c.class_obj is BaseCodeObjImpl:
            code += f"""
class BaseCodeObjLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: {c.modifier_name}

"""
        else:
            code += f"""
class {c.layering_name}({", ".join(c.parent_layering_class_names)}):
    type: {c.type_type_annotation_and_value}
    modifier: {c.modifier_annotation_and_value}

"""

    code += get_creation_fns(classes, "layering", {"impl": "str"})

    code = (
        f"""
from setta.types.generated.modifiers import {", ".join(modifier_names)}
"""
        + code
    )

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    classes = get_impl_classes()
    generate_layerings(
        get_absolute_path(
            __file__, Path("../../backend/setta/types/generated") / "layerings.py"
        ),
        classes,
    )
