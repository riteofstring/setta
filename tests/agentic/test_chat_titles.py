from setta.agentic.chat_titles import (
    build_deterministic_chat_title,
    compute_chat_title_input_hash,
    sanitize_llm_title,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    SystemChatMessage,
    UserChatMessage,
)


def test_build_deterministic_chat_title_collapses_whitespace_and_hashes_input() -> None:
    messages = [
        SystemChatMessage(content=[MessageTextContent(text="system")]),
        UserChatMessage(content=[MessageTextContent(text="  Hello\nworld  ")]),
        AssistantChatMessage(content=[MessageTextContent(text="ok")]),
    ]

    result = build_deterministic_chat_title(messages)

    assert result.title == "Hello world"
    assert result.input_hash == compute_chat_title_input_hash("Hello\nworld")


def test_build_deterministic_chat_title_falls_back_when_missing_user_text() -> None:
    messages = [
        SystemChatMessage(content=[MessageTextContent(text="system")]),
        AssistantChatMessage(content=[MessageTextContent(text="ok")]),
    ]

    result = build_deterministic_chat_title(messages)

    assert result.title == "Chat"
    assert result.input_hash == compute_chat_title_input_hash("")


def test_sanitize_llm_title_strips_quotes_punctuation_and_truncates() -> None:
    assert sanitize_llm_title('  "My title."  ') == "My title"
    assert sanitize_llm_title("Title!\n") == "Title"
    assert sanitize_llm_title("Hello world", max_chars=5) == "Hello"
    assert sanitize_llm_title("   ") == ""

