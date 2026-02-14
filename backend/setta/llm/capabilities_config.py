"""Persistence + resolution helpers for chat-scoped capability settings."""

from pathlib import Path

from setta.database.db_objs import DBE
from setta.types.capabilities import (
    CapabilityMode,
    CapabilityPolicy,
    GlobalCapabilityDefaults,
    SkillsConfigFile,
    SkillSource,
)
from setta.types.id import ID
from setta.utils.paths import get_setta_paths

WORKSPACE_SKILLS_SOURCE_ID = "workspace_skills"
CODEX_HOME_SKILLS_SOURCE_ID = "codex_home_skills"
AGENTS_HOME_SKILLS_SOURCE_ID = "agents_home_skills"
DRAFT_CHAT_KEY = "__draft__"


def load_skills_config(dbe: DBE) -> SkillsConfigFile:
    raw = dbe.read_skills_config()
    if not raw:
        config = SkillsConfigFile(skillSources=build_default_skill_sources())
        save_skills_config(dbe, config)
        return config
    config = SkillsConfigFile.model_validate(raw)
    if not config.skillSources:
        config.skillSources = build_default_skill_sources()
        save_skills_config(dbe, config)
        return config
    if _migrate_builtin_skill_sources(config):
        save_skills_config(dbe, config)
    return config


def save_skills_config(dbe: DBE, config: SkillsConfigFile) -> None:
    dbe.write_skills_config(config.model_dump(mode="json"))


def build_default_skill_sources() -> list[SkillSource]:
    setta_files_root = get_setta_paths().setta_files_root
    home = Path.home()
    return [
        SkillSource(
            id=WORKSPACE_SKILLS_SOURCE_ID,
            path=str((setta_files_root / "skills").resolve(strict=False)),
            label="Workspace skills",
            builtin=True,
        ),
        SkillSource(
            id=CODEX_HOME_SKILLS_SOURCE_ID,
            path=str((home / ".codex" / "skills").resolve(strict=False)),
            label="Codex home skills",
            builtin=True,
        ),
        SkillSource(
            id=AGENTS_HOME_SKILLS_SOURCE_ID,
            path=str((home / ".agents" / "skills").resolve(strict=False)),
            label="Agents home skills",
            builtin=True,
        ),
    ]


def get_skill_sources(dbe: DBE) -> list[SkillSource]:
    return load_skills_config(dbe).skillSources


def get_skill_source_by_id(dbe: DBE, source_id: str) -> SkillSource:
    for source in load_skills_config(dbe).skillSources:
        if source.id == source_id:
            return source
    raise KeyError(f"Skill source '{source_id}' not found")


def ensure_workspace_skill_source(dbe: DBE) -> SkillSource:
    config = load_skills_config(dbe)
    for source in config.skillSources:
        if source.id == WORKSPACE_SKILLS_SOURCE_ID:
            return source
    workspace_source = next(
        source
        for source in build_default_skill_sources()
        if source.id == WORKSPACE_SKILLS_SOURCE_ID
    )
    config.skillSources = [workspace_source, *config.skillSources]
    save_skills_config(dbe, config)
    return workspace_source


def set_skill_sources(dbe: DBE, sources: list[SkillSource]) -> list[SkillSource]:
    unique_sources: list[SkillSource] = []
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    for source in sources:
        source_id = source.id.strip()
        if not source_id:
            raise ValueError("Skill source id must be non-empty")
        source_path = str(Path(source.path).expanduser().resolve(strict=False))
        if source_id in seen_ids:
            raise ValueError(f"Duplicate skill source id '{source_id}'")
        if source_path in seen_paths:
            raise ValueError(f"Duplicate skill source path '{source_path}'")
        seen_ids.add(source_id)
        seen_paths.add(source_path)
        unique_sources.append(
            source.model_copy(update={"id": source_id, "path": source_path})
        )
    config = load_skills_config(dbe)
    config.skillSources = unique_sources
    save_skills_config(dbe, config)
    return unique_sources


