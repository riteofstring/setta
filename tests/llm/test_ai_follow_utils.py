from setta.llm.chat_toolkit.managed.utils import is_setta_tool_name


class TestAIFollowUtils:
    def test_is_setta_tool_name_accepts_mcp_prefix(self) -> None:
        assert is_setta_tool_name("setta__foo")
        assert is_setta_tool_name("mcp__setta__foo")
        assert is_setta_tool_name("setta_foo")
        assert is_setta_tool_name("mcp__setta_foo")
        assert not is_setta_tool_name("other__foo")
        assert not is_setta_tool_name("mcp__other__foo")
        assert not is_setta_tool_name("other_foo")
