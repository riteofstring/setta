from typing import Annotated, Union, Literal
from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgUpdateBackendProjectState,
)

WebsocketMsgForBackendUnion = Annotated[
    Union[WebsocketMsgCurrentAddressUpdate, WebsocketMsgUpdateBackendProjectState],
    Field(discriminator="messageType"),
]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(WebsocketMsgForBackendUnion)

from setta.types.websocket import SectionType

SectionTypeLiteral = Literal[
    CALLABLE,
    DICT,
    LIST_ROOT,
    DICT_ROOT,
    GROUP,
    IMAGE,
    CHART,
    DRAW,
    TEXT_BLOCK,
    SOCIAL,
    GLOBAL_VARIABLES,
    CODE,
    GEN_PYTHON_CODE,
    TERMINAL,
    IFRAME,
    CHAT,
    BROWSER,
]
