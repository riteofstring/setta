from pathlib import Path

import setta.types.code_obj_impls
import setta.types.generated.cores
import setta.types.generated.layerings
import setta.types.generated.modifiers
import setta.types.section_impls
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    get_class_to_children_mapping,
    get_name_without_suffix,
)


def construct_unions(
    module,
    base_class,
    discriminator,
    module_to_import_in_gen_file,
    class_transformer,
):
    class_to_children = get_class_to_children_mapping(
        module, base_class, exclude_empty=True, required_discriminator=discriminator
    )
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
    )

    code += construct_unions(
        setta.types.generated.cores,
        setta.types.generated.cores.BaseSectionCore,
        "type",
        setta.types.generated.cores,
        lambda x: x,
    )
    code += construct_unions(
        setta.types.generated.cores,
        setta.types.generated.cores.BaseCodeObjCore,
        "type",
        setta.types.generated.cores,
        lambda x: x,
    )
    code += construct_unions(
        setta.types.generated.layerings,
        setta.types.generated.layerings.BaseSectionLayering,
        "type",
        setta.types.generated.layerings,
        lambda x: x,
    )
    code += construct_unions(
        setta.types.generated.layerings,
        setta.types.generated.layerings.BaseCodeObjLayering,
        "type",
        setta.types.generated.layerings,
        lambda x: x,
    )
    code += construct_unions(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        setta.types.generated.modifiers,
        lambda x: f"{get_name_without_suffix(x, 'Impl')}Modifier",
    )

    code += construct_unions(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        setta.types.generated.modifiers,
        lambda x: f"{get_name_without_suffix(x, 'Impl')}Modifier",
    )

    code = ruff_format(code)
    output_file.write_text(code)


def generate_websocket_unions(output_file: Path):
    import setta.types.websocket

    code = construct_unions(
        setta.types.websocket,
        setta.types.websocket.WebsocketMsg,
        "messageType",
        setta.types.websocket,
        lambda x: x,
    )

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    generate_unions(
        output_file=(
            get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
            / "unions.py"
        )
    )
    # has to be done separately due to import dependencies
    generate_websocket_unions(
        output_file=(
            get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
            / "websocket_unions.py"
        )
    )
