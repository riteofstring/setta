import inspect
from pathlib import Path
from typing import Any, List, Type

from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


def find_sub_classes(
    module: Any,
    base_class: Type[BaseModel],
    discriminator: str,
    return_base_classes: bool,
    return_input_base_class: bool,
) -> List[Type[BaseModel]]:
    classes = []

    # Get all classes that match our criteria
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            fields = obj.model_fields
            if not return_input_base_class and obj is base_class:
                continue
            if (
                return_base_classes
                and fields[discriminator].default is PydanticUndefined
            ):
                classes.append(obj)
            elif (
                not return_base_classes
                and fields[discriminator].default is not PydanticUndefined
            ):
                classes.append(obj)

    # Sort by line number where the class is defined
    def get_line_number(cls):
        try:
            return inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            return float("inf")  # Put classes without source at the end

    classes.sort(key=get_line_number)

    return classes


def get_base_child_mapping(module, base_class, discriminator):
    base_classes = find_sub_classes(module, base_class, discriminator, True, True)
    base_class_to_children = {}
    for base_class in base_classes:
        child_classes = find_sub_classes(module, base_class, discriminator, False, True)
        base_class_to_children[base_class] = child_classes
    return base_class_to_children


def construct_unions(
    module,
    base_class,
    discriminator,
    module_to_import_in_gen_file,
    class_transformer,
    return_base_class_to_children=False,
):
    base_class_to_children = get_base_child_mapping(module, base_class, discriminator)
    code = """
from typing import Annotated,Union,TypeGuard
from pydantic import Field, TypeAdapter

"""
    for base_class, child_classes in base_class_to_children.items():
        code += f"from {module_to_import_in_gen_file.__name__} import {class_transformer(base_class.__name__)}\n\n"
        for child_class in child_classes:
            code += f"from {module_to_import_in_gen_file.__name__} import {class_transformer(child_class.__name__)}\n\n"

    for base_class, child_classes in base_class_to_children.items():
        union_name = f"{class_transformer(base_class.__name__)}Union"
        code += f"{union_name} = Union[{', '.join(class_transformer(c.__name__) for c in child_classes)}]\n\n"
        code += f'{union_name}WithDiscriminator = Annotated[{union_name}, Field(discriminator="{discriminator}")]\n\n'
        code += f"{class_transformer(base_class.__name__)}TypeAdapter = TypeAdapter({union_name}WithDiscriminator)\n\n"

        defaults = []
        for c in child_classes:
            d = c.model_fields[discriminator].default
            # assert enum name and value are the same for simplicity
            assert d.name == d.value
            defaults.append(f'"{d.name}"')
        defaults = ", ".join(defaults)
        code += (
            f"{class_transformer(base_class.__name__)}TypeSet = set([{defaults}])\n\n"
        )

    if return_base_class_to_children:
        return code, base_class_to_children
    return ruff_format(code)


def create_type_predicate_fns(
    most_base_type_names, set_name, transformed_base_class_name
):
    return f"""
def is{transformed_base_class_name}(x: {most_base_type_names})->TypeGuard[{transformed_base_class_name}]:
    return x["type"] in {set_name}

"""


def add_type_predicate_fns(most_base_type, base_class_to_children, class_transformer):
    code = ""
    for base_class in base_class_to_children.keys():
        transformed_base_class_name = class_transformer(base_class.__name__)
        set_name = f"{transformed_base_class_name}TypeSet"
        code += create_type_predicate_fns(
            most_base_type, set_name, transformed_base_class_name
        )
    return code


def impl_modifier_union():
    import setta.types.code_obj_impls
    import setta.types.generated.impl_modifiers
    import setta.types.section_impls

    code1, base_class_to_children1 = construct_unions(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        setta.types.generated.impl_modifiers,
        lambda x: f"{x}Modifier",
        True,
    )

    code2, base_class_to_children2 = construct_unions(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        setta.types.generated.impl_modifiers,
        lambda x: f"{x}Modifier",
        True,
    )

    code = code1 + code2
    base_class_to_children = {**base_class_to_children1, **base_class_to_children2}  # type: ignore

    code += """
AllImplModifierUnion = BaseSectionImplModifierUnion | BaseCodeObjImplModifierUnion

AllImplModifierUnionWithDiscriminator = Annotated[
    AllImplModifierUnion, Field(discriminator="type")
]

AllImplModifierUnionTypeAdapter = TypeAdapter(AllImplModifierUnionWithDiscriminator)
"""

    code += add_type_predicate_fns(
        "AllImplModifierUnion",
        base_class_to_children,
        lambda x: f"{x}Modifier",
    )

    return ruff_format(code)


def gen_write(fn, output_path):
    code = fn()
    with open(output_path, "w") as f:
        f.write(code)
    print(f"wrote to {output_path}")


def main(output_folder):
    # order matters! (because of imports)
    gen_write(
        impl_modifier_union,
        output_folder / "impl_modifier_unions.py",
    )


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
