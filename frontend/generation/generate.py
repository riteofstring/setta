import inspect
import types
from collections.abc import Sequence as ABCSequence
from enum import Enum
from pathlib import Path
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
import setta.types.generated.cores
import setta.types.generated.layerings
import setta.types.generated.modifiers
import setta.types.section_impls
from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


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


def get_name_without_impl(x):
    return x.rstrip("Impl")


def get_class_to_children_mapping(module, base_class):
    classes = find_sub_classes(module, base_class)
    class_to_children = {}
    for c in classes:
        child_classes = find_sub_classes(module, c)
        children = [x for x in child_classes if c is not x]
        if len(children) > 0:
            class_to_children[c] = children
    return class_to_children


def construct_unions(
    module,
    base_class,
    discriminator,
    module_to_import_in_gen_file,
    class_transformer,
    return_class_mapping=False,
):
    class_to_children = get_class_to_children_mapping(module, base_class)
    code = """
from typing import Annotated,Union,TypeGuard
from pydantic import Field, TypeAdapter

"""
    for base_class, child_classes in class_to_children.items():
        code += f"from {module_to_import_in_gen_file.__name__} import {class_transformer(base_class.__name__)}\n\n"
        for child_class in child_classes:
            code += f"from {module_to_import_in_gen_file.__name__} import {class_transformer(child_class.__name__)}\n\n"

    for base_class, child_classes in class_to_children.items():
        union_name = f"{class_transformer(base_class.__name__)}Union"
        code += f"{union_name} = Union[{', '.join(class_transformer(c.__name__) for c in child_classes)}]\n\n"
        code += f'{union_name}WithDiscriminator = Annotated[{union_name}, Field(discriminator="{discriminator}")]\n\n'
        code += f"{class_transformer(base_class.__name__)}TypeAdapter = TypeAdapter({union_name}WithDiscriminator)\n\n"

        defaults = []
        for c in child_classes:
            d = c.model_fields[discriminator].default
            if d is PydanticUndefined:
                continue
            # assert enum name and value are the same for simplicity
            assert d.name == d.value
            defaults.append(f'"{d.name}"')
        defaults = ", ".join(defaults)
        code += (
            f"{class_transformer(base_class.__name__)}TypeSet = set([{defaults}])\n\n"
        )

    if return_class_mapping:
        return code, class_to_children
    return code


# This function differs from the section_impl and code_obj_impl functions above
# because all websocket msgs extend WebsocketMsg, so we differentiate based on enum alone
def generate_websocket_union_code(
    enum_type, direction_name, discriminator="messageType"
):
    enum_names = []
    for e in enum_type:
        # assert enum name and value are the same for simplicity
        assert e.name == e.value
        enum_names.append(e.name)

    class_names = [f"WebsocketMsg{e}" for e in enum_names]
    classes_str = ",".join(class_names)

    imports = f"from setta.types.websocket import {classes_str}"

    enum_names_quoted = [f'"{e}"' for e in enum_names]

    union_code = f"""
WebsocketMsg{direction_name}Union = Union[{classes_str}]

WebsocketMsg{direction_name}UnionWithDiscriminator = Annotated[WebsocketMsg{direction_name}Union, Field(discriminator="{discriminator}")]

WebsocketMsg{direction_name}TypeAdapter = TypeAdapter(WebsocketMsg{direction_name}UnionWithDiscriminator)

WebsocketMsg{direction_name}TypeSet = set([{",".join(enum_names_quoted)}])
"""

    return imports, union_code, enum_names


def websocket_msg_union():
    from setta.types.websocket import (
        WebsocketMsgTypeForBackend,
        WebsocketMsgTypeForFrontend,
    )

    # Generate code for both directions
    backend_imports, backend_code, _ = generate_websocket_union_code(
        WebsocketMsgTypeForBackend, "ForBackend"
    )
    frontend_imports, frontend_code, _ = generate_websocket_union_code(
        WebsocketMsgTypeForFrontend, "ForFrontend"
    )

    return f"""
from typing import Annotated,Union
from pydantic import Field, TypeAdapter
{backend_imports}
{frontend_imports}
{backend_code}
{frontend_code}
"""


