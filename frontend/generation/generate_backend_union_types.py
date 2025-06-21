from pathlib import Path

from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


def websocket_msg_union():
    from setta.types.websocket import (
        WebsocketMsgTypeForBackend,
        WebsocketMsgTypeForFrontend,
    )

    backend_classes = ",".join(
        [f"WebsocketMsg{e.name}" for e in WebsocketMsgTypeForBackend]
    )
    frontend_classes = ",".join(
        [f"WebsocketMsg{e.name}" for e in WebsocketMsgTypeForFrontend]
    )

    return f"""
from typing import Annotated,Union
from pydantic import Field, TypeAdapter
from setta.types.websocket import {backend_classes}
from setta.types.websocket import {frontend_classes}

WebsocketMsgForBackendUnion = Union[{backend_classes}]

WebsocketMsgForBackendUnionWithDiscriminator = Annotated[WebsocketMsgForBackendUnion, Field(discriminator="messageType")]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(WebsocketMsgForBackendUnionWithDiscriminator)

WebsocketMsgForFrontendUnion = Union[{frontend_classes}]

WebsocketMsgForFrontendUnionWithDiscriminator = Annotated[WebsocketMsgForFrontendUnion, Field(discriminator="messageType")]

WebsocketMsgForFrontendTypeAdapter = TypeAdapter(WebsocketMsgForFrontendUnionWithDiscriminator)
"""


def section_impl_union():
    from setta.types.sections import SectionType

    classes = ",".join([f"{e.name}SectionImpl" for e in SectionType])

    return f"""
from typing import Annotated,Union
from pydantic import Field, TypeAdapter
from setta.types.sections import {classes}

SectionImplUnion = Union[{classes}]

SectionImplUnionWithDiscriminator = Annotated[SectionImplUnion, Field(discriminator="type")]

SectionImplTypeAdapter = TypeAdapter(SectionImplUnionWithDiscriminator)
"""


def code_obj_impl_union():
    from setta.types.code_objs import CodeObjType

    classes = ",".join([f"{e.name}CodeObjImpl" for e in CodeObjType])

    return f"""
from typing import Annotated,Union
from pydantic import Field, TypeAdapter
from setta.types.code_objs import {classes}

CodeObjImplUnion = Union[{classes}]

CodeObjImplUnionWithDiscriminator = Annotated[CodeObjImplUnion, Field(discriminator="type")]

CodeObjImplTypeAdapter = TypeAdapter(CodeObjImplUnionWithDiscriminator)
"""


def gen_write_format(fn, output_path):
    code = fn()
    code = ruff_format(code)
    with open(output_path, "w") as f:
        f.write(code)
    print(f"wrote to {output_path}")


def main(output_folder):
    # order matters! (because of imports)
    gen_write_format(
        section_impl_union, output_folder / "generated_section_type_unions.py"
    )
    gen_write_format(
        code_obj_impl_union, output_folder / "generated_code_obj_type_unions.py"
    )
    gen_write_format(
        websocket_msg_union,
        output_folder / "generated_websocket_type_unions.py",
    )


if __name__ == "__main__":
    main(get_absolute_path(__file__, Path("../../backend/setta/types")))
