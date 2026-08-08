from dataclasses import dataclass

from setta.types.agentic import AgentProfile
from setta.types.id import ID
from setta.types.section_impls import ChatPermissionMode


@dataclass(frozen=True, slots=True)
class LinkedChatSectionAdmission:
    chat_id: ID
    target_label: str
    thinking: bool
    permission_mode: ChatPermissionMode
    search_enabled: bool
    selected_profile: AgentProfile | None
    effective_engine_config_id: ID


class LinkedChatAdmissionError(ValueError):
    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason
        self.message = message