def add_type_predicate_fns(most_base_type, base_class_to_children, class_transformer):
    code = ""
    for base_class in base_class_to_children.keys():
        transformed_base_class_name = class_transformer(base_class.__name__)
        set_name = f"{transformed_base_class_name}TypeSet"
        code += f"""
def is{transformed_base_class_name}(x: {most_base_type})->TypeGuard[{transformed_base_class_name}]:
    return x["type"] in {set_name}

"""
    return code


def generate_unions(output_file):
    code = construct_unions(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        setta.types.section_impls,
        lambda x: x,
    )
    code += construct_unions(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        setta.types.code_obj_impls,
        lambda x: x,
    )  # type: ignore

    code += construct_unions(
        setta.types.generated.cores,
        setta.types.generated.cores.BaseSectionCore,
        "type",
        setta.types.generated.cores,
        lambda x: x,
    )  # type: ignore
    code += construct_unions(
        setta.types.generated.cores,
        setta.types.generated.cores.BaseCodeObjCore,
        "type",
        setta.types.generated.cores,
        lambda x: x,
    )  # type: ignore
    code += construct_unions(
        setta.types.generated.layerings,
        setta.types.generated.layerings.BaseSectionLayering,
        "type",
        setta.types.generated.layerings,
        lambda x: x,
    )  # type: ignore
    code += construct_unions(
        setta.types.generated.layerings,
        setta.types.generated.layerings.BaseCodeObjLayering,
        "type",
        setta.types.generated.layerings,
        lambda x: x,
    )  # type: ignore

    modifier_code1, modifier_class_mapping1 = construct_unions(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        setta.types.generated.modifiers,
        lambda x: f"{get_name_without_impl(x)}Modifier",
        True,
    )

    modifier_code2, modifier_class_mapping2 = construct_unions(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        setta.types.generated.modifiers,
        lambda x: f"{get_name_without_impl(x)}Modifier",
        True,
    )

    code += modifier_code1 + modifier_code2  # type: ignore

    code += add_type_predicate_fns(
        "BaseSectionModifier",
        modifier_class_mapping1,
        lambda x: f"{get_name_without_impl(x)}Modifier",
    )

    code += add_type_predicate_fns(
        "BaseCodeObjModifier",
        modifier_class_mapping2,
        lambda x: f"{get_name_without_impl(x)}Modifier",
    )

    code = ruff_format(code)
    output_file.write_text(code)


def generate_impl_field_literals(output_file, classes):
    def get_all_field_names(impl_class: type[BaseModel]) -> set[str]:
        """Get all field names for a class, including inherited fields."""
        field_names = set()

        # Get fields from the class and all its parent classes
        for cls in impl_class.__mro__:
            if issubclass(cls, BaseModel) and cls is not BaseModel:
                field_names.update(cls.model_fields.keys())

        return field_names

    def generate_field_literal_type(impl_class_name: str, field_names: set[str]) -> str:
        """Generate a Literal type alias for impl fields."""
        # Sort field names for consistent output
        sorted_fields = sorted(field_names)

        # Create the Literal values, excluding the standard exclusions
        literal_values = ", ".join(
            f'"{field}"'
            for field in sorted_fields
            if field not in ["id", "name", "type", "isPreset"]
        )

        # Generate the type alias name and definition
        type_alias_name = f"{impl_class_name}Fields"
        return f"{type_alias_name} = Literal[{literal_values}]"

    # Generate header
    header = """# Auto-generated Literal type aliases for impl fields - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal
"""

    literals = []
    for cls in classes:
        field_names = get_all_field_names(cls)
        literal_def = generate_field_literal_type(cls.__name__, field_names)
        literals.append(literal_def)
    literals = "\n".join(literals)

    code = header + literals
    code = ruff_format(code)
    output_file.write_text(code)


