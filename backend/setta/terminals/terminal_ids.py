from setta.types.id import ID

TERMINAL_ID_SEPARATOR = "::"


def build_terminal_id(section_id: ID, share_session_id: str | None) -> str:
    if share_session_id is None:
        return str(section_id)
    return f"{share_session_id}{TERMINAL_ID_SEPARATOR}{section_id}"
