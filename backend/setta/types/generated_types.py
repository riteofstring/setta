from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.websocket import WebsocketMsgCurrentAddressUpdate

WebsocketMsgForBackendUnion = Annotated[
    Union[WebsocketMsgCurrentAddressUpdate], Field(discriminator="messageType")
]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(WebsocketMsgForBackendUnion)