def create_modifier(impl_class: type[BaseModel], base_classes):
    name = impl_class.__name__
    attributes = []
    for field_name, field_info in impl_class.model_fields.items():
        # Skip if field is in exclusions for base class
        if impl_class in base_classes and field_name in ["id", "name", "isPreset"]:
            continue

        # For non-base classes, skip if field is defined in ANY parent class (except type)
        if impl_class not in base_classes and field_name != "type":
            field_in_parent = False
            for parent in impl_class.__bases__:
                if (
                    hasattr(parent, "model_fields")
                    and field_name in parent.model_fields
                ):
                    field_in_parent = True
                    break
            if field_in_parent:
                continue

        annotation = python_type_to_str(field_info.annotation)
        if field_name != "type":
            annotation = f"NotRequired[{annotation}]"
        attributes.append(f"{field_name}: {annotation}")

    attributes = "\n\t".join(attributes)
    attributes = f"\t{attributes}"

    if impl_class in base_classes:
        parent_class = "TypedDict"
    else:
        # Handle multiple inheritance
        parent_classes = []
        for parent in impl_class.__bases__:
            if hasattr(parent, "model_fields"):  # Only include Pydantic model parents
                parent_classes.append(
                    f"{get_name_without_impl(parent.__name__)}Modifier"
                )
        parent_class = ", ".join(parent_classes)

    name = get_name_without_impl(name)
    code = f"""
class {name}Modifier({parent_class}):
{attributes}
"""
    return code


def generate_modifiers(output_file, classes):
    code = """
from typing import TypedDict, Literal, Any, NotRequired, overload
from setta.types.section_impls import (
    ChartSettings,
    DrawAreaCanvasSettings,
    SectionSize,
    Visibility,
    CodeLanguage,
    ConfigLanguage,
    TextBlockDisplayMode,
    TextBlockFormat,
    SectionType,
    SectionSizeMode
)
from setta.types.code_obj_impls import (
    ParameterPassingStyle,
    ParamNameType,
    ColorPickerChoice,
    CodeObjType
)

"""
    for c in classes:
        code += create_modifier(
            c,
            [
                setta.types.section_impls.BaseSectionImpl,
                setta.types.code_obj_impls.BaseCodeObjImpl,
            ],
        )

    cases = {}
    for c in classes:
        if c.model_fields["type"].default is PydanticUndefined:
            continue
        modifier_name = f"{get_name_without_impl(c.__name__)}Modifier"
        type_attribute = python_type_to_str(c.model_fields["type"].annotation)
        default_val = c.model_fields["type"].default
        cases[f"{default_val.__class__.__name__}.{default_val.value}"] = modifier_name
        code += f"""
@overload
def create_modifier(type_: {type_attribute}) -> {modifier_name}:
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
def create_modifier(type_: SectionType | CodeObjType):
    match type_:
{"\n".join(cases_str)}
"""
    code = ruff_format(code)
    output_file.write_text(code)


def generate_layerings(output_file, classes):
    code = """
from typing import Any, Literal

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

    code = (
        f"""
from setta.types.generated.modifiers import {", ".join(modifier_names)}
"""
        + code
    )

    code = ruff_format(code)
    output_file.write_text(code)


def generate_cores(output_file, classes):
    code = """
from typing import Any, Literal

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

        if c.__name__ == "BaseSectionImpl":
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
        elif c.__name__ == "BaseCodeObjImpl":
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
            if c.model_fields["type"].default is not PydanticUndefined:
                default_val = c.model_fields["type"].default
                type_value = f"{default_val.__class__.__name__}.{default_val.value}"
                type_annotation = f"{type_annotation} = {type_value}"
                shared_modifier = f"""{shared_modifier} = Field( # type: ignore
    default_factory = lambda: create_modifier({type_value})
)
"""

            code += f"""
class {class_name}({parent_class_names}):
    type: {type_annotation}
    sharedModifier: {shared_modifier} # type: ignore
    unsharedKeys: set[{impl_fields_name}] # type: ignore

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


def main(output_folder):
    classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
    )
    classes += find_sub_classes(
        setta.types.code_obj_impls, setta.types.code_obj_impls.BaseCodeObjImpl
    )

    generate_impl_field_literals(output_folder / "impl_field_literals.py", classes)
    generate_modifiers(output_folder / "modifiers.py", classes)
    generate_layerings(output_folder / "layerings.py", classes)
    generate_cores(output_folder / "cores.py", classes)
    generate_unions(output_folder / "unions.py")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
