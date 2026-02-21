from setta.database.db_objs import DBE
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.agentic import AgentProfile
from setta.types.id import ID

_COMPLETION_REPORTING_CONTRACT_HEADER = "## Completion Reporting Contract"


def build_agent_system_prompt(
    *,
    base_prompt: str,
    profile: AgentProfile | None,
    project_config_id: ID,
    dbe: DBE,
    completion_guard_enabled: bool = True,
) -> str:
    effective_base_prompt = base_prompt
    if not completion_guard_enabled:
        effective_base_prompt = _remove_markdown_section(
            base_prompt,
            _COMPLETION_REPORTING_CONTRACT_HEADER,
        )
    temporary_project_config_id = _ensure_temporary_project_id(project_config_id, dbe)
    prompt = (
        f"{effective_base_prompt}\n\n## Active project config\n"
        f"- id: {temporary_project_config_id}\n"
    )
    if profile is None:
        return prompt

    profile_lines: list[str] = []
    if profile.name:
        profile_lines.append(f"- name: {profile.name}")
    if profile.description:
        profile_lines.append(f"- description: {profile.description}")
    if profile_lines or profile.systemPrompt:
        prompt = f"{prompt}\n## Agent profile"
        if profile_lines:
            prompt = f"{prompt}\n" + "\n".join(profile_lines)
        if profile.systemPrompt.strip():
            prompt = f"{prompt}\n\n{profile.systemPrompt.strip()}"
    return prompt


def _remove_markdown_section(text: str, heading: str) -> str:
    lines = text.splitlines()
    start_index: int | None = None
    for index, line in enumerate(lines):
        if line.strip() == heading:
            start_index = index
            break
    if start_index is None:
        return text
    end_index = len(lines)
    for index in range(start_index + 1, len(lines)):
        if lines[index].startswith("## "):
            end_index = index
            break
    filtered = lines[:start_index] + lines[end_index:]
    return "\n".join(filtered).strip()


def _ensure_temporary_project_id(project_config_id: ID, dbe: DBE) -> ID:
    temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
    map_size_before = len(canonical_to_temporary)
    temporary_project_config_id = convert_canonical_ids_to_temporary(
        project_config_id,
        canonical_to_temporary,
        temporary_to_canonical,
    )
    if len(canonical_to_temporary) != map_size_before:
        dbe.write_temporary_id_map(canonical_to_temporary)
    return temporary_project_config_id
