from setta.agentic.completion_guard import (
    FAILED_CHECKS_MESSAGE,
    MISSING_CHECKS_MESSAGE,
    apply_completion_guard,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)


def _text_message(text: str) -> MessageTextContent:
    return MessageTextContent(text=text)


def _assistant_message(text: str) -> AssistantChatMessage:
    return AssistantChatMessage(content=[_text_message(text)])


def _user_message(text: str) -> UserChatMessage:
    return UserChatMessage(content=[_text_message(text)])


def _assistant_text(message: AssistantChatMessage) -> str:
    block = message.content[0]
    return block.text if isinstance(block, MessageTextContent) else ""


def test_completion_guard_blocks_done_claim_when_checks_missing() -> None:
    # Creation request + completion claim without verification must be blocked.
    prior_messages = [_user_message("Create a new project and scaffold everything.")]
    assistant_message = _assistant_message("Done. The project is ready.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_blocks_done_claim_when_checks_failed() -> None:
    # Failed checks should force an explicit failure response instead of completion.
    prior_messages = [
        _user_message("Build a new section for this project."),
        _assistant_message("I ran tests and checks failed."),
    ]
    assistant_message = _assistant_message("All done and ready.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == FAILED_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == FAILED_CHECKS_MESSAGE


def test_completion_guard_allows_done_claim_after_passing_checks() -> None:
    # Passing checks satisfy the gate and should preserve the completion claim.
    prior_messages = [
        _user_message("Create a project setup for this repo."),
        _assistant_message("Ran tests and verification passed with no errors."),
    ]
    assistant_message = _assistant_message("Done. Everything is complete.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Everything is complete."


def test_completion_guard_ignores_non_creation_conversations() -> None:
    # Non-creation requests are out of scope for this completion gate.
    prior_messages = [_user_message("Explain this function in detail.")]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_ignores_conversational_ready_phrases() -> None:
    # Conversational readiness should not be interpreted as a completion claim.
    prior_messages = [_user_message("Create a new project setup.")]
    assistant_message = _assistant_message("Ready when you are. I can start now.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Ready when you are. I can start now."


def test_completion_guard_uses_latest_explicit_verification_result() -> None:
    # A newer pass result should override older failed-check text.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("I ran tests and checks failed."),
        _assistant_message("I reran tests and verification passed cleanly."),
    ]
    assistant_message = _assistant_message("Done. Ready to ship.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Ready to ship."
