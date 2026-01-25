import unittest

from pydantic import ValidationError

from setta.agentic.external_adapters.prompt_utils import build_prompt_from_inputs
from setta.types.chat_messages import MessageTextContent, UserChatMessage


class PromptUtilsTests(unittest.TestCase):
    def test_build_prompt_raises_on_invalid_message(self) -> None:
        inputs = {"messages": [{"role": "user", "content": "bad"}]}

        with self.assertRaises(ValidationError):
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

        self.assertIn("System:\nSystem prompt", prompt)
        self.assertIn("User:\nHello", prompt)
