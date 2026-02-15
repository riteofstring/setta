import re
from typing import Any

from setta.types.chat_messages import AssistantChatMessage, MessageTextContent

_CREATION_VERB_RE = re.compile(
    r"\b(create|build|scaffold|setup|set up|initialize|generate)\b", re.IGNORECASE
)
_CREATION_OBJECT_RE = re.compile(
    r"\b(project|section|workspace|app|codebase)\b", re.IGNORECASE
)
_COMPLETION_CLAIM_RE = re.compile(
    r"\b(done|completed?|finished|all set|ready to ship)\b", re.IGNORECASE
)
_CHECK_RE = re.compile(
    r"\b(check|checks|test|tests|lint|type ?check|verify|verification|error check)\b",
    re.IGNORECASE,
)
_PASS_RE = re.compile(
    r"\b(pass(?:ed)?|success(?:ful)?|clean|no errors?)\b",
    re.IGNORECASE,
)
_FAIL_RE = re.compile(
    r"\b(fail(?:ed|ing)?|did not pass|errors? found|failing checks?)\b",
    re.IGNORECASE,
)

MISSING_CHECKS_MESSAGE = (
    "I cannot mark this complete yet. I still need to run error checks "
    "(for example tests/lint/type-check) and report explicit pass/fail results."
)
FAILED_CHECKS_MESSAGE = (
    "I cannot mark this complete because error checks are failing. "
    "I need to report the failing checks and fixes before completion."
)


def apply_completion_guard(
    prior_messages: list[Any],
    assistant_message: AssistantChatMessage,
) -> str | None:
    assistant_text = _extract_text_from_message(assistant_message)
    if not assistant_text:
        return None
    if not _assistant_claims_completion(assistant_text):
        return None
    creation_start_index = _resolve_creation_flow_start_index(prior_messages)
    if creation_start_index is None:
        return None
    scoped_prior_messages = prior_messages[creation_start_index:]

    verification_status = _resolve_verification_status(
        scoped_prior_messages,
        assistant_text,
    )
    if verification_status == "passed":
        return None

    replacement_text = (
        FAILED_CHECKS_MESSAGE
        if verification_status == "failed"
        else MISSING_CHECKS_MESSAGE
    )
    _replace_assistant_text(assistant_message, replacement_text)
    return replacement_text


def _assistant_claims_completion(text: str) -> bool:
    return bool(_COMPLETION_CLAIM_RE.search(text))


def _resolve_creation_flow_start_index(messages: list[Any]) -> int | None:
    latest_creation_index: int | None = None
    latest_user_index: int | None = None
    for index in range(len(messages) - 1, -1, -1):
        message = messages[index]
        if _normalize_role(message) != "user":
            continue
        text = _extract_text_from_message(message)
        if not text:
            continue
        if latest_user_index is None:
            latest_user_index = index
        if _is_creation_intent(text):
            latest_creation_index = index
            break
    if latest_creation_index is None:
        return None
    if latest_user_index is not None and latest_user_index > latest_creation_index:
        return None
    return latest_creation_index


def _is_creation_intent(text: str) -> bool:
    return bool(_CREATION_VERB_RE.search(text) and _CREATION_OBJECT_RE.search(text))


def _resolve_verification_status(
    prior_messages: list[Any],
    assistant_text: str,
) -> str:
    candidate_texts = [assistant_text]
    for message in reversed(prior_messages):
        role = _normalize_role(message)
        if role == "user":
            continue
        text = _extract_text_from_message(message)
        if text:
            candidate_texts.append(text)

    for text in candidate_texts:
        if not _CHECK_RE.search(text):
            continue
        if _FAIL_RE.search(text):
            return "failed"
        if _PASS_RE.search(text):
            return "passed"
    return "missing"


def _replace_assistant_text(
    assistant_message: AssistantChatMessage,
    next_text: str,
) -> None:
    for index, block in enumerate(assistant_message.content):
        if block.type != "text":
            continue
        assistant_message.content[index] = MessageTextContent(text=next_text)
        return
    assistant_message.content.insert(0, MessageTextContent(text=next_text))


def _extract_text_from_message(message: Any) -> str:
    content = getattr(message, "content", None)
    if not isinstance(content, list):
        return ""
    text_blocks: list[str] = []
    for block in content:
        block_type = getattr(block, "type", None)
        if block_type != "text":
            continue
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            text_blocks.append(text.strip())
    return "\n".join(text_blocks)


def _normalize_role(message: Any) -> str | None:
    role = getattr(message, "role", None)
    if role is None:
        return None
    if isinstance(role, str):
        normalized = role.strip().lower()
        return normalized if normalized else None
    value = getattr(role, "value", None)
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized if normalized else None
    return None
