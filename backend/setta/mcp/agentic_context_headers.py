from setta.types.id import ID

AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER = "x-setta-project-config-id"
AGENTIC_CONTEXT_CHAT_ID_HEADER = "x-setta-chat-id"
AGENTIC_CONTEXT_SECTION_ID_HEADER = "x-setta-section-id"
AGENTIC_CONTEXT_FRONTEND_WEBSOCKET_ID_HEADER = "x-setta-frontend-websocket-id"
AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER = "x-setta-allow-unscoped"


def build_agentic_context_headers(
    *,
    project_config_id: ID,
    chat_id: ID | None,
    section_id: ID | None,
    frontend_websocket_id: str | None = None,
    allow_unscoped: bool = False,
) -> dict[str, str]:
    headers: dict[str, str] = {
        AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER: str(project_config_id),
    }
    if chat_id is not None:
        headers[AGENTIC_CONTEXT_CHAT_ID_HEADER] = str(chat_id)
    if section_id is not None:
        headers[AGENTIC_CONTEXT_SECTION_ID_HEADER] = str(section_id)
    if isinstance(frontend_websocket_id, str) and frontend_websocket_id.strip() != "":
        headers[AGENTIC_CONTEXT_FRONTEND_WEBSOCKET_ID_HEADER] = (
            frontend_websocket_id.strip()
        )
    if allow_unscoped:
        headers[AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER] = "true"
    return headers
