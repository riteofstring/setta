import sys
from pathlib import Path

from setta.utils.format_code import ruff_format

from .utils import (
    get_class_to_children_mapping,
    get_field_default,
    resolve_generation_path,
)


def construct_unions(
    module,
    base_class,
    discriminator,
    module_to_import_in_gen_file,
    class_transformer,
    include_with_discriminator=True,
    include_type_adapter=False,
    include_type_set=False,
    root_only=False,
):
    class_to_children = get_class_to_children_mapping(
        module, base_class, exclude_empty=True, required_discriminator=discriminator
    )
    if root_only:
        class_to_children = {base_class: class_to_children[base_class]}

    import_names: list[str] = []
    for child_classes in class_to_children.values():
        for child_class in child_classes:
            import_names.append(class_transformer(child_class.__name__))

    import_names = list(dict.fromkeys(import_names))
    imports = ""
    if import_names:
        imports = (
            f"from {module_to_import_in_gen_file.__name__} import (\n"
            f"    {', '.join(import_names)}\n"
            ")\n"
        )

    code = ""
    for base_class, child_classes in class_to_children.items():
        union_name = f"{class_transformer(base_class.__name__)}Union"
        code += f"{union_name} = {' | '.join(class_transformer(c.__name__) for c in child_classes)}\n\n"
        if include_with_discriminator:
            code += f'{union_name}WithDiscriminator = Annotated[{union_name}, Field(discriminator="{discriminator}")]\n\n'
        if include_type_adapter:
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
        if include_type_set:
            code += f"{class_transformer(base_class.__name__)}TypeSet = set([{defaults}])\n\n"

    return imports, code


def generate_unions(output_file):
    import setta.types.artifact
    import setta.types.code_obj_impls
    import setta.types.section_impls

    section_imports, section_code = construct_unions(
        setta.types.section_impls,
        setta.types.section_impls.BaseSectionImpl,
        "type",
        setta.types.section_impls,
        lambda x: x,
        root_only=True,
    )
    code_obj_imports, code_obj_code = construct_unions(
        setta.types.code_obj_impls,
        setta.types.code_obj_impls.BaseCodeObjImpl,
        "type",
        setta.types.code_obj_impls,
        lambda x: x,
        root_only=True,
    )

    artifact_imports, artifact_code = construct_unions(
        setta.types.artifact,
        setta.types.artifact.BaseArtifact,
        "type",
        setta.types.artifact,
        lambda x: x,
        include_type_adapter=True,
        root_only=True,
    )

    code = """from typing import Annotated

from pydantic import Field, TypeAdapter

"""
    for import_block in [section_imports, code_obj_imports, artifact_imports]:
        if import_block:
            code += f"{import_block}\n"

    code += "\n".join([section_code, code_obj_code, artifact_code])

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_websocket_unions(output_file: Path):
    import setta.types.websocket

    imports, union_code = construct_unions(
        setta.types.websocket,
        setta.types.websocket.WebsocketMsg,
        "messageType",
        setta.types.websocket,
        lambda x: x,
        include_type_adapter=True,
    )

    code = """from typing import Annotated

from pydantic import Field, TypeAdapter

"""
    if imports:
        code += f"{imports}\n"
    code += union_code

    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_chart_settings_unions(output_file: Path):
    import setta.types.artifact

    imports, union_code = construct_unions(
        setta.types.artifact,
        setta.types.artifact.BaseChartSettings,
        "type",
        setta.types.artifact,
        lambda x: x,
    )
    code = """from typing import Annotated

from pydantic import Field, TypeAdapter

"""
    if imports:
        code += f"{imports}\n"
    code += union_code
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_dependency_key_unions(output_file: Path):
    import setta.types.dependency_key

    imports, union_code = construct_unions(
        setta.types.dependency_key,
        setta.types.dependency_key.BaseDependencyKey,
        "type",
        setta.types.dependency_key,
        lambda x: x,
    )
    code = """from typing import Annotated

from pydantic import Field, TypeAdapter

"""
    if imports:
        code += f"{imports}\n"
    code += union_code
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_dependency_value_unions(output_file: Path):
    import setta.types.dependency_value

    imports, union_code = construct_unions(
        setta.types.dependency_value,
        setta.types.dependency_value.BaseDependencyValue,
        "type",
        setta.types.dependency_value,
        lambda x: x,
    )
    code = """from typing import Annotated

from pydantic import Field, TypeAdapter

"""
    if imports:
        code += f"{imports}\n"
    code += union_code
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


def generate_chat_messages_unions(output_file: Path):
    import setta.types.chat_messages

    imports, union_code = construct_unions(
        setta.types.chat_messages,
        setta.types.chat_messages.BaseChatMessage,
        "role",
        setta.types.chat_messages,
        lambda x: x,
    )
    code = """from typing import Annotated

from pydantic import Field, TypeAdapter

"""
    if imports:
        code += f"{imports}\n"
    code += union_code
    code = ruff_format(code)
    output_file.write_text(code)
    print(f"wrote to {output_file}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError

    if sys.argv[1] == "unions":
        generate_unions(
            output_file=(
                resolve_generation_path(
                    __file__, Path("../../backend/setta/types/generated")
                )
                / "unions.py"
            )
        )
    elif sys.argv[1] == "websocket_unions":
        # has to be done separately due to import dependencies
        generate_websocket_unions(
            output_file=(
                resolve_generation_path(
                    __file__, Path("../../backend/setta/types/generated")
                )
                / "websocket_unions.py"
            )
        )
    elif sys.argv[1] == "chart_settings":
        # has to be done separately due to import dependencies
        generate_chart_settings_unions(
            output_file=(
                resolve_generation_path(
                    __file__, Path("../../backend/setta/types/generated")
                )
                / "chart_settings_unions.py"
            )
        )
    elif sys.argv[1] == "dependency_keys":
        # has to be done separately due to import dependencies
        generate_dependency_key_unions(
            output_file=(
                resolve_generation_path(
                    __file__, Path("../../backend/setta/types/generated")
                )
                / "dependency_keys.py"
            )
        )
    elif sys.argv[1] == "dependency_values":
        # has to be done separately due to import dependencies
        generate_dependency_value_unions(
            output_file=(
                resolve_generation_path(
                    __file__, Path("../../backend/setta/types/generated")
                )
                / "dependency_values.py"
            )
        )
    elif sys.argv[1] == "chat_messages":
        # has to be done separately due to import dependencies
        generate_chat_messages_unions(
            output_file=(
                resolve_generation_path(
                    __file__, Path("../../backend/setta/types/generated")
                )
                / "chat_messages.py"
            )
        )
    else:
        raise ValueError
