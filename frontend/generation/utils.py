import inspect
import os
import subprocess
import types
from abc import ABC, abstractmethod
from collections import defaultdict
from collections.abc import Sequence as ABCSequence
from dataclasses import MISSING, dataclass, fields, is_dataclass
from enum import Enum
from typing import (
    Annotated,
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Set,
    Tuple,
    Type,
    TypeVar,
    Union,
    get_args,
    get_origin,
)

from pydantic import BaseModel
from pydantic_core import PydanticUndefined


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
    base_class: Type[Any],
) -> List[Type[Any]]:
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
        literals = ", ".join(literals)
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
        return "dict[str, Any]"

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


def get_class_children(module, c):
    return [x for x in find_sub_classes(module, c) if x is not c]


def get_field_default(cls: type, field_name: str) -> tuple[bool, Any]:
    """Return (has_default, default_value) for the given field on cls."""
    model_fields = getattr(cls, "model_fields", None)
    if model_fields is not None:
        field_info = model_fields[field_name]
        if field_info.default is not PydanticUndefined:
            return True, field_info.default
        default_factory = getattr(field_info, "default_factory", PydanticUndefined)
        if default_factory not in (PydanticUndefined, None):
            return True, default_factory()
        return False, None

    if is_dataclass(cls):
        for f in fields(cls):
            if f.name == field_name:
                if f.default is not MISSING:
                    return True, f.default
                if f.default_factory is not MISSING:  # type: ignore[attr-defined]
                    return True, f.default_factory()
                return False, None
        raise AttributeError(f"{cls.__name__} has no field named {field_name}")

    raise AttributeError(
        f"{cls.__name__} has no supported field metadata for {field_name}"
    )


def get_class_to_children_mapping(
    module, base_class, exclude_empty=False, required_discriminator=None
):
    classes = find_sub_classes(module, base_class)
    output = {}
    for c in classes:
        children = get_class_children(module, c)
        if required_discriminator:
            filtered_children = []
            for child in children:
                has_default, _ = get_field_default(child, required_discriminator)
                if has_default:
                    filtered_children.append(child)
            children = filtered_children
        if exclude_empty and len(children) == 0:
            continue
        output[c] = children
    return output


@dataclass
class BaseClassInfoForGeneration(ABC):
    """Base class for generating class information."""

    class_obj: Any
    children: list
    base_name: str

    @property
    def original_name(self) -> str:
        """The original class name."""
        return self.class_obj.__name__

    @property
    @abstractmethod
    def suffix(self) -> str:
        """The suffix used for this type of class (e.g., 'Impl' or 'Core')."""
        pass

    @property
    def parents(self):
        """Parent classes."""
        return self.class_obj.__bases__

    @property
    def parent_is_base_model(self) -> bool:
        """Check if BaseModel is a direct parent."""
        return BaseModel in self.parents

    @property
    def type_field(self):
        """The type field from the model."""
        return self.class_obj.model_fields.get("type")

    @property
    def type_value(self) -> str:
        """The value of the type field."""
        return self.type_field.default.value

    @property
    def type_full_enum_name(self) -> str:
        """Full enum name for the type."""
        return f"{self.type_field.default.__class__.__name__}.{self.type_value}"

    @property
    def type_has_default(self) -> bool:
        """Check if the type field has a default value."""
        return self.type_field and self.type_field.default is not PydanticUndefined

    @property
    def type_type_annotation(self) -> str:
        """Type annotation for the type field."""
        if self.type_field:
            return python_type_to_str(self.type_field.annotation)
        return ""

    @property
    def type_type_annotation_and_value(self) -> str:
        """Type annotation with optional default value."""
        if self.type_has_default:
            return f"{self.type_type_annotation} = {self.type_full_enum_name}"
        return self.type_type_annotation

    @property
    def parent_classes_up_to_base_model(self) -> list:
        """Get all parent classes up to BaseModel."""
        output = []
        for cls in self.class_obj.__mro__:
            if cls not in (BaseModel, object):
                output.append(cls)
        return output

    @property
    def parent_args_class_names(self) -> list[str]:
        return [p.__name__ + "Args" for p in self.parents]

    @property
    def parent_args_with_callable_class_names(self) -> list[str]:
        return [p.__name__ + "ArgsWithCallable" for p in self.parents]

    @property
    @abstractmethod
    def is_for_section(self) -> bool:
        pass

    @property
    @abstractmethod
    def is_for_code_obj(self) -> bool:
        pass


