#!/usr/bin/env python3
"""
Type system utilities generator.

This script generates:
1. Union types for all generated classes
2. Type conversion functions (type_to_core, type_to_modifier)
3. Helper functions with overloads (get_effective_impl, set_effective_impl_value)
4. WebSocket message unions
"""

import inspect
from pathlib import Path
from typing import Any, List, Type, get_args

from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

# ============== Common Utilities ==============


def find_sub_classes(
    module: Any,
    base_class: Type[BaseModel],
    discriminator: str,
    return_base_classes: bool,
    return_input_base_class: bool,
) -> List[Type[BaseModel]]:
    """Find subclasses of a base class in a module."""
    classes = []

    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            fields = obj.model_fields
            if not return_input_base_class and obj is base_class:
                continue
            if (
                return_base_classes
                and discriminator in fields
                and fields[discriminator].default is PydanticUndefined
            ):
                classes.append(obj)
            elif (
                not return_base_classes
                and discriminator in fields
                and fields[discriminator].default is not PydanticUndefined
            ):
                classes.append(obj)

    # Sort by line number where the class is defined
    def get_line_number(cls):
        try:
            return inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            return float("inf")

    classes.sort(key=get_line_number)
    return classes


def get_base_child_mapping(module, base_class, discriminator):
    """Get mapping of base classes to their children."""
    base_classes = find_sub_classes(module, base_class, discriminator, True, True)
    base_class_to_children = {}
    for base in base_classes:
        child_classes = find_sub_classes(module, base, discriminator, False, True)
        base_class_to_children[base] = child_classes
    return base_class_to_children


def extract_type_value(impl_name: str) -> str:
    """Extract the enum value from impl class name."""
    if impl_name.endswith("SectionImpl"):
        return impl_name[:-11]  # Remove "SectionImpl"
    elif impl_name.endswith("CodeObjImpl"):
        return impl_name[:-11]  # Remove "CodeObjImpl"
    else:
        raise ValueError(f"Unexpected impl name format: {impl_name}")


def get_union_members(union_type):
    """Extract member types from a Union type."""
    return get_args(union_type)


# ============== Union Generation ==============


class UnionGenerator:
    """Generates union types and related utilities."""

    def generate_unions(
        self,
        module,
        base_class,
        discriminator,
        module_to_import,
        class_transformer,
        add_type_predicates=False,
        is_core=False,
    ) -> str:
        """Generate union types for a module's classes."""
        base_class_to_children = get_base_child_mapping(
            module, base_class, discriminator
        )

        code = """from typing import Annotated, Union, TypeGuard
from pydantic import Field, TypeAdapter

"""

        # Add imports
        for base, child_classes in base_class_to_children.items():
            # For cores, we need to check if it's the root base class
            if is_core and base.__name__ in ["BaseSectionCore", "BaseCodeObjCore"]:
                # Root base core is in the same module as children
                code += f"from {module_to_import.__name__} import {class_transformer(base.__name__)}\n"
            else:
                code += f"from {module_to_import.__name__} import {class_transformer(base.__name__)}\n"

            for child_class in child_classes:
                code += f"from {module_to_import.__name__} import {class_transformer(child_class.__name__)}\n"
        code += "\n"

        # Generate unions
        for base, child_classes in base_class_to_children.items():
            union_name = f"{class_transformer(base.__name__)}Union"
            child_names = [class_transformer(c.__name__) for c in child_classes]

            # Union type
            code += f"{union_name} = Union[{', '.join(child_names)}]\n\n"

            # Discriminated union
            code += f'{union_name}WithDiscriminator = Annotated[{union_name}, Field(discriminator="{discriminator}")]\n\n'

            # Type adapter
            code += f"{class_transformer(base.__name__)}TypeAdapter = TypeAdapter({union_name}WithDiscriminator)\n\n"

            # Type set
            defaults = []
            for c in child_classes:
                d = c.model_fields[discriminator].default
                # assert enum name and value are the same
                assert d.name == d.value
                defaults.append(f'"{d.name}"')
            code += f"{class_transformer(base.__name__)}TypeSet = set([{', '.join(defaults)}])\n\n"

        # Add type predicates if requested
        if add_type_predicates:
            most_base_type = f"{class_transformer(base_class.__name__)}Union"
            for base in base_class_to_children.keys():
                transformed_name = class_transformer(base.__name__)
                set_name = f"{transformed_name}TypeSet"
                code += f"""
def is{transformed_name}(x: {most_base_type}) -> TypeGuard[{transformed_name}]:
    return x["type"] in {set_name}

"""

        return code

    def generate_websocket_unions(self) -> str:
        """Generate WebSocket message unions."""
        from setta.types.websocket import (
            WebsocketMsgTypeForBackend,
            WebsocketMsgTypeForFrontend,
        )

        code = """from typing import Annotated, Union
from pydantic import Field, TypeAdapter

"""

        # Generate for backend messages
        backend_names = []
        for msg_type in WebsocketMsgTypeForBackend:
            assert msg_type.name == msg_type.value
            backend_names.append(f"WebsocketMsg{msg_type.name}")

        code += f"from setta.types.websocket import {', '.join(backend_names)}\n"

        # Generate for frontend messages
        frontend_names = []
        for msg_type in WebsocketMsgTypeForFrontend:
            assert msg_type.name == msg_type.value
            frontend_names.append(f"WebsocketMsg{msg_type.name}")

        code += f"from setta.types.websocket import {', '.join(frontend_names)}\n\n"

        # Backend union
        code += f"""
WebsocketMsgForBackendUnion = Union[{", ".join(backend_names)}]

WebsocketMsgForBackendUnionWithDiscriminator = Annotated[WebsocketMsgForBackendUnion, Field(discriminator="messageType")]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(WebsocketMsgForBackendUnionWithDiscriminator)

WebsocketMsgForBackendTypeSet = set([{", ".join(f'"{t.name}"' for t in WebsocketMsgTypeForBackend)}])
"""

        # Frontend union
        code += f"""

WebsocketMsgForFrontendUnion = Union[{", ".join(frontend_names)}]

WebsocketMsgForFrontendUnionWithDiscriminator = Annotated[WebsocketMsgForFrontendUnion, Field(discriminator="messageType")]

WebsocketMsgForFrontendTypeAdapter = TypeAdapter(WebsocketMsgForFrontendUnionWithDiscriminator)

WebsocketMsgForFrontendTypeSet = set([{", ".join(f'"{t.name}"' for t in WebsocketMsgTypeForFrontend)}])
"""

        return code


