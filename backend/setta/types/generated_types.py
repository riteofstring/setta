from typing import Annotated, Union, Literal
from pydantic import Field, TypeAdapter
from setta.types.websocket import (
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgUpdateBackendProjectState,
)
from setta.types.section_enums import SectionType

WebsocketMsgForBackendUnion = Annotated[
    Union[WebsocketMsgCurrentAddressUpdate, WebsocketMsgUpdateBackendProjectState],
    Field(discriminator="messageType"),
]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(WebsocketMsgForBackendUnion)


SectionTypeLiteral = Literal[
    SectionType.CALLABLE,
    SectionType.DICT,
    SectionType.LIST_ROOT,
    SectionType.DICT_ROOT,
    SectionType.GROUP,
    SectionType.IMAGE,
    SectionType.CHART,
    SectionType.DRAW,
    SectionType.TEXT_BLOCK,
    SectionType.SOCIAL,
    SectionType.GLOBAL_VARIABLES,
    SectionType.CODE,
    SectionType.GEN_PYTHON_CODE,
    SectionType.TERMINAL,
    SectionType.IFRAME,
    SectionType.CHAT,
    SectionType.BROWSER,
]