@dataclass
class ImplClassInfoForGeneration(BaseClassInfoForGeneration):
    """Class info for Impl classes with all the specific properties needed."""

    @property
    def suffix(self) -> str:
        return "Impl"

    @property
    def user_default_name(self) -> str:
        return "UserDefault" + self.original_name

    @property
    def args_name(self) -> str:
        return self.original_name + "Args"

    @property
    def args_with_callable_name(self) -> str:
        return self.original_name + "ArgsWithCallable"

    @property
    def impl_name(self) -> str:
        return self.original_name

    @property
    def parent_user_default_class_names(self) -> list[str]:
        return ["UserDefault" + p.__name__ for p in self.parents]

    @property
    def is_for_section(self) -> bool:
        import setta.types.section_impls

        return issubclass(self.class_obj, setta.types.section_impls.BaseSectionImpl)

    @property
    def is_for_code_obj(self) -> bool:
        import setta.types.code_obj_impls

        return issubclass(self.class_obj, setta.types.code_obj_impls.BaseCodeObjImpl)


def get_impl_classes():
    import setta.types.code_obj_impls
    import setta.types.section_impls

    classes = find_sub_classes(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
    )
    classes += find_sub_classes(
        setta.types.code_obj_impls, setta.types.code_obj_impls.BaseCodeObjImpl
    )
    output: dict[str, ImplClassInfoForGeneration] = {}
    for c in classes:
        children = get_class_children(setta.types.section_impls, c)
        children += get_class_children(setta.types.code_obj_impls, c)
        base_name = c.__name__.removesuffix("Impl")
        output[c.__name__] = ImplClassInfoForGeneration(
            class_obj=c,
            children=children,
            base_name=base_name,
        )

    return output


T = TypeVar("T", bound=BaseClassInfoForGeneration)


def get_creation_fns(
    classes: dict[str, T],
    fn_type: Literal["modifier", "core", "variant", "impl"],
    additional_args_types_callback: Callable[[T], str] | None = None,
    additional_args_inputs_callback: Callable[[T], str] | None = None,
    additional_args_generic_type_callback: Callable[[], str] | None = None,
    implementation_callback: Callable[[T, str], str] | None = None,
):
    if additional_args_types_callback is None:

        def additional_args_types_callback(_cls: T) -> str:
            return ""

    if additional_args_inputs_callback is None:

        def additional_args_inputs_callback(_cls: T) -> str:
            return ""

    if additional_args_generic_type_callback is None:

        def additional_args_generic_type_callback() -> str:
            return ""

    if implementation_callback is None:

        def implementation_callback(c: T, additional_args: str) -> str:
            return f"""
                return {getattr(c, f"{fn_type}_name")}(type=type, {additional_args})"""

    cases: dict[str, list[T]] = defaultdict(list)
    code = ""
    for c in classes.values():
        if not c.type_has_default:
            continue
        suffix_prefix = "section" if c.is_for_section else "code_obj"
        cases[suffix_prefix].append(c)
        fn_name_suffix = f"{suffix_prefix}_{fn_type}"
        additional_args = additional_args_types_callback(c)
        code += f"""
@overload
def create_{fn_name_suffix}(type: {c.type_type_annotation}, {additional_args}) -> {getattr(c, f"{fn_type}_name")}:
    ...
"""

    for impl_category, category_classes in cases.items():
        cases_str = []
        for c in category_classes:
            additional_args = additional_args_inputs_callback(c)
            curr_case = f"""
            case {c.type_full_enum_name}:
{implementation_callback(c, additional_args)}
            """
            cases_str.append(curr_case)

        additional_args = additional_args_generic_type_callback()
        input_type = "SectionType" if impl_category == "section" else "CodeObjType"
        code += f"""
def create_{impl_category}_{fn_type}(type: {input_type}, {additional_args}):
    match type:
{"\n".join(cases_str)}
"""

    return code


def get_impl_unions(name_filters: list[str], exclusion_filters: list[str]):
    import setta.types.generated.unions

    unions = []

    for name in dir(setta.types.generated.unions):
        if name.startswith("_"):
            continue

        if not all(n in name for n in name_filters):
            continue
        if any(n in name for n in exclusion_filters):
            continue

        attr = getattr(setta.types.generated.unions, name)

        origin = get_origin(attr)
        if origin in (Union, types.UnionType):
            unions.append((name, attr))

    return unions
