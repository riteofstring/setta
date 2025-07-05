#!/usr/bin/env python3
"""Simplified type system generator."""

from pathlib import Path
from typing import Any, Dict

from setta.utils.utils import get_absolute_path

# When running as a script, use local import
if __name__ == "__main__":
    from generation_base_generator import (
        BaseGenerator,
        OverloadGenerator,
        UnionGenerator,
    )
else:
    from .generation_base_generator import (
        BaseGenerator,
        OverloadGenerator,
        UnionGenerator,
    )

import setta.types.code_obj_impls
import setta.types.section_impls


class TypeSystemGenerator(BaseGenerator):
    """Generates type system utilities."""

    def __init__(self, output_folder: Path):
        super().__init__(output_folder)
        self.union_gen = UnionGenerator()
        self.overload_gen = OverloadGenerator()

    def run(self):
        """Run the generation process."""
        # Generate unions for impls
        self._generate_impl_unions()

        # Generate unions for generated types (cores, modifiers, layerings)
        self._generate_derived_unions()

        # Generate type conversion functions
        self._generate_type_conversions()

        # Generate helper functions
        self._generate_helpers()

    def _generate_impl_unions(self):
        """Generate unions for impl classes."""
        # Section impls
        self._generate_unions_for_module(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            "section_impl_unions.py",
        )

        # Code obj impls
        self._generate_unions_for_module(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            "code_obj_impl_unions.py",
        )

    def _generate_unions_for_module(
        self, module: Any, base_class: Any, output_file: str
    ) -> str:
        """Generate all unions for a module."""
        content = """from typing import Annotated, Union
from pydantic import Field, TypeAdapter

"""

        # Get base and concrete classes
        base_classes = self.find_subclasses(module, base_class)
        concrete_classes = self.find_subclasses(module, base_class, concrete_only=True)
        all_classes = [base_class] + base_classes + concrete_classes

        # Import classes
        all_class_names = [cls.__name__ for cls in all_classes]
        content += self.build_imports(all_class_names, module.__name__, indent=0)
        content += "\n"

        # Generate union for each base class (including the root base)
        classes_to_process = [base_class] + base_classes
        for base in classes_to_process:
            # Find concrete implementations
            implementations = [cls for cls in concrete_classes if issubclass(cls, base)]

            if implementations:
                union_name = f"{base.__name__}Union"
                member_names = [cls.__name__ for cls in implementations]
                type_values = [
                    cls.model_fields["type"].default.value for cls in implementations
                ]

                content += self.union_gen.generate_union(
                    union_name, member_names, "type", type_values
                )
                content += "\n"

        self.write_output(content, output_file, f"unions for {module.__name__}")
        return content

    def _generate_derived_unions(self):
        """Generate unions for derived types."""
        # Generate core unions
        self._generate_core_unions()

        # Generate modifier unions
        self._generate_modifier_unions()

        # Generate layering unions
        self._generate_layering_unions()

    def _generate_core_unions(self):
        """Generate unions for core classes."""
        # Section cores
        import setta.types.generated.section_cores

        base_section_core = getattr(
            setta.types.generated.section_cores, "BaseSectionCore"
        )

        self._generate_unions_for_generated_module(
            setta.types.generated.section_cores,
            base_section_core,
            "section_core_unions.py",
            lambda cls: cls.__name__,
        )

        # Code obj cores
        import setta.types.generated.code_obj_cores

        base_code_obj_core = getattr(
            setta.types.generated.code_obj_cores, "BaseCodeObjCore"
        )

        self._generate_unions_for_generated_module(
            setta.types.generated.code_obj_cores,
            base_code_obj_core,
            "code_obj_core_unions.py",
            lambda cls: cls.__name__,
        )

    def _generate_modifier_unions(self):
        """Generate unions for modifier classes."""
        import setta.types.code_obj_impls
        import setta.types.generated.impl_modifiers
        import setta.types.section_impls

        content = """from typing import Annotated, Union, TypeGuard
from pydantic import Field, TypeAdapter

"""

        # Get section modifier union
        section_content = self._generate_modifier_union_for_type(
            setta.types.section_impls,
            setta.types.section_impls.BaseSectionImpl,
            setta.types.generated.impl_modifiers,
            "Section",
        )

        # Get code obj modifier union
        code_obj_content = self._generate_modifier_union_for_type(
            setta.types.code_obj_impls,
            setta.types.code_obj_impls.BaseCodeObjImpl,
            setta.types.generated.impl_modifiers,
            "CodeObj",
        )

        content += section_content + "\n" + code_obj_content

        # Add AllImplModifierUnion
        content += """

AllImplModifierUnion = BaseSectionImplModifierUnion | BaseCodeObjImplModifierUnion

AllImplModifierUnionWithDiscriminator = Annotated[
    AllImplModifierUnion, Field(discriminator="type")
]

AllImplModifierUnionTypeAdapter = TypeAdapter(AllImplModifierUnionWithDiscriminator)


def isBaseSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseSectionImplModifier]:
    return x["type"] in BaseSectionImplModifierTypeSet


def isBaseSectionWithParamsImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseSectionWithParamsImplModifier]:
    return x["type"] in BaseSectionWithParamsImplModifierTypeSet


def isBaseArtifactSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseArtifactSectionImplModifier]:
    return x["type"] in BaseArtifactSectionImplModifierTypeSet


def isBaseCanvasSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseCanvasSectionImplModifier]:
    return x["type"] in BaseCanvasSectionImplModifierTypeSet


def isBaseCodeSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseCodeSectionImplModifier]:
    return x["type"] in BaseCodeSectionImplModifierTypeSet


def isBaseParentSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseParentSectionImplModifier]:
    return x["type"] in BaseParentSectionImplModifierTypeSet


def isBaseDictSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseDictSectionImplModifier]:
    return x["type"] in BaseDictSectionImplModifierTypeSet


def isBaseCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseCodeObjImplModifier]:
    return x["type"] in BaseCodeObjImplModifierTypeSet


def isBaseParamCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseParamCodeObjImplModifier]:
    return x["type"] in BaseParamCodeObjImplModifierTypeSet


def isBaseChildlessCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseChildlessCodeObjImplModifier]:
    return x["type"] in BaseChildlessCodeObjImplModifierTypeSet


def isBaseParentCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseParentCodeObjImplModifier]:
    return x["type"] in BaseParentCodeObjImplModifierTypeSet
"""

        self.write_output(content, "impl_modifier_unions.py", "modifier unions")

    def _generate_modifier_union_for_type(
        self, source_module: Any, base_class: Any, modifier_module: Any, type_name: str
    ) -> str:
        """Generate modifier unions for a specific type."""
        content = ""

        # Get base and concrete classes
        base_classes = self.find_subclasses(source_module, base_class)
        concrete_classes = self.find_subclasses(
            source_module, base_class, concrete_only=True
        )
        all_classes = [base_class] + base_classes + concrete_classes

        # Import modifiers
        modifier_names = [f"{cls.__name__}Modifier" for cls in all_classes]
        content += self.build_imports(
            modifier_names, modifier_module.__name__, indent=0
        )
        content += "\n"

        # Generate union for each base class
        classes_to_process = [base_class] + base_classes
        for base in classes_to_process:
            # Find concrete implementations
            implementations = [cls for cls in concrete_classes if issubclass(cls, base)]

            if implementations:
                union_name = f"{base.__name__}ModifierUnion"
                member_names = [f"{cls.__name__}Modifier" for cls in implementations]
                type_values = [
                    cls.model_fields["type"].default.value for cls in implementations
                ]

                content += self.union_gen.generate_union(
                    union_name, member_names, "type", type_values
                )
                content += "\n"

        return content

    def _generate_layering_unions(self):
        """Generate unions for layering classes."""
        import setta.types.generated.impl_layerings

        # Get base layering classes
        base_section_layering = getattr(
            setta.types.generated.impl_layerings, "BaseSectionImplLayering"
        )
        base_code_obj_layering = getattr(
            setta.types.generated.impl_layerings, "BaseCodeObjImplLayering"
        )

        content = """from typing import Annotated, Union
from pydantic import Field, TypeAdapter

"""

        # Section layerings
        section_content = self._generate_unions_for_generated_module(
            setta.types.generated.impl_layerings,
            base_section_layering,
            None,  # Don't write yet
            lambda cls: cls.__name__,
        )

        # Code obj layerings
        code_obj_content = self._generate_unions_for_generated_module(
            setta.types.generated.impl_layerings,
            base_code_obj_layering,
            None,  # Don't write yet
            lambda cls: cls.__name__,
        )

        # Combine and write
        self.write_output(
            content + section_content + code_obj_content,
            "impl_layering_unions.py",
            "layering unions",
        )

    def _generate_unions_for_generated_module(
        self, module: Any, base_class: Any, output_file: str | None, class_transformer
    ) -> str:
        """Generate unions for a generated module."""
        content = ""

        # Get base and concrete classes
        base_classes = self.find_subclasses(module, base_class)
        concrete_classes = self.find_subclasses(module, base_class, concrete_only=True)

        # Import classes if not already imported
        all_classes = [base_class] + base_classes + concrete_classes
        all_class_names = [class_transformer(cls) for cls in all_classes]

        if output_file:  # Only add imports if writing to a new file
            # Add typing/pydantic imports first
            content += """from typing import Annotated, Union
from pydantic import Field, TypeAdapter

"""
            content += self.build_imports(all_class_names, module.__name__, indent=0)
            content += "\n"

        # Generate union for each base class
        classes_to_process = [base_class] + base_classes
        for base in classes_to_process:
            # Find concrete implementations
            implementations = [cls for cls in concrete_classes if issubclass(cls, base)]

            if implementations:
                union_name = f"{class_transformer(base)}Union"
                member_names = [class_transformer(cls) for cls in implementations]
                type_values = [
                    cls.model_fields["type"].default.value for cls in implementations
                ]

                content += self.union_gen.generate_union(
                    union_name, member_names, "type", type_values
                )
                content += "\n"

        if output_file:
            self.write_output(content, output_file, f"unions for {module.__name__}")

        return content

    def _generate_type_conversions(self):
        """Generate type to modifier/core conversion functions."""
        # Type to modifier
        self._generate_type_to_modifier()

        # Type to core
        self._generate_type_to_core()

    def _generate_type_to_modifier(self):
        """Generate type to modifier conversion functions."""
        content = """from typing import overload, Literal

from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType

"""

        # Get concrete classes
        section_classes = self.get_all_concrete_classes(
            setta.types.section_impls, setta.types.section_impls.BaseSectionImpl
        )

        code_obj_classes = self.get_all_concrete_classes(
            setta.types.code_obj_impls, setta.types.code_obj_impls.BaseCodeObjImpl
        )

        # Build modifier imports
        modifier_imports = []
        for cls_map in [section_classes, code_obj_classes]:
            for _, cls in cls_map.items():
                modifier_imports.append(f"{cls.__name__}Modifier")

        content += self.build_imports(
            sorted(modifier_imports), "setta.types.generated.impl_modifiers", indent=0
        )
        content += "\n"

        content += self.build_imports(
            ["BaseSectionImplModifierUnion", "BaseCodeObjImplModifierUnion"],
            "setta.types.generated.impl_modifier_unions",
            indent=0,
        )
        content += "\n"

        # Generate section overloads and function
        content += self._generate_conversion_function(
            "create_modifier_for_section_type",
            "SectionType",
            section_classes,
            "Modifier",
            "BaseSectionImplModifierUnion",
        )

        content += "\n\n"

        # Generate code obj overloads and function
        content += self._generate_conversion_function(
            "create_modifier_for_code_obj_type",
            "CodeObjType",
            code_obj_classes,
            "Modifier",
            "BaseCodeObjImplModifierUnion",
        )

        self.write_output(content, "type_to_modifier.py", "type to modifier functions")

    def _generate_type_to_core(self):
        """Generate type to core conversion functions."""
        content = """from typing import overload, Literal, Any

from setta.types.section_impls import SectionType
from setta.types.code_obj_impls import CodeObjType

"""

        # Get concrete classes
        section_classes = self.get_all_concrete_classes(
            setta.types.section_impls, setta.types.section_impls.BaseSectionImpl
        )

        code_obj_classes = self.get_all_concrete_classes(
            setta.types.code_obj_impls, setta.types.code_obj_impls.BaseCodeObjImpl
        )

        # Build core imports
        section_core_imports = ["BaseSectionCore"] + [
            f"{type_value}SectionCore" for type_value in section_classes.keys()
        ]
        code_obj_core_imports = ["BaseCodeObjCore"] + [
            f"{type_value}CodeObjCore" for type_value in code_obj_classes.keys()
        ]

        content += self.build_imports(
            section_core_imports, "setta.types.generated.section_cores", indent=0
        )
        content += "\n"

        content += self.build_imports(
            code_obj_core_imports, "setta.types.generated.code_obj_cores", indent=0
        )
        content += "\n"

        # Build modifier and field literal imports
        modifier_imports = []
        field_literal_imports = []

        for cls_map in [section_classes, code_obj_classes]:
            for _, cls in cls_map.items():
                modifier_imports.append(f"{cls.__name__}Modifier")
                field_literal_imports.append(f"{cls.__name__}Fields")

        content += self.build_imports(
            sorted(modifier_imports), "setta.types.generated.impl_modifiers", indent=0
        )
        content += "\n"

        content += self.build_imports(
            sorted(field_literal_imports),
            "setta.types.generated.impl_field_literals",
            indent=0,
        )
        content += "\n"

        content += self.build_imports(
            ["BaseSectionCoreUnion"],
            "setta.types.generated.section_core_unions",
            indent=0,
        )
        content += self.build_imports(
            ["BaseCodeObjCoreUnion"],
            "setta.types.generated.code_obj_core_unions",
            indent=0,
        )
        content += "\n"

        # Generate section function
        content += self._generate_core_conversion_function(
            "create_core_for_section_type",
            "SectionType",
            section_classes,
            "SectionCore",
            "BaseSectionCoreUnion",
        )

        content += "\n\n"

        # Generate code obj function
        content += self._generate_core_conversion_function(
            "create_core_for_code_obj_type",
            "CodeObjType",
            code_obj_classes,
            "CodeObjCore",
            "BaseCodeObjCoreUnion",
        )

        self.write_output(content, "type_to_core.py", "type to core functions")

    def _generate_core_conversion_function(
        self,
        func_name: str,
        enum_type: str,
        type_map: Dict[str, Any],
        suffix: str,
        base_return: str,
    ) -> str:
        """Generate a core conversion function with overloads."""
        # Generate overloads
        overloads = f"\n# Overloads for {func_name.replace('_', ' ')}"

        for type_value, cls in type_map.items():
            core_name = f"{type_value}{suffix}"
            modifier_type = f"{cls.__name__}Modifier"
            field_literal_type = f"{cls.__name__}Fields"

            overloads += f"""
@overload
def {func_name}(
    type_: Literal[{enum_type}.{type_value}],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: {modifier_type} | None = None,
    unsharedKeys: set[{field_literal_type}] | None = None,
) -> {core_name}: ..."""

        # Base overload
        overloads += f"""
@overload
def {func_name}(
    type_: {enum_type},
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None,
) -> {base_return}: ...
"""

        # Generate function implementation
        implementation = f"""

def {func_name}(
    type_: {enum_type},
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None,
) -> {base_return}:
    \"\"\"Create a {suffix} for the given {enum_type}.
    
    Args:
        type_: The {enum_type} enum value
        id: Optional custom ID for the core
        name: Optional custom name for the core
        implLayerings: Optional implementation layering IDs
        defaultImplLayering: Optional default layering ID
        sharedModifier: Optional modifier (must match the type)
        unsharedKeys: Optional set of keys to exclude from sharing
        
    The overloaded signatures above provide full type checking for each specific
    {enum_type} with properly typed parameters.
    \"\"\"
    # Build kwargs dict with only non-None values
    core_kwargs = {{}}
    
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

        # Add cases
        first = True
        for type_value in type_map.keys():
            core_name = f"{type_value}{suffix}"
            if first:
                implementation += f"""
    if type_ == {enum_type}.{type_value}:
        return {core_name}(**core_kwargs)"""
                first = False
            else:
                implementation += f"""
    elif type_ == {enum_type}.{type_value}:
        return {core_name}(**core_kwargs)"""

        implementation += """
    else:
        raise ValueError(f"Unknown {'section' if 'Section' in enum_type else 'code obj'} type: {type_}")"""

        return overloads + implementation

    def _generate_conversion_function(
        self,
        func_name: str,
        enum_type: str,
        type_map: Dict[str, Any],
        suffix: str,
        base_return: str,
    ) -> str:
        """Generate a conversion function with overloads."""
        # Generate overloads
        overload_specs = []
        for type_value, cls in type_map.items():
            class_name = cls.__name__ + suffix
            overload_specs.append(
                {
                    "params": f"type_: Literal[{enum_type}.{type_value}]",
                    "return_type": class_name,
                }
            )

        base_overload = {"params": f"type_: {enum_type}", "return_type": base_return}

        overloads = self.overload_gen.generate_overloads(
            func_name, overload_specs, base_overload
        )

        # Generate function implementation
        implementation = f"""