# ============== Type Conversion Functions ==============


class TypeConversionGenerator:
    """Generates type conversion functions."""

    def generate_type_to_modifier(self) -> str:
        """Generate type to modifier conversion functions."""
        # Import to get union types
        from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
        from setta.types.generated.section_type_unions import BaseSectionImplUnion

        # Extract types from unions
        section_impl_types = get_union_members(BaseSectionImplUnion)
        code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

        section_impl_names = [t.__name__ for t in section_impl_types]
        code_obj_impl_names = [t.__name__ for t in code_obj_impl_types]

        # Extract type values
        section_type_values = [extract_type_value(name) for name in section_impl_names]
        code_obj_type_values = [
            extract_type_value(name) for name in code_obj_impl_names
        ]

        # Generate imports
        imports = """from typing import Union, overload, Literal

from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType

"""

        # Modifier imports
        modifier_imports = []
        for impl_name in section_impl_names + code_obj_impl_names:
            modifier_imports.append(f"    {impl_name}Modifier,")

        imports += f"""from setta.types.generated.impl_modifiers import (
{chr(10).join(sorted(set(modifier_imports)))}
)

from setta.types.generated.impl_modifier_unions import (
    BaseSectionImplModifierUnion,
    BaseCodeObjImplModifierUnion,
)
"""

        # Generate section overloads
        section_overloads = "\n# Overloads for section type to modifier conversion"
        for type_value, impl_name in zip(section_type_values, section_impl_names):
            modifier_name = impl_name + "Modifier"
            section_overloads += f"""
@overload
def create_modifier_for_section_type(type_: Literal[SectionType.{type_value}]) -> {modifier_name}: ..."""

        section_overloads += """
@overload
def create_modifier_for_section_type(type_: SectionType) -> BaseSectionImplModifierUnion: ...
"""

        # Generate section function
        section_function = """

def create_modifier_for_section_type(type_: SectionType) -> BaseSectionImplModifierUnion:
    \"\"\"Create a SectionImplModifier for the given SectionType.\"\"\"
"""

        first = True
        for type_value, impl_name in zip(section_type_values, section_impl_names):
            modifier_name = impl_name + "Modifier"
            if first:
                section_function += f"""    if type_ == SectionType.{type_value}:
        return {modifier_name}(type=type_)"""
                first = False
            else:
                section_function += f"""
    elif type_ == SectionType.{type_value}:
        return {modifier_name}(type=type_)"""

        section_function += """
    else:
        raise ValueError(f"Unknown section type: {type_}")"""

        # Generate code obj overloads
        code_obj_overloads = (
            "\n\n\n# Overloads for code obj type to modifier conversion"
        )
        for type_value, impl_name in zip(code_obj_type_values, code_obj_impl_names):
            modifier_name = impl_name + "Modifier"
            code_obj_overloads += f"""
@overload
def create_modifier_for_code_obj_type(type_: Literal[CodeObjType.{type_value}]) -> {modifier_name}: ..."""

        code_obj_overloads += """
@overload
def create_modifier_for_code_obj_type(type_: CodeObjType) -> BaseCodeObjImplModifierUnion: ...
"""

        # Generate code obj function
        code_obj_function = """

def create_modifier_for_code_obj_type(type_: CodeObjType) -> BaseCodeObjImplModifierUnion:
    \"\"\"Create a CodeObjImplModifier for the given CodeObjType.\"\"\"
"""

        first = True
        for type_value, impl_name in zip(code_obj_type_values, code_obj_impl_names):
            modifier_name = impl_name + "Modifier"
            if first:
                code_obj_function += f"""    if type_ == CodeObjType.{type_value}:
        return {modifier_name}(type=type_)"""
                first = False
            else:
                code_obj_function += f"""
    elif type_ == CodeObjType.{type_value}:
        return {modifier_name}(type=type_)"""

        code_obj_function += """
    else:
        raise ValueError(f"Unknown code obj type: {type_}")"""

        return (
            imports
            + section_overloads
            + section_function
            + code_obj_overloads
            + code_obj_function
        )

    def generate_type_to_core(self) -> str:
        """Generate type to core conversion functions."""
        # Import to get union types
        from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
        from setta.types.generated.section_type_unions import BaseSectionImplUnion

        # Extract types from unions
        section_impl_types = get_union_members(BaseSectionImplUnion)
        code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

        section_impl_names = [t.__name__ for t in section_impl_types]
        code_obj_impl_names = [t.__name__ for t in code_obj_impl_types]

        # Extract type values
        section_type_values = [extract_type_value(name) for name in section_impl_names]
        code_obj_type_values = [
            extract_type_value(name) for name in code_obj_impl_names
        ]

        # Generate imports
        imports = """from typing import Union, overload, Literal, Any

from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType

"""

        # Core imports
        section_core_imports = [f"    {tv}SectionCore," for tv in section_type_values]
        code_obj_core_imports = [f"    {tv}CodeObjCore," for tv in code_obj_type_values]

        imports += f"""from setta.types.generated.section_cores import (
{chr(10).join(section_core_imports)}
)

from setta.types.generated.code_obj_cores import (
{chr(10).join(code_obj_core_imports)}
)

"""

        # Modifier and field literal imports
        modifier_imports = []
        field_literal_imports = []

        for impl_name in section_impl_names + code_obj_impl_names:
            modifier_imports.append(f"    {impl_name}Modifier,")
            field_literal_imports.append(f"    {impl_name}Fields,")

        imports += f"""from setta.types.generated.impl_modifiers import (
{chr(10).join(sorted(set(modifier_imports)))}
)

from setta.types.generated.impl_field_literals import (
{chr(10).join(sorted(set(field_literal_imports)))}
)

from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
"""

        # Generate section overloads
        section_overloads = "\n# Overloads for section type to core conversion"

        # Import actual impl classes to introspect
        import setta.types.code_obj_impls
        import setta.types.section_impls

        for type_value, impl_name in zip(section_type_values, section_impl_names):
            core_name = type_value + "SectionCore"
            impl_class = getattr(setta.types.section_impls, impl_name)
            modifier_type = f"{impl_name}Modifier"
            field_literal_type = f"{impl_name}Fields"

            section_overloads += f"""
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.{type_value}],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: {modifier_type} | None = None,
    unsharedKeys: set[{field_literal_type}] | None = None
) -> {core_name}: ..."""

        section_overloads += """
@overload
def create_core_for_section_type(
    type_: SectionType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseSectionCoreUnion: ...
"""

        # Generate section function
        section_function = """

def create_core_for_section_type(
    type_: SectionType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseSectionCoreUnion:
    \"\"\"Create a SectionCore for the given SectionType.
    
    Args:
        type_: The SectionType enum value
        id: Optional custom ID for the core
        name: Optional custom name for the core
        implLayerings: Optional implementation layering IDs
        defaultImplLayering: Optional default layering ID
        sharedModifier: Optional modifier (must match the type)
        unsharedKeys: Optional set of keys to exclude from sharing
    
    The overloaded signatures above provide full type checking for each specific
    SectionType with properly typed parameters.
    \"\"\"
    # Build kwargs dict with only non-None values
    core_kwargs = {}
    
    if id is not None:
        core_kwargs['id'] = id
    if name is not None:
        core_kwargs['name'] = name
    if implLayerings is not None:
        core_kwargs['implLayerings'] = implLayerings
    if defaultImplLayering is not None:
        core_kwargs['defaultImplLayering'] = defaultImplLayering
    if sharedModifier is not None:
        core_kwargs['sharedModifier'] = sharedModifier
    if unsharedKeys is not None:
        core_kwargs['unsharedKeys'] = unsharedKeys
"""

        first = True
        for type_value in section_type_values:
            core_name = type_value + "SectionCore"
            if first:
                section_function += f"""
    if type_ == SectionType.{type_value}:
        return {core_name}(**core_kwargs)"""
                first = False
            else:
                section_function += f"""
    elif type_ == SectionType.{type_value}:
        return {core_name}(**core_kwargs)"""

        section_function += """
    else:
        raise ValueError(f"Unknown section type: {type_}")"""

        # Generate code obj overloads
        code_obj_overloads = "\n\n\n# Overloads for code obj type to core conversion"

        for type_value, impl_name in zip(code_obj_type_values, code_obj_impl_names):
            core_name = type_value + "CodeObjCore"
            impl_class = getattr(setta.types.code_obj_impls, impl_name)
            modifier_type = f"{impl_name}Modifier"
            field_literal_type = f"{impl_name}Fields"

            code_obj_overloads += f"""
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.{type_value}],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: {modifier_type} | None = None,
    unsharedKeys: set[{field_literal_type}] | None = None
) -> {core_name}: ..."""

        code_obj_overloads += """
@overload
def create_core_for_code_obj_type(
    type_: CodeObjType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseCodeObjCoreUnion: ...
"""

        # Generate code obj function
        code_obj_function = """

def create_core_for_code_obj_type(
    type_: CodeObjType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None
) -> BaseCodeObjCoreUnion:
    \"\"\"Create a CodeObjCore for the given CodeObjType.
    
    Args:
        type_: The CodeObjType enum value
        id: Optional custom ID for the core
        name: Optional custom name for the core
        implLayerings: Optional implementation layering IDs
        defaultImplLayering: Optional default layering ID
        sharedModifier: Optional modifier (must match the type)
        unsharedKeys: Optional set of keys to exclude from sharing
    
    The overloaded signatures above provide full type checking for each specific
    CodeObjType with properly typed parameters.
    \"\"\"
    # Build kwargs dict with only non-None values
    core_kwargs = {}
    
    if id is not None:
        core_kwargs['id'] = id
    if name is not None:
        core_kwargs['name'] = name
    if implLayerings is not None:
        core_kwargs['implLayerings'] = implLayerings
    if defaultImplLayering is not None:
        core_kwargs['defaultImplLayering'] = defaultImplLayering
    if sharedModifier is not None:
        core_kwargs['sharedModifier'] = sharedModifier
    if unsharedKeys is not None:
        core_kwargs['unsharedKeys'] = unsharedKeys
"""

        first = True
        for type_value in code_obj_type_values:
            core_name = type_value + "CodeObjCore"
            if first:
                code_obj_function += f"""
    if type_ == CodeObjType.{type_value}:
        return {core_name}(**core_kwargs)"""
                first = False
            else:
                code_obj_function += f"""
    elif type_ == CodeObjType.{type_value}:
        return {core_name}(**core_kwargs)"""

        code_obj_function += """
    else:
        raise ValueError(f"Unknown code obj type: {type_}")"""

        return (
            imports
            + section_overloads
            + section_function
            + code_obj_overloads
            + code_obj_function
        )


