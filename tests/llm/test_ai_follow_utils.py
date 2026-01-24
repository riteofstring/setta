import unittest

from setta.llm.chat_toolkit.managed.utils import is_setta_tool_name


class AIFollowUtilsTests(unittest.TestCase):
    def test_is_setta_tool_name_accepts_mcp_prefix(self) -> None:
        self.assertTrue(is_setta_tool_name("setta__foo"))
        self.assertTrue(is_setta_tool_name("mcp__setta__foo"))
        self.assertFalse(is_setta_tool_name("other__foo"))
        self.assertFalse(is_setta_tool_name("mcp__other__foo"))