def {func_name}(type_: {enum_type}) -> {base_return}:
    \"\"\"Create a {suffix} for the given {enum_type}.\"\"\"
"""

        # Add cases
        first = True
        for type_value, cls in type_map.items():
            class_name = cls.__name__ + suffix
            if first:
                implementation += f"    if type_ == {enum_type}.{type_value}:\n"
                implementation += f"        return {class_name}(type=type_)\n"
                first = False
            else:
                implementation += f"    elif type_ == {enum_type}.{type_value}:\n"
                implementation += f"        return {class_name}(type=type_)\n"

        implementation += "    else:\n"
        implementation += f'        raise ValueError(f"Unknown {"section" if "Section" in enum_type else "code obj"} type: {{type_}}")\n'

        return overloads + implementation

    def _generate_helpers(self):
        """Generate helper functions with overloads."""
        content = """# Auto-generated effective impl overloads - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import overload, Any, TypeVar

"""

        # Get concrete classes
        section_classes = self.get_all_concrete_classes(
            setta.types.section_impls, setta.types.section_impls.BaseSectionImpl
        )
        code_obj_classes = self.get_all_concrete_classes(
            setta.types.code_obj_impls, setta.types.code_obj_impls.BaseCodeObjImpl
        )

        # Build imports
        section_impl_imports = [cls.__name__ for _, cls in section_classes.items()]
        code_obj_impl_imports = [cls.__name__ for _, cls in code_obj_classes.items()]

        content += self.build_imports(
            ["BaseSectionImplUnion"] + section_impl_imports,
            "setta.types.generated.section_impl_unions",
            indent=0,
        )
        content += "\n"

        content += self.build_imports(
            ["BaseCodeObjImplUnion"] + code_obj_impl_imports,
            "setta.types.generated.code_obj_impl_unions",
            indent=0,
        )
        content += "\n"

        # Core imports
        section_core_imports = ["BaseSectionCoreUnion"] + [
            f"{type_value}SectionCore" for type_value in section_classes.keys()
        ]
        code_obj_core_imports = ["BaseCodeObjCoreUnion"] + [
            f"{type_value}CodeObjCore" for type_value in code_obj_classes.keys()
        ]

        content += self.build_imports(
            section_core_imports, "setta.types.generated.section_core_unions", indent=0
        )
        content += "\n"

        content += self.build_imports(
            code_obj_core_imports,
            "setta.types.generated.code_obj_core_unions",
            indent=0,
        )
        content += "\n"

        # Modifier imports
        modifier_imports = [
            "AllImplModifierUnion",
            "BaseSectionImplModifierUnion",
            "BaseCodeObjImplModifierUnion",
        ]
        for cls_map in [section_classes, code_obj_classes]:
            for _, cls in cls_map.items():
                modifier_imports.append(f"{cls.__name__}Modifier")

        content += self.build_imports(
            modifier_imports, "setta.types.generated.impl_modifier_unions", indent=0
        )
        content += "\n"

        # Field literal imports
        field_literal_imports = []
        for cls_map in [section_classes, code_obj_classes]:
            for _, cls in cls_map.items():
                field_literal_imports.append(f"{cls.__name__}Fields")

        content += self.build_imports(
            field_literal_imports, "setta.types.generated.impl_field_literals", indent=0
        )
        content += "\n"

        # TypeVar and helper
        content += """
