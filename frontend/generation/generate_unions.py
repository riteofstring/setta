import sys
from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path

from .utils import (
    get_class_to_children_mapping,
    get_field_default,
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
from typing import Annotated,TypeGuard
from pydantic import Field, TypeAdapter

"""
    for base_class, child_classes in class_to_children.items():
        code += f"from {module_to_import_in_gen_file.__name__} import {class_transformer(base_class.__name__)}\n\n"
        for child_class in child_classes:
            code += f"from {module_to_import_in_gen_file.__name__} import {class_transformer(child_class.__name__)}\n\n"

    for base_class, child_classes in class_to_children.items():
        union_name = f"{class_transformer(base_class.__name__)}Union"
        code += f"{union_name} = {' | '.join(class_transformer(c.__name__) for c in child_classes)}\n\n"
        code += f'{union_name}WithDiscriminator = Annotated[{union_name}, Field(discriminator="{discriminator}")]\n\n'
        code += f"{class_transformer(base_class.__name__)}TypeAdapter = TypeAdapter({union_name}WithDiscriminator)\n\n"

        defaults = []
        for c in child_classes:
            has_default, d = get_field_default(c, discriminator)
            if not has_default:
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
    import setta.types.artifact
    import setta.types.code_obj_impls
    import setta.types.generated.impl_args_as_typed_dicts
    import setta.types.section_impls

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
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        setta.types.generated.impl_args_as_typed_dicts,
        lambda x: f"{x}Args",
    )
    code += construct_unions(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        setta.types.generated.impl_args_as_typed_dicts,
        lambda x: f"{x}Args",
    )

    code += construct_unions(
        setta.types.artifact,
        setta.types.artifact.BaseArtifact,
        "type",
        setta.types.artifact,
        lambda x: x,
    )

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


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


def generate_chart_settings_unions(output_file: Path):
    import setta.types.artifact

    code = construct_unions(
        setta.types.artifact,
        setta.types.artifact.BaseChartSettings,
        "type",
        setta.types.artifact,
        lambda x: x,
    )
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_dependency_key_unions(output_file: Path):
    import setta.types.dependency_key

    code = construct_unions(
        setta.types.dependency_key,
        setta.types.dependency_key.BaseDependencyKey,
        "type",
        setta.types.dependency_key,
        lambda x: x,
    )
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_dependency_value_unions(output_file: Path):
    import setta.types.dependency_value

    code = construct_unions(
        setta.types.dependency_value,
        setta.types.dependency_value.BaseDependencyValue,
        "type",
        setta.types.dependency_value,
        lambda x: x,
    )
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_chat_messages_unions(output_file: Path):
    import setta.types.chat_messages

    code = construct_unions(
        setta.types.chat_messages,
        setta.types.chat_messages.BaseChatMessage,
        "role",
        setta.types.chat_messages,
        lambda x: x,
    )
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError

    if sys.argv[1] == "unions":
        generate_unions(
            output_file=(
                get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
                / "unions.py"
            )
        )
    elif sys.argv[1] == "websocket_unions":
        # has to be done separately due to import dependencies
        generate_websocket_unions(
            output_file=(
                get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
                / "websocket_unions.py"
            )
        )
    elif sys.argv[1] == "chart_settings":
        # has to be done separately due to import dependencies
        generate_chart_settings_unions(
            output_file=(
                get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
                / "chart_settings_unions.py"
            )
        )
    elif sys.argv[1] == "dependency_keys":
        # has to be done separately due to import dependencies
        generate_dependency_key_unions(
            output_file=(
                get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
                / "dependency_keys.py"
            )
        )
    elif sys.argv[1] == "dependency_values":
        # has to be done separately due to import dependencies
        generate_dependency_value_unions(
            output_file=(
                get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
                / "dependency_values.py"
            )
        )
    elif sys.argv[1] == "chat_messages":
        # has to be done separately due to import dependencies
        generate_chat_messages_unions(
            output_file=(
                get_absolute_path(__file__, Path("../../backend/setta/types/generated"))
                / "chat_messages.py"
            )
        )
    else:
        raise ValueError
