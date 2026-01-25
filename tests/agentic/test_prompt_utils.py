from pydantic import ValidationError
import pytest

from setta.agentic.external_adapters.prompt_utils import build_prompt_from_inputs
from setta.types.chat_messages import MessageTextContent, UserChatMessage


class TestPromptUtils:
    def test_build_prompt_raises_on_invalid_message(self) -> None:
        inputs = {"messages": [{"role": "user", "content": "bad"}]}

        with pytest.raises(ValidationError):
            build_prompt_from_inputs("", inputs)

    def test_build_prompt_includes_valid_messages(self) -> None:
        message = UserChatMessage(
            id="msg-1",
            content=[MessageTextContent(text="Hello")],
        )
        prompt = build_prompt_from_inputs(
            "System prompt",
            {"messages": [message.model_dump(mode="json")]},
        )

        assert "System:\nSystem prompt" in prompt
        assert "User:\nHello" in prompt
