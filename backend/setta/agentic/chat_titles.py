import hashlib
import re
from dataclasses import dataclass
from typing import Any

from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.generated.chat_messages import BaseChatMessageUnion

DEFAULT_TITLE_MAX_CHARS = 60
EXTERNAL_TITLE_SOURCE = "external"


@dataclass(frozen=True)
class ChatTitleResult:
    title: str
    input_hash: str


def build_chat_title_input(messages: list[BaseChatMessageUnion]) -> str:
    """Deterministic, minimal input for title generation.

    Keep this small and stable: it should only depend on chat messages, not
    project state, to avoid leaking out-of-scope content into global labels.
    """
    for message in messages:
        if not isinstance(message, UserChatMessage):
            continue
        for block in message.content:
            if not isinstance(block, MessageTextContent):
                continue
            text = (block.text or "").strip()
            if text:
                return text
    return ""


def compute_chat_title_input_hash(title_input: str) -> str:
    normalized = _collapse_whitespace(title_input).encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()


def build_deterministic_chat_title(
    messages: list[BaseChatMessageUnion],
    *,
    max_chars: int = DEFAULT_TITLE_MAX_CHARS,
) -> ChatTitleResult:
    title_input = build_chat_title_input(messages)
    input_hash = compute_chat_title_input_hash(title_input)
    normalized = _collapse_whitespace(title_input)
    if not normalized:
        return ChatTitleResult(title="Chat", input_hash=input_hash)
    if max_chars <= 0:
        return ChatTitleResult(title=normalized, input_hash=input_hash)
    return ChatTitleResult(title=normalized[:max_chars], input_hash=input_hash)


def sanitize_llm_title(title: str, *, max_chars: int = DEFAULT_TITLE_MAX_CHARS) -> str:
    normalized = _collapse_whitespace(title)
    if not normalized:
        return ""
    # Strip wrapping quotes and trailing punctuation that looks like a sentence end.
    normalized = normalized.strip(" \t\"'`")
    normalized = normalized.rstrip(" .:;!-")
    if max_chars > 0 and len(normalized) > max_chars:
        normalized = normalized[:max_chars].rstrip()
    return normalized


def maybe_set_external_chat_title(
    outputs: dict[str, Any],
    *,
    title: str,
    max_chars: int = DEFAULT_TITLE_MAX_CHARS,
) -> bool:
    """Set chat title from an external agent engine if allowed.

    This intentionally never overwrites an LLM-generated title (source=llm),
    but will replace deterministic/reused titles.
    """
    sanitized = sanitize_llm_title(title, max_chars=max_chars)
    if not sanitized:
        return False
    raw_source = outputs.get("nameSource")
    if isinstance(raw_source, str) and raw_source == "llm":
        return False
    outputs["name"] = sanitized
    outputs["nameSource"] = EXTERNAL_TITLE_SOURCE
    return True


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()
