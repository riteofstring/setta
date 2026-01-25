from typing import Any

from setta.types.chat_messages import MessageTextContent
from setta.types.generated.chat_messages import BaseChatMessageTypeAdapter


def build_prompt_from_inputs(system_prompt: str, inputs: dict[str, Any] | None) -> str:
    parts: list[str] = []
    normalized_system = system_prompt.strip()
    if normalized_system:
        parts.append(f"System:\n{normalized_system}")

    if inputs:
        raw_messages = inputs.get("messages")
        if isinstance(raw_messages, list):
            for raw in raw_messages:
                message = BaseChatMessageTypeAdapter.validate_python(raw)
                role = getattr(message, "role", "user")
                role_label = role.value if hasattr(role, "value") else str(role)
                text = _extract_message_text(message)
                if text:
                    parts.append(f"{role_label.capitalize()}:\n{text}")
        prompt = inputs.get("prompt")
        if isinstance(prompt, str) and prompt.strip():
            parts.append(prompt.strip())

    combined = "\n\n".join(parts).strip()
    if combined:
        return f"{combined}\n"
    return "\n"


def _extract_message_text(message: Any) -> str:
    content = getattr(message, "content", None)
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for entry in content:
        if isinstance(entry, MessageTextContent):
            if entry.text:
                parts.append(entry.text)
    return "\n".join(parts).strip()
