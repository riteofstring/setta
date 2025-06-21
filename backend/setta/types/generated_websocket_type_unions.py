from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgUpdateBackendProjectState,
)

WebsocketMsgForBackendUnion = Union[
    WebsocketMsgCurrentAddressUpdate, WebsocketMsgUpdateBackendProjectState
]

WebsocketMsgForBackendUnionWithDiscriminator = Annotated[
    WebsocketMsgForBackendUnion, Field(discriminator="messageType")
]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(
    WebsocketMsgForBackendUnionWithDiscriminator
)
