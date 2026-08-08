from setta.types.chat_messages import MessageTextContent
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.utils.generate_memorable_string import generate_memorable_string


def create_new_chat_name(first_message: BaseChatMessageUnion) -> str:
    for content_block in first_message.content:
        if isinstance(content_block, MessageTextContent) and content_block.text:
            return content_block.text[:30]
    return generate_memorable_string()
