from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.chat_messages import (
    AssistantChatMessage,
    SystemChatMessage,
    ToolChatMessage,
    UserChatMessage,
)

BaseChatMessageUnion = (
    SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
)

BaseChatMessageUnionWithDiscriminator = Annotated[
    BaseChatMessageUnion, Field(discriminator="role")
]

BaseChatMessageTypeAdapter = TypeAdapter(BaseChatMessageUnionWithDiscriminator)

BaseChatMessageTypeSet = set(["system", "assistant", "user", "tool"])

ContentChatMessageUnion = SystemChatMessage | AssistantChatMessage | UserChatMessage

ContentChatMessageUnionWithDiscriminator = Annotated[
    ContentChatMessageUnion, Field(discriminator="role")
]

ContentChatMessageTypeAdapter = TypeAdapter(ContentChatMessageUnionWithDiscriminator)

ContentChatMessageTypeSet = set(["system", "assistant", "user"])
