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
) -> List[Type[BaseModel]]:
    classes = []
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base_class):
            fields = obj.model_fields
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

    return classes


def construct_unions(module, base_class, discriminator):
    base_classes = find_sub_classes(module, base_class, discriminator, True)

    base_class_to_children = {}
    code = """
from typing import Annotated,Union
from pydantic import Field, TypeAdapter

"""
    for base_class in base_classes:
        code += f"from {module.__name__} import {base_class.__name__}\n\n"
        child_classes = find_sub_classes(module, base_class, discriminator, False)
        base_class_to_children[base_class] = child_classes
        for child_class in child_classes:
            code += f"from {module.__name__} import {child_class.__name__}\n\n"

    for base_class, child_classes in base_class_to_children.items():
        union_name = f"{base_class.__name__}Union"
        code += (
            f"{union_name} = Union[{', '.join(c.__name__ for c in child_classes)}]\n\n"
        )
        code += f'{union_name}WithDiscriminator = Annotated[{union_name}, Field(discriminator="{discriminator}")]\n\n'
        code += f"{base_class.__name__}TypeAdapter = TypeAdapter({union_name}WithDiscriminator)\n\n"

        defaults = []
        for c in child_classes:
            d = c.model_fields[discriminator].default
            # assert enum name and value are the same for simplicity
            assert d.name == d.value
            defaults.append(f'"{d.name}"')
        defaults = ", ".join(defaults)
        code += f"{base_class.__name__}TypeSet = set([{defaults}])\n\n"

    return ruff_format(code)


def section_impl_union():
    import setta.types.sections

    return construct_unions(
        setta.types.sections, setta.types.sections.BaseSectionImpl, "type"
    )


def code_obj_impl_union():
    import setta.types.code_objs

    return construct_unions(
        setta.types.code_objs, setta.types.code_objs.BaseCodeObjImpl, "type"
    )


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


def gen_write(fn, output_path):
    code = fn()
    with open(output_path, "w") as f:
        f.write(code)
    print(f"wrote to {output_path}")


def main(output_folder):
    # order matters! (because of imports)
    gen_write(section_impl_union, output_folder / "generated_section_type_unions.py")
    gen_write(code_obj_impl_union, output_folder / "generated_code_obj_type_unions.py")
    gen_write(
        websocket_msg_union,
        output_folder / "generated_websocket_type_unions.py",
    )


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types")))