# ============== Helper Functions ==============


class HelperGenerator:
    """Generates helper functions with overloads."""

    def generate_impl_helpers(self) -> str:
        """Generate effective impl helper functions."""
        # Import to get union types
        from setta.types.generated.code_obj_type_unions import BaseCodeObjImplUnion
        from setta.types.generated.section_type_unions import BaseSectionImplUnion

        # Extract types from unions
        section_impl_types = get_union_members(BaseSectionImplUnion)
        code_obj_impl_types = get_union_members(BaseCodeObjImplUnion)

        section_impl_names = [t.__name__ for t in section_impl_types]
        code_obj_impl_names = [t.__name__ for t in code_obj_impl_types]

        # Extract type values
        section_type_values = [extract_type_value(name) for name in section_impl_names]
        code_obj_type_values = [
            extract_type_value(name) for name in code_obj_impl_names
        ]

        # Build imports
        section_impl_imports = "\n".join(f"    {name}," for name in section_impl_names)
        code_obj_impl_imports = "\n".join(
            f"    {name}," for name in code_obj_impl_names
        )

        section_core_imports = "\n".join(
            f"    {type_value}SectionCore," for type_value in section_type_values
        )
        code_obj_core_imports = "\n".join(
            f"    {type_value}CodeObjCore," for type_value in code_obj_type_values
        )

        modifier_imports = "\n".join(
            f"    {name}Modifier," for name in section_impl_names + code_obj_impl_names
        )

        field_literal_imports = "\n".join(
            f"    {name}Fields," for name in section_impl_names + code_obj_impl_names
        )

        # Generate imports
        imports = f"""# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import overload, Any, TypeVar

from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
{section_impl_imports}
)

from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
{code_obj_impl_imports}
)

from setta.types.generated.section_core_unions import (
    BaseSectionCoreUnion,
{section_core_imports}
)

from setta.types.generated.code_obj_core_unions import (
    BaseCodeObjCoreUnion,
{code_obj_core_imports}
)

from setta.types.generated.impl_modifier_unions import (
    AllImplModifierUnion,
    BaseSectionImplModifierUnion,
    BaseCodeObjImplModifierUnion,
{modifier_imports}
)

from setta.types.generated.impl_field_literals import (
{field_literal_imports}
)
"""

        # TypeVar and helper
        type_var_def = """
TImpl = TypeVar("TImpl", bound=BaseCodeObjImplUnion | BaseSectionImplUnion)


def apply_modifier(
    impl: TImpl, shared_modifier: AllImplModifierUnion, modifier: AllImplModifierUnion
) -> TImpl:
    return impl.model_copy(update={**shared_modifier, **modifier}, deep=True)
"""

        # Generate get_effective_impl overloads
        get_overloads = [
            "\n\n# ============== get_effective_impl overloads ==============\n"
        ]

        # Specific overloads
        for impl_name, type_value in zip(section_impl_names, section_type_values):
            core_name = f"{type_value}SectionCore"
            modifier_name = f"{impl_name}Modifier"
            get_overloads.append(f"""
@overload
def get_effective_impl(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
) -> {impl_name}: ...""")

        for impl_name, type_value in zip(code_obj_impl_names, code_obj_type_values):
            core_name = f"{type_value}CodeObjCore"
            modifier_name = f"{impl_name}Modifier"
            get_overloads.append(f"""
@overload
def get_effective_impl(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
) -> {impl_name}: ...""")

        # Base overloads
        get_overloads.append("""

# Base overloads for union types
@overload
def get_effective_impl(
    impl: BaseSectionImplUnion,
    core: BaseSectionCoreUnion,
    modifier: BaseSectionImplModifierUnion,
) -> BaseSectionImplUnion: ...


@overload
def get_effective_impl(
    impl: BaseCodeObjImplUnion,
    core: BaseCodeObjCoreUnion,
    modifier: BaseCodeObjImplModifierUnion,
) -> BaseCodeObjImplUnion: ...


def get_effective_impl(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    modifier: AllImplModifierUnion,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    \"\"\"Get the effective implementation by applying modifiers.
    
    The overloaded signatures above provide type-safe usage for each specific
    impl/core/modifier combination.
    \"\"\"
    return apply_modifier(impl, core.sharedModifier, modifier)
""")

        # Generate set_effective_impl_value overloads
        set_overloads = [
            "\n\n# ============== set_effective_impl_value overloads ==============\n"
        ]

        # Specific overloads
        for impl_name, type_value in zip(section_impl_names, section_type_values):
            core_name = f"{type_value}SectionCore"
            modifier_name = f"{impl_name}Modifier"
            field_literal_name = f"{impl_name}Fields"
            set_overloads.append(f"""
@overload
def set_effective_impl_value(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
    key: {field_literal_name},
    value: Any,
) -> {impl_name}: ...""")

        for impl_name, type_value in zip(code_obj_impl_names, code_obj_type_values):
            core_name = f"{type_value}CodeObjCore"
            modifier_name = f"{impl_name}Modifier"
            field_literal_name = f"{impl_name}Fields"
            set_overloads.append(f"""
@overload
def set_effective_impl_value(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
    key: {field_literal_name},
    value: Any,
) -> {impl_name}: ...""")

        # Base overloads and implementation
        set_overloads.append("""

# Base overloads for union types
@overload
def set_effective_impl_value(
    impl: BaseSectionImplUnion,
    core: BaseSectionCoreUnion,
    modifier: BaseSectionImplModifierUnion,
    key: str,
    value: Any,
) -> BaseSectionImplUnion: ...


@overload
def set_effective_impl_value(
    impl: BaseCodeObjImplUnion,
    core: BaseCodeObjCoreUnion,
    modifier: BaseCodeObjImplModifierUnion,
    key: str,
    value: Any,
) -> BaseCodeObjImplUnion: ...


def set_effective_impl_value(
    impl: BaseSectionImplUnion | BaseCodeObjImplUnion,
    core: BaseSectionCoreUnion | BaseCodeObjCoreUnion,
    modifier: AllImplModifierUnion,
    key: str,
    value: Any,
) -> BaseSectionImplUnion | BaseCodeObjImplUnion:
    \"\"\"Set a value in the effective implementation.
    
    The value is set in the appropriate location based on:
    - If impl is not a preset: directly on the impl
    - If key is in unsharedKeys: in the modifier
    - Otherwise: in the core's sharedModifier
    
    The overloaded signatures above provide type-safe field names for each
    specific impl type.
    \"\"\"
    if not impl.isPreset:
        setattr(impl, key, value)
    elif key in core.unsharedKeys:
        modifier[key] = value
    else:
        core.sharedModifier[key] = value
    return get_effective_impl(impl, core, modifier)
""")

        return imports + type_var_def + "".join(get_overloads) + "".join(set_overloads)