def get_global_capability_defaults(dbe: DBE) -> GlobalCapabilityDefaults:
    return load_skills_config(dbe).globalDefaults


def set_global_capability_defaults(
    dbe: DBE, defaults: GlobalCapabilityDefaults
) -> GlobalCapabilityDefaults:
    config = load_skills_config(dbe)
    config.globalDefaults = defaults
    save_skills_config(dbe, config)
    return defaults


def get_project_chat_capability_policy(
    dbe: DBE,
    *,
    project_config_id: ID,
    chat_id: ID | None,
) -> CapabilityPolicy:
    config = load_skills_config(dbe)
    project_policies = config.projectChatPolicies.get(str(project_config_id))
    if project_policies is None:
        return CapabilityPolicy(mode=CapabilityMode.inherit)
    chat_key = build_project_chat_policy_key(chat_id)
    policy = project_policies.get(chat_key)
    if policy is None:
        return CapabilityPolicy(mode=CapabilityMode.inherit)
    return policy


def set_project_chat_capability_policy(
    dbe: DBE,
    *,
    project_config_id: ID,
    chat_id: ID | None,
    policy: CapabilityPolicy,
) -> CapabilityPolicy:
    config = load_skills_config(dbe)
    project_key = str(project_config_id)
    if project_key not in config.projectChatPolicies:
        config.projectChatPolicies[project_key] = {}
    chat_key = build_project_chat_policy_key(chat_id)
    config.projectChatPolicies[project_key][chat_key] = policy
    save_skills_config(dbe, config)
    return policy


def resolve_capability_policy(
    policy: CapabilityPolicy,
    *,
    defaults: GlobalCapabilityDefaults,
    known_skill_ids: set[str],
    known_mcp_server_ids: set[str],
) -> tuple[list[str], list[str]]:
    if policy.mode == CapabilityMode.inherit:
        skill_ids = list(defaults.defaultSkillIds)
    elif policy.mode == CapabilityMode.custom:
        skill_ids = list(policy.enabledSkillIds)
    else:
        skill_ids = []

    # MCP selection is explicit per-chat and independent from skills mode.
    mcp_server_ids = list(policy.enabledMcpServerIds)

    _validate_capability_ids(
        skill_ids=skill_ids,
        mcp_server_ids=mcp_server_ids,
        known_skill_ids=known_skill_ids,
        known_mcp_server_ids=known_mcp_server_ids,
    )
    return skill_ids, mcp_server_ids


def build_project_chat_policy_key(chat_id: ID | None) -> str:
    if chat_id is None:
        return DRAFT_CHAT_KEY
    return str(chat_id)


def _validate_capability_ids(
    *,
    skill_ids: list[str],
    mcp_server_ids: list[str],
    known_skill_ids: set[str],
    known_mcp_server_ids: set[str],
) -> None:
    for skill_id in skill_ids:
        if skill_id not in known_skill_ids:
            raise KeyError(f"Capability policy references unknown skill '{skill_id}'")
    for server_id in mcp_server_ids:
        if server_id not in known_mcp_server_ids:
            raise KeyError(
                f"Capability policy references unknown MCP server '{server_id}'"
            )


def _migrate_builtin_skill_sources(config: SkillsConfigFile) -> bool:
    defaults_by_id = {
        source.id: source for source in build_default_skill_sources() if source.builtin
    }
    migrated = False
    next_sources: list[SkillSource] = []
    for source in config.skillSources:
        default_source = defaults_by_id.get(source.id)
        if default_source is None or not source.builtin:
            next_sources.append(source)
            continue
        normalized_source_path = str(
            Path(source.path).expanduser().resolve(strict=False)
        )
        if (
            normalized_source_path == default_source.path
            and source.label == default_source.label
        ):
            next_sources.append(source)
            continue
        next_sources.append(
            source.model_copy(
                update={
                    "path": default_source.path,
                    "label": default_source.label,
                    "builtin": True,
                }
            )
        )
        migrated = True
    if migrated:
        config.skillSources = next_sources
    return migrated