TImpl = TypeVar("TImpl", bound=BaseCodeObjImplUnion | BaseSectionImplUnion)


def apply_modifier(
    impl: TImpl, shared_modifier: AllImplModifierUnion, modifier: AllImplModifierUnion
) -> TImpl:
    return impl.model_copy(update={**shared_modifier, **modifier}, deep=True)
"""

        # Generate get_effective_impl overloads
        content += self._generate_get_effective_impl_overloads(
            section_classes, code_obj_classes
        )

        # Generate set_effective_impl_value overloads
        content += self._generate_set_effective_impl_value_overloads(
            section_classes, code_obj_classes
        )

        self.write_output(content, "impl_helpers.py", "impl helper functions")

    def _generate_get_effective_impl_overloads(
        self, section_classes: Dict[str, Any], code_obj_classes: Dict[str, Any]
    ) -> str:
        """Generate overloads for get_effective_impl."""
        content = "\n\n# ============== get_effective_impl overloads ==============\n"

        # Specific overloads for sections
        for type_value, cls in section_classes.items():
            impl_name = cls.__name__
            core_name = f"{type_value}SectionCore"
            modifier_name = f"{impl_name}Modifier"
            content += f"""
@overload
def get_effective_impl(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
) -> {impl_name}: ..."""

        # Specific overloads for code objs
        for type_value, cls in code_obj_classes.items():
            impl_name = cls.__name__
            core_name = f"{type_value}CodeObjCore"
            modifier_name = f"{impl_name}Modifier"
            content += f"""
