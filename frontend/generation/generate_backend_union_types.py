from pathlib import Path

from setta.types.section_enums import SectionType
from setta.types.websocket import WebsocketMsgTypeForBackend
from setta.utils.format_code import ruff_format
from setta.utils.utils import get_absolute_path


def websocket_msg_union():
    classes = ",".join([f"WebsocketMsg{e.name}" for e in WebsocketMsgTypeForBackend])

    return f"""
from setta.types.websocket import {classes}

WebsocketMsgForBackendUnion = Annotated[Union[{classes}], Field(discriminator="messageType")]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(WebsocketMsgForBackendUnion)
"""


def section_type_literals():
    return f"""
from setta.types.websocket import SectionType

SectionTypeLiteral = Literal[{",".join([f"{e.name}" for e in SectionType])}]
"""


def main(output_path):
    py_code = """
from typing import Annotated,Union,Literal
from pydantic import Field, TypeAdapter
"""
    py_code += websocket_msg_union()
    py_code += section_type_literals()

    py_code = ruff_format(py_code)
    with open(output_path, "w") as f:
        f.write(py_code)

    print(f"generate_backend_union_types to {output_path}")


if __name__ == "__main__":
    main(
        get_absolute_path(
            __file__, Path("../../backend/setta/types/generated_types.py")
        )
    )