# ============== Main Generator ==============


class TypeSystemGenerator:
    """Main generator for type system utilities."""

    def __init__(self, output_folder: Path):
        self.output_folder = output_folder
        self.union_gen = UnionGenerator()
        self.conversion_gen = TypeConversionGenerator()
        self.helper_gen = HelperGenerator()

    def write_output(self, content: str, filename: str, description: str):
        """Write formatted content to file."""
        formatted = ruff_format(content)
        output_file = self.output_folder / filename
        output_file.write_text(formatted)
        print(f"Generated {description} in {output_file}")

    def run(self):
        """Run the complete generation process."""
        import setta.types.code_obj_impls
        import setta.types.section_impls

        # Generate section impl unions
        print("Generating section type unions...")
        section_union_code = self.union_gen.generate_unions(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            "type",
            setta.types.section_impls,
            lambda x: x,
        )
        self.write_output(
            section_union_code, "section_type_unions.py", "section type unions"
        )

        # Generate code obj impl unions
        print("Generating code obj type unions...")
        code_obj_union_code = self.union_gen.generate_unions(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            "type",
            setta.types.code_obj_impls,
            lambda x: x,
        )
        self.write_output(
            code_obj_union_code, "code_obj_type_unions.py", "code obj type unions"
        )

        # Generate section core unions (requires cores to be generated first)
        print("Generating section core unions...")
        import setta.types.generated.section_cores

        # Get the base class from the generated module
        base_section_core = getattr(
            setta.types.generated.section_cores, "BaseSectionCore"
        )

        section_core_union_code = self.union_gen.generate_unions(
            setta.types.generated.section_cores,
            base_section_core,
            "type",
            setta.types.generated.section_cores,
            lambda x: x,
            is_core=True,
        )
        self.write_output(
            section_core_union_code, "section_core_unions.py", "section core unions"
        )

        # Generate code obj core unions
        print("Generating code obj core unions...")
        import setta.types.generated.code_obj_cores

        # Get the base class from the generated module
        base_code_obj_core = getattr(
            setta.types.generated.code_obj_cores, "BaseCodeObjCore"
        )

        code_obj_core_union_code = self.union_gen.generate_unions(
            setta.types.generated.code_obj_cores,
            base_code_obj_core,
            "type",
            setta.types.generated.code_obj_cores,
            lambda x: x,
            is_core=True,
        )
        self.write_output(
            code_obj_core_union_code, "code_obj_core_unions.py", "code obj core unions"
        )

        # Generate modifier unions
        print("Generating modifier unions...")
        import setta.types.generated.impl_modifiers

        section_modifier_union_code = self.union_gen.generate_unions(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            "type",
            setta.types.generated.impl_modifiers,
            lambda x: f"{x}Modifier",
        )

        code_obj_modifier_union_code = self.union_gen.generate_unions(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            "type",
            setta.types.generated.impl_modifiers,
            lambda x: f"{x}Modifier",
        )

        # Combine modifier unions and add AllImplModifierUnion
        modifier_union_code = (
            section_modifier_union_code
            + code_obj_modifier_union_code
            + """
AllImplModifierUnion = BaseSectionImplModifierUnion | BaseCodeObjImplModifierUnion

AllImplModifierUnionWithDiscriminator = Annotated[
    AllImplModifierUnion, Field(discriminator="type")
]

AllImplModifierUnionTypeAdapter = TypeAdapter(AllImplModifierUnionWithDiscriminator)
"""
        )

        # Add type predicates
        base_class_to_children_section = get_base_child_mapping(
            setta.types.section_impls, setta.types.section_impls.BaseSectionImpl, "type"
        )
        base_class_to_children_code_obj = get_base_child_mapping(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            "type",
        )

        all_base_classes = {
            **base_class_to_children_section,
            **base_class_to_children_code_obj,
        }

        for base_class in all_base_classes.keys():
            transformed_name = f"{base_class.__name__}Modifier"
            set_name = f"{transformed_name}TypeSet"
            modifier_union_code += f"""
def is{transformed_name}(x: AllImplModifierUnion) -> TypeGuard[{transformed_name}]:
    return x["type"] in {set_name}

"""

        self.write_output(
            modifier_union_code, "impl_modifier_unions.py", "modifier unions"
        )

        # Generate layering unions
        print("Generating layering unions...")
        import setta.types.generated.impl_layerings

        section_layering_union_code = self.union_gen.generate_unions(
            setta.types.generated.impl_layerings,
            setta.types.generated.impl_layerings.BaseSectionImplLayering,
            "type",
            setta.types.generated.impl_layerings,
            lambda x: x,
        )

        code_obj_layering_union_code = self.union_gen.generate_unions(
            setta.types.generated.impl_layerings,
            setta.types.generated.impl_layerings.BaseCodeObjImplLayering,
            "type",
            setta.types.generated.impl_layerings,
            lambda x: x,
        )

        layering_union_code = section_layering_union_code + code_obj_layering_union_code
        self.write_output(
            layering_union_code, "impl_layering_unions.py", "layering unions"
        )

        # Generate WebSocket unions
        print("Generating WebSocket unions...")
        websocket_union_code = self.union_gen.generate_websocket_unions()
        self.write_output(
            websocket_union_code, "websocket_type_unions.py", "WebSocket unions"
        )

        # Generate type conversion functions
        print("Generating type conversion functions...")
        type_to_modifier_code = self.conversion_gen.generate_type_to_modifier()
        self.write_output(
            type_to_modifier_code, "type_to_modifier.py", "type to modifier functions"
        )

        type_to_core_code = self.conversion_gen.generate_type_to_core()
        self.write_output(
            type_to_core_code, "type_to_core.py", "type to core functions"
        )

        # Generate helper functions
        print("Generating helper functions...")
        impl_helpers_code = self.helper_gen.generate_impl_helpers()
        self.write_output(impl_helpers_code, "impl_helpers.py", "impl helper functions")

        print("Type system generation complete!")


def main(output_folder: Path):
    """Main entry point."""
    generator = TypeSystemGenerator(output_folder)
    generator.run()


if __name__ == "__main__":
    import sys

    output_folder = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("../../backend/setta/types/generated")
    )
    # Note: This script should be run AFTER generate_derived_classes.py
    # since it depends on generated cores, modifiers, and layerings
    main(get_absolute_path(__file__, output_folder))
