from pathlib import Path
from typing import (
    Dict,
    Set,
)

from pydantic_core import PydanticUndefined
from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.section_impls import BaseSectionImpl
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    get_impl_classes,
    get_name_without_impl,
    python_type_to_str,
)

# Default unsharedKeys for each section type
# Add or modify entries here to set default unshared keys
DEFAULT_SECTION_UNSHARED_KEYS: Dict[str, Set[str]] = {
    "Callable": {"callable", "codeObjImplLayeringMap"},
    "Dict": {"topLevelParamIds", "codeObjImplLayeringMap"},
    "ListRoot": set(),
    "DictRoot": set(),
    "Group": set(),
    "Image": set(),
    "Chart": set(),
    "Draw": set(),
    "TextBlock": set(),
    "Social": set(),
    "GlobalVariables": set(),
    "Code": set(),
    "GenPythonCode": set(),
    "Terminal": set(),
    "IFrame": set(),
    "Chat": set(),
    "Browser": set(),
}

# Default unsharedKeys for each code obj type
DEFAULT_CODE_OBJ_UNSHARED_KEYS: Dict[str, Set[str]] = {
    "CodeCallable": set(),
    "CodeParam": {"value"},
    "TextParam": {"value"},
    "SliderParam": {"value"},
    "SwitchParam": {"value"},
    "ColorPickerParam": {"value"},
    "DropdownParam": {"value"},
    "PasswordParam": {"value"},
    "NestedParam": set(),
}


def generate_cores(output_file, classes):
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

    for c in classes:
        modifier_name = get_name_without_impl(c.__name__) + "Modifier"
        modifier_names.append(modifier_name)

        impl_fields_name = c.__name__ + "Fields"
        impl_fields.append(impl_fields_name)

        if c is BaseSectionImpl:
            code += f"""
class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: {modifier_name}
    unsharedKeys: {impl_fields_name}

"""
        elif c is BaseCodeObjImpl:
            code += f"""
class BaseCodeObjCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: {modifier_name}
    unsharedKeys: {impl_fields_name}

"""
        else:
            class_name = get_name_without_impl(c.__name__) + "Core"
            parent_class_names = ", ".join(
                get_name_without_impl(b.__name__) + "Core" for b in c.__bases__
            )
            type_annotation = python_type_to_str(c.model_fields["type"].annotation)
            shared_modifier = modifier_name
            unshared_keys = f"list[{impl_fields_name}]"
            if c.model_fields["type"].default is not PydanticUndefined:
                default_val = c.model_fields["type"].default
                type_value = f"{default_val.__class__.__name__}.{default_val.value}"
                type_annotation = f"{type_annotation} = {type_value}"
                shared_modifier = f"""{shared_modifier} = Field( # type: ignore
    default_factory = lambda: create_modifier({type_value})
)
"""
                if "Section" in class_name:
                    default_keys = DEFAULT_SECTION_UNSHARED_KEYS[default_val.value]
                elif "CodeObj" in class_name:
                    default_keys = DEFAULT_CODE_OBJ_UNSHARED_KEYS[default_val.value]
                else:
                    raise ValueError
                default_keys = [f'"{v}"' for v in sorted(default_keys)]
                unshared_keys = f"""{unshared_keys} = Field( # type: ignore
    default_factory = lambda: [{", ".join(default_keys)}]
)
"""
            else:
                shared_modifier += " # type: ignore"
                unshared_keys += " # type: ignore"

            code += f"""
class {class_name}({parent_class_names}):
    type: {type_annotation}
    sharedModifier: {shared_modifier}
    unsharedKeys: {unshared_keys}

"""

    cases = {}
    for c in classes:
        if c.model_fields["type"].default is PydanticUndefined:
            continue
        core_name = f"{get_name_without_impl(c.__name__)}Core"
        type_attribute = python_type_to_str(c.model_fields["type"].annotation)
        default_val = c.model_fields["type"].default
        cases[f"{default_val.__class__.__name__}.{default_val.value}"] = core_name
        code += f"""
@overload
def create_core(type_: {type_attribute}) -> {core_name}:
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
