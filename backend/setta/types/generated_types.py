from typing import Annotated, Union
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
