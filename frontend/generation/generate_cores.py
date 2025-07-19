from pathlib import Path

from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.section_impls import BaseSectionImpl
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .generate_modifiers import create_model_args_as_typed_dict
from .utils import (
    CoreClassInfoForGeneration,
    get_core_classes,
    get_creation_fns,
    get_impl_classes,
)


def generate_cores(output_file):
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

    classes = get_impl_classes()
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
    {c.custom_core_attrs}
    type: {c.type_type_annotation_and_value}
    sharedModifier: {c.modifier_annotation_and_value}
    unsharedKeys: {c.unshared_keys_annotation_and_value}

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


def generate_core_args_as_typed_dicts(
    output_file,
):
    import setta.types.generated.cores

    code = """
from typing import Literal, Any, NotRequired, TypedDict
from setta.types.code_obj_impls import CodeObjType
from setta.types.section_impls import SectionType
from setta.types.generated.modifiers import BaseCodeObjModifier, BaseSectionModifier
"""

    classes = get_core_classes()
    for c in classes.values():
        code += create_model_args_as_typed_dict(
            c,
            [
                setta.types.generated.cores.BaseSectionCore,
                setta.types.generated.cores.BaseCodeObjCore,
            ],
            c.args_name,
            c.parent_args_class_names,
        )

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def additional_args_types_callback(c: CoreClassInfoForGeneration):
    return f"overrides: {c.args_name} | None = None"


def additional_args_generic_type_callback():
    return "overrides: Any = None"


def implementation_callback(c: CoreClassInfoForGeneration, additiona_args):
    return f"""
                    if overrides is None:
                        overrides = {{}}
                    return {c.original_name}(**overrides)
"""


def generate_core_creation_fns(output_file: Path):
    classes = get_core_classes()
    code = output_file.read_text()
    args_imports = ",\n    ".join([cls.args_name for cls in classes.values()])
    code = f"""
from typing import overload
from setta.types.generated.core_args_as_typed_dicts import (
    {args_imports}
)

{code}
"""
    code += get_creation_fns(
        classes,
        "core",
        additional_args_types_callback=additional_args_types_callback,
        additional_args_generic_type_callback=additional_args_generic_type_callback,
        implementation_callback=implementation_callback,
    )
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    generate_cores(
        get_absolute_path(
            __file__, Path("../../backend/setta/types/generated") / "cores.py"
        ),
    )
    generate_core_args_as_typed_dicts(
        get_absolute_path(
            __file__,
            Path("../../backend/setta/types/generated") / "core_args_as_typed_dicts.py",
        ),
    )
    generate_core_creation_fns(
        get_absolute_path(
            __file__,
            Path("../../backend/setta/types/generated") / "cores.py",
        ),
    )
