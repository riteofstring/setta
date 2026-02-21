from typing import Any

from setta.agentic.completion_report import (
    CompletionStatusReport,
    VerificationStatus,
    coerce_completion_status_report,
    is_report_completion_status_tool,
)
from setta.database.db_objs import DBE
from setta.types.chat_messages import AssistantChatMessage, MessageTextContent
from setta.types.generated.settings_state import SettingsState

MISSING_REPORT_MESSAGE = "I need to call `report_completion_status` before replying."
MISSING_CHECKS_MESSAGE = (
    "I cannot mark this complete yet. I need explicit pass/fail results "
    "for required verification checks."
)
FAILED_CHECKS_MESSAGE = (
    "I cannot mark this complete because required error checks are failing. "
    "I need to report failing checks and fixes before completion."
)


def apply_completion_guard(
    prior_messages: list[Any],
    assistant_message: AssistantChatMessage,
    *,
    completion_guard_enabled: bool = True,
    same_turn_tool_results: list[Any] | None = None,
) -> str | None:
    if not completion_guard_enabled:
        return None
    assistant_text = _extract_assistant_text(assistant_message)
    has_user_visible_text = bool(assistant_text.strip())
    if not has_user_visible_text:
        return None
    if _is_backend_error_text(assistant_text):
        return None
    report_search_messages = list(prior_messages)
    if same_turn_tool_results:
        report_search_messages.extend(same_turn_tool_results)
    scoped_messages = _resolve_active_task_messages(report_search_messages)
    if scoped_messages is None:
        return None
    report = _resolve_latest_completion_report(scoped_messages)
    if report is None:
        _replace_assistant_text(assistant_message, MISSING_REPORT_MESSAGE)
        return MISSING_REPORT_MESSAGE
    if not report.completionIntent:
        return None
    if not report.requiresVerification:
        return None
    if report.verificationStatus == VerificationStatus.passed:
        return None
    replacement_text = (
        FAILED_CHECKS_MESSAGE
        if report.verificationStatus == VerificationStatus.failed
        else MISSING_CHECKS_MESSAGE
    )
    _replace_assistant_text(assistant_message, replacement_text)
    return replacement_text


def is_completion_guard_enabled(settings: SettingsState) -> bool:
    return settings.backend.completionGuardEnabled


def load_completion_guard_enabled(dbe: DBE) -> bool:
    payload = dbe.read_json(dbe.settings)
    if not isinstance(payload, dict):
        raise TypeError("setta-settings.json must contain a JSON object at the root.")
    settings = SettingsState.model_validate(payload)
    return is_completion_guard_enabled(settings)


def _resolve_active_task_messages(messages: list[Any]) -> list[Any] | None:
    for index in range(len(messages) - 1, -1, -1):
        if _normalize_role(messages[index]) != "user":
            continue
        return messages[index:]
    return None


def _resolve_latest_completion_report(
    messages: list[Any],
) -> CompletionStatusReport | None:
    candidate_messages = _messages_after_latest_assistant(messages)
    for message in reversed(candidate_messages):
        if _normalize_role(message) != "tool":
            continue
        tool_name = getattr(message, "tool_name", None)
        if not is_report_completion_status_tool(tool_name):
            continue
        for candidate in _extract_report_candidates(message):
            report = coerce_completion_status_report(candidate)
            if report is not None:
                return report
    return None


def _extract_report_candidates(message: Any) -> list[object]:
    result = getattr(message, "result", None)
    if not isinstance(result, dict):
        return []
    candidates: list[object] = []
    structured_content = result.get("structuredContent")
    if isinstance(structured_content, dict):
        candidates.append(structured_content)
    candidates.append(result)
    return candidates


def _messages_after_latest_assistant(messages: list[Any]) -> list[Any]:
    for index in range(len(messages) - 1, -1, -1):
        if _normalize_role(messages[index]) == "assistant":
            return messages[index + 1 :]
    return messages


def _extract_assistant_text(message: AssistantChatMessage) -> str:
    text_blocks: list[str] = []
    for block in message.content:
        if block.type != "text":
            continue
        normalized = block.text.strip()
        if normalized:
            text_blocks.append(normalized)
    return "\n".join(text_blocks)


def _is_backend_error_text(text: str) -> bool:
    return text.strip().lower().startswith("[error]")


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
