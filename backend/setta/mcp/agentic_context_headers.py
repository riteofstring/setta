from setta.types.id import ID

AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER = "x-setta-project-config-id"
AGENTIC_CONTEXT_CHAT_ID_HEADER = "x-setta-chat-id"
AGENTIC_CONTEXT_SECTION_ID_HEADER = "x-setta-section-id"
AGENTIC_CONTEXT_RUN_ID_HEADER = "x-setta-run-id"
AGENTIC_CONTEXT_FRONTEND_AFFINITY_TOKEN_HEADER = "x-setta-frontend-affinity-token"
AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER = "x-setta-allow-unscoped"
AGENTIC_CONTEXT_LINKED_CHAT_DEPTH_HEADER = "x-setta-linked-chat-depth"
AGENTIC_CONTEXT_LINKED_CHAT_CHAIN_HEADER = "x-setta-linked-chat-chain-section-ids"


def build_agentic_context_headers(
    *,
    project_config_id: ID,
    chat_id: ID | None,
    section_id: ID | None,
    run_id: ID | None = None,
    frontend_affinity_token: str | None = None,
    allow_unscoped: bool = False,
    linked_chat_invocation_depth: int = 0,
    linked_chat_invocation_chain_section_ids: tuple[ID, ...] = (),
) -> dict[str, str]:
    headers: dict[str, str] = {
        AGENTIC_CONTEXT_PROJECT_CONFIG_ID_HEADER: str(project_config_id),
    }
    if chat_id is not None:
        headers[AGENTIC_CONTEXT_CHAT_ID_HEADER] = str(chat_id)
    if section_id is not None:
        headers[AGENTIC_CONTEXT_SECTION_ID_HEADER] = str(section_id)
    if run_id is not None:
        headers[AGENTIC_CONTEXT_RUN_ID_HEADER] = str(run_id)
    if (
        isinstance(frontend_affinity_token, str)
        and frontend_affinity_token.strip() != ""
    ):
        headers[AGENTIC_CONTEXT_FRONTEND_AFFINITY_TOKEN_HEADER] = (
            frontend_affinity_token.strip()
        )
    if allow_unscoped:
        headers[AGENTIC_CONTEXT_ALLOW_UNSCOPED_HEADER] = "true"
    if linked_chat_invocation_depth > 0:
        headers[AGENTIC_CONTEXT_LINKED_CHAT_DEPTH_HEADER] = str(
            linked_chat_invocation_depth
        )
    if linked_chat_invocation_chain_section_ids:
        headers[AGENTIC_CONTEXT_LINKED_CHAT_CHAIN_HEADER] = ",".join(
            str(section_id) for section_id in linked_chat_invocation_chain_section_ids
        )
    return headers
