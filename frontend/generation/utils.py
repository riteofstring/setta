import inspect
import os
import subprocess
import types
from collections.abc import Sequence as ABCSequence
from dataclasses import dataclass
from enum import Enum
from typing import (
    Annotated,
    Any,
    Dict,
    List,
    Literal,
    Set,
    Tuple,
    Type,
    Union,
    get_args,
    get_origin,
)

import setta.types.code_obj_impls
import setta.types.section_impls
from pydantic import BaseModel
from pydantic_core import PydanticUndefined

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


def format_generated_code(output_file):
    # Suppress Node warnings
    env = os.environ.copy()
    env["NODE_NO_WARNINGS"] = "1"

    try:
        subprocess.run(
            ["npx", "prettier", str(output_file), "--write"], check=True, env=env
        )
        print(f"Formatted {output_file} with Prettier")
    except subprocess.CalledProcessError:
        print("Warning: Prettier formatting failed.")


def find_sub_classes(
    module: Any,
    base_class: Type[BaseModel],
) -> List[Type[BaseModel]]:
    classes = []

    # Get all classes that match our criteria
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            classes.append(obj)

    # Sort by line number where the class is defined
    def get_line_number(cls):
        try:
            return inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            return float("inf")  # Put classes without source at the end

    classes.sort(key=get_line_number)

    return classes


def python_type_to_str(python_type):
    # Handle None type
    if python_type is type(None):
        return "None"

    # Get the origin for generic types
    origin = get_origin(python_type)

    # Handle built-in types that aren't from typing module
    if origin is None:
        # Check if the type itself is a built-in collection type
        if python_type in (list, dict, set, tuple):
            origin = python_type

    # Handle Annotated types - extract the actual type (first arg)
    if origin is Annotated:
        args = get_args(python_type)
        if args:
            # The first argument is the actual type, rest are annotations
            return f"Annotated[{python_type_to_str(args[0])}, {python_type_to_str(args[1])}]"
        return "Any"

    # Handle Literal types
    if origin is Literal:
        args = get_args(python_type)
        # Convert each literal value to zod syntax
        # Multiple literals - use union
        literals = []
        for arg in args:
            if isinstance(arg, Enum):
                literals.append(f"{arg.__class__.__name__}.{arg.name}")
            elif isinstance(arg, str):
                literals.append(f'"{arg}"')
            elif isinstance(arg, bool):
                literals.append(f"{str(arg).lower()}")
            else:
                literals.append(f"{arg}")
        literals = " | ".join(literals)
        return f"Literal[{literals}]"

    # Handle Optional/Union types
    if origin in (Union, types.UnionType):
        args = get_args(python_type)
        # Check if it's Optional (Union with None)
        ts_types = [python_type_to_str(t) for t in args]
        return " | ".join(ts_types)

    # Handle list/List types
    if origin in (list, List, ABCSequence):
        args = get_args(python_type)
        if args:
            element_ts_type = python_type_to_str(args[0])
            return f"list[{element_ts_type}]"
        return "list[Any]"

    # Handle dict/Dict types
    if origin in (dict, Dict):
        args = get_args(python_type)
        if args and len(args) >= 2:
            key_ts_type = python_type_to_str(args[0])
            value_ts_type = python_type_to_str(args[1])
            return f"dict[{key_ts_type}, {value_ts_type}]"
        return "dict[string, Any]"

    # Handle set/Set types
    if origin in (set, Set):
        args = get_args(python_type)
        if args:
            element_ts_type = python_type_to_str(
                args[0],
            )
            return f"set[{element_ts_type}]"
        return "set[Any]"

    # Handle tuple/Tuple types
    if origin in (tuple, Tuple):
        args = get_args(python_type)
        ts_types = [python_type_to_str(t) for t in args]
        return f"tuple[{', '.join(ts_types)}]"

    return python_type.__name__


def get_class_to_children_mapping(module, c):
    return [x for x in find_sub_classes(module, c) if x is not c]