@overload
def get_effective_impl(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
) -> {impl_name}: ..."""

        # Base overloads and implementation
        content += """


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
"""
        return content

    def _generate_set_effective_impl_value_overloads(
        self, section_classes: Dict[str, Any], code_obj_classes: Dict[str, Any]
    ) -> str:
        """Generate overloads for set_effective_impl_value."""
        content = (
            "\n\n# ============== set_effective_impl_value overloads ==============\n"
        )

        # Specific overloads for sections
        for type_value, cls in section_classes.items():
            impl_name = cls.__name__
            core_name = f"{type_value}SectionCore"
            modifier_name = f"{impl_name}Modifier"
            field_literal_name = f"{impl_name}Fields"
            content += f"""
@overload
def set_effective_impl_value(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
    key: {field_literal_name},
    value: Any,
) -> {impl_name}: ..."""

        # Specific overloads for code objs
        for type_value, cls in code_obj_classes.items():
            impl_name = cls.__name__
            core_name = f"{type_value}CodeObjCore"
            modifier_name = f"{impl_name}Modifier"
            field_literal_name = f"{impl_name}Fields"
            content += f"""
@overload
def set_effective_impl_value(
    impl: {impl_name},
    core: {core_name},
    modifier: {modifier_name},
    key: {field_literal_name},
    value: Any,
) -> {impl_name}: ..."""

        # Base overloads and implementation
        content += """


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
"""
        return content


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
    main(get_absolute_path(__file__, output_folder))
