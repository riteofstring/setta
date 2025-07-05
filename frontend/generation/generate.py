from pathlib import Path

import setta.types.code_obj_impls
import setta.types.generated.cores
import setta.types.generated.layerings
import setta.types.generated.modifiers
import setta.types.section_impls
from pydantic import BaseModel
from pydantic_core import PydanticUndefined
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


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


def get_parent_classes_up_to_base_model(x):
    if x.__base__ is BaseModel:
        return []
    output = []
    for b in x.__bases__:
        output.append(b)
        output.extend(get_parent_classes_up_to_base_model(b))
    return output


def main(output_folder):
    generate_modifiers(output_folder / "modifiers.py", classes)
    generate_unions(output_folder / "unions.py")


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types/generated")))
