from typing import Annotated

from pydantic import Field

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
