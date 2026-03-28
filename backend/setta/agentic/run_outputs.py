from typing import Any

from setta.types.chat_messages import AssistantChatMessage, MessageTextContent
from setta.types.generated.chat_messages import BaseChatMessageUnion


def build_run_outputs(messages: list[BaseChatMessageUnion]) -> dict[str, Any]:
    payload = [message.model_dump(mode="json") for message in messages]
    final_text = ""
    for message in reversed(messages):
        if isinstance(message, AssistantChatMessage):
            for content in message.content:
                if isinstance(content, MessageTextContent):
                    final_text = content.text
                    break
        if final_text:
            break
    return {"messages": payload, "finalText": final_text}