@dataclass
class ImplClassInfoForGeneration:
    class_obj: Any
    children: list
    base_name: str

    @property
    def original_name(self):
        return self.class_obj.__name__

    @property
    def user_default_name(self):
        return "UserDefault" + self.original_name

    @property
    def modifier_name(self):
        return self.base_name + "Modifier"

    @property
    def core_name(self):
        return self.base_name + "Core"

    @property
    def layering_name(self):
        return self.base_name + "Layering"

    @property
    def impl_fields_name(self):
        return self.base_name + "ImplFields"

    @property
    def parents(self):
        return self.class_obj.__bases__

    @property
    def parent_user_default_class_names(self):
        return ["UserDefault" + p.__name__ for p in self.parents]

    @property
    def parent_core_class_names(self):
        return [p.__name__.rstrip("Impl") + "Core" for p in self.parents]

    @property
    def parent_layering_class_names(self):
        return [p.__name__.rstrip("Impl") + "Layering" for p in self.parents]

    @property
    def parent_modifier_class_names(self):
        return [p.__name__.rstrip("Impl") + "Modifier" for p in self.parents]

    @property
    def parent_is_base_model(self):
        return BaseModel in self.parents

    @property
    def type_field(self):
        return self.class_obj.model_fields["type"]

    @property
    def type_value(self):
        return f"{self.type_field.default.__class__.__name__}.{self.type_field.default.value}"

    @property
    def type_has_default(self):
        return self.type_field.default is not PydanticUndefined

    @property
    def type_type_annotation(self):
        return python_type_to_str(self.type_field.annotation)

    @property
    def type_type_annotation_and_value(self):
        if self.type_has_default:
            return f"{self.type_type_annotation} = {self.type_value}"
        return self.type_type_annotation

    @property
    def modifier_annotation_and_value(self):
        modifier = self.modifier_name
        if self.type_has_default:
            modifier = f"""{modifier} = Field( # type: ignore[override]
    default_factory = lambda: create_modifier({self.type_value})
)
"""
        else:
            modifier = f"{modifier} # type: ignore[override]"
        return modifier

    @property
    def unshared_keys_annotation_and_value(self):
        unshared_keys = f"list[{self.impl_fields_name}]"
        if self.type_has_default:
            if self.is_section_impl:
                default_keys = DEFAULT_SECTION_UNSHARED_KEYS[
                    self.type_field.default.value
                ]
            elif self.is_code_obj_impl:
                default_keys = DEFAULT_CODE_OBJ_UNSHARED_KEYS[
                    self.type_field.default.value
                ]
            else:
                raise ValueError
            default_keys = [f'"{v}"' for v in sorted(default_keys)]
            unshared_keys = f"""{unshared_keys} = Field( # type: ignore[override]
    default_factory = lambda: [{", ".join(default_keys)}]
)
"""
        else:
            unshared_keys = f"{unshared_keys} # type: ignore[override]"
        return unshared_keys

    @property
    def is_section_impl(self):
        return issubclass(self.class_obj, setta.types.section_impls.BaseSectionImpl)

    @property
    def is_code_obj_impl(self):
        return issubclass(self.class_obj, setta.types.code_obj_impls.BaseCodeObjImpl)


def get_impl_classes():
    classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
    )
    classes += find_sub_classes(
        setta.types.code_obj_impls, setta.types.code_obj_impls.BaseCodeObjImpl
    )
    output: dict[str, ImplClassInfoForGeneration] = {}
    for c in classes:
        children = get_class_to_children_mapping(setta.types.section_impls, c)
        children += get_class_to_children_mapping(setta.types.code_obj_impls, c)
        base_name = c.__name__.rstrip("Impl")
        output[c.__name__] = ImplClassInfoForGeneration(
            class_obj=c,
            children=children,
            base_name=base_name,
        )

    return output


def get_creation_fns(
    classes: dict[str, ImplClassInfoForGeneration],
    fn_type: Literal["modifier", "core", "layering"],
    additional_args: dict[str, str] | None = None,
):
    if additional_args is None:
        additional_args = {}
    additional_args_types_str = ""
    additional_args_input_str = ""
    for k, v in additional_args.items():
        additional_args_types_str += f"{k}: {v},"
        additional_args_input_str += f"{k}={k}"
    cases = {}
    code = ""
    for c in classes.values():
        if not c.type_has_default:
            continue
        cases[c.type_value] = getattr(c, f"{fn_type}_name")
        code += f"""
@overload
def create_{fn_type}(type: {c.type_type_annotation}, {additional_args_types_str}) -> {getattr(c, f"{fn_type}_name")}:
    ...
"""

    cases_str = []
    for type_name, name in cases.items():
        curr_case = f"""
        case {type_name}:
            return {name}(type=type, {additional_args_input_str})
        """
        cases_str.append(curr_case)

    code += f"""
def create_{fn_type}(type: SectionType | CodeObjType, {additional_args_types_str}):
    match type:
{"\n".join(cases_str)}
"""
    return code
