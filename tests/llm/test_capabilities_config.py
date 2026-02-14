from pathlib import Path

import pytest
from setta.database.db_objs import DBE
from setta.llm.capabilities_config import (
    WORKSPACE_SKILLS_SOURCE_ID,
    get_project_chat_capability_policy,
    load_skills_config,
    resolve_capability_policy,
    set_project_chat_capability_policy,
    set_skill_sources,
)
from setta.types.capabilities import (
    CapabilityMode,
    CapabilityPolicy,
    GlobalCapabilityDefaults,
    SkillSource,
)
from setta.types.core import Core, Variant
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import set_chat_section_capability_policy
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionImpl
from tests.utils.setta_paths import temporary_setta_paths


def _build_single_config_with_chat_section() -> tuple[ProjectStateSingleConfig, ID, ID]:
    chat_impl = ChatSectionImpl(id=ID("chat-impl"))
    variant = Variant(
        id=ID("chat-variant"),
        impl=chat_impl.id,
        nonPresetImpls=[chat_impl.id],
    )
    section = Core(
        id=ID("chat-section"),
        name="Chat",
        variants=[variant.id],
        defaultVariant=variant.id,
    )
    project_config = ProjectConfig(
        id=ID("project-config"),
        name="Capabilities test project",
        sectionVariantMap={section.id: variant.id},
    )
    return (
        ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionVariants={variant.id: variant},
            sectionImpls={chat_impl.id: chat_impl},
        ),
        project_config.id,
        section.id,
    )


def test_project_chat_policy_defaults_to_inherit_and_supports_crud(
    tmp_path: Path,
) -> None:
    # Missing policy entries should resolve to inherit mode for project chat.
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location=str(setta_root),
    ):
        dbe = DBE(setta_root)
        project_config_id = ID("project-a")

        default_policy = get_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=None,
        )
        assert default_policy.mode == CapabilityMode.inherit
        assert default_policy.enabledSkillIds == []
        assert default_policy.enabledMcpServerIds == []

        draft_policy = CapabilityPolicy(
            mode=CapabilityMode.custom,
            enabledSkillIds=["skill-a"],
            enabledMcpServerIds=["server-a"],
        )
        set_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=None,
            policy=draft_policy,
        )

        stored_draft_policy = get_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=None,
        )
        assert stored_draft_policy == draft_policy

        chat_policy = CapabilityPolicy(
            mode=CapabilityMode.disabled,
        )
        set_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=ID("chat-1"),
            policy=chat_policy,
        )

        stored_chat_policy = get_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=ID("chat-1"),
        )
        assert stored_chat_policy == chat_policy

        # Draft and concrete chat policies are keyed independently.
        assert (
            get_project_chat_capability_policy(
                dbe,
                project_config_id=project_config_id,
                chat_id=None,
            )
            == draft_policy
        )


def test_resolve_capability_policy_modes_and_unknown_ids() -> None:
    defaults = GlobalCapabilityDefaults(
        defaultSkillIds=["skill-a"],
        defaultMcpServerIds=["server-a"],
    )
    known_skill_ids = {"skill-a", "skill-b"}
    known_mcp_server_ids = {"server-a", "server-b"}

    # Disabled skills mode leaves MCP selection untouched.
    disabled = CapabilityPolicy(
        mode=CapabilityMode.disabled,
        enabledMcpServerIds=["server-b"],
    )
    resolved_disabled = resolve_capability_policy(
        disabled,
        defaults=defaults,
        known_skill_ids=known_skill_ids,
        known_mcp_server_ids=known_mcp_server_ids,
    )
    assert resolved_disabled == ([], ["server-b"])

    # Inherit mode resolves only skills to global defaults.
    inherit = CapabilityPolicy(mode=CapabilityMode.inherit)
    resolved_inherit = resolve_capability_policy(
        inherit,
        defaults=defaults,
        known_skill_ids=known_skill_ids,
        known_mcp_server_ids=known_mcp_server_ids,
    )
    assert resolved_inherit == (["skill-a"], [])

    # Custom mode resolves skills + explicit MCP selection.
    custom = CapabilityPolicy(
        mode=CapabilityMode.custom,
        enabledSkillIds=["skill-b"],
        enabledMcpServerIds=["server-b"],
    )
    resolved_custom = resolve_capability_policy(
        custom,
        defaults=defaults,
        known_skill_ids=known_skill_ids,
        known_mcp_server_ids=known_mcp_server_ids,
    )
    assert resolved_custom == (["skill-b"], ["server-b"])

    # Unknown ids should fail loudly so stale selections are surfaced to clients.
    with pytest.raises(KeyError):
        resolve_capability_policy(
            CapabilityPolicy(
                mode=CapabilityMode.custom,
                enabledSkillIds=["missing-skill"],
            ),
            defaults=defaults,
            known_skill_ids=known_skill_ids,
            known_mcp_server_ids=known_mcp_server_ids,
        )

    with pytest.raises(KeyError):
        resolve_capability_policy(
            CapabilityPolicy(
                mode=CapabilityMode.custom,
                enabledMcpServerIds=["missing-server"],
            ),
            defaults=defaults,
            known_skill_ids=known_skill_ids,
            known_mcp_server_ids=known_mcp_server_ids,
        )


def test_section_and_project_chat_policies_are_separate(tmp_path: Path) -> None:
    # Section-level policy lives in project state and must remain independent from
    # project-chat policy persisted in skills_config.json.
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location=str(setta_root),
    ):
        dbe = DBE(setta_root)
        single_config, project_config_id, section_id = (
            _build_single_config_with_chat_section()
        )

        section_policy = CapabilityPolicy(
            mode=CapabilityMode.custom,
            enabledSkillIds=["section-skill"],
            enabledMcpServerIds=["section-server"],
        )
        set_chat_section_capability_policy(single_config, section_id, section_policy)

        project_chat_policy = CapabilityPolicy(
            mode=CapabilityMode.custom,
            enabledSkillIds=["project-skill"],
            enabledMcpServerIds=["project-server"],
        )
        set_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=ID("project-chat-1"),
            policy=project_chat_policy,
        )

        # Persisting project chat policy should not mutate section policy.
        section_impl = get_curr_effective_section_impl_with_type_guard(
            single_config,
            section_id,
            ChatSectionImpl,
        )
        assert section_impl.capabilityPolicy == section_policy

        # Persisting section policy should not mutate project chat policy.
        stored_project_policy = get_project_chat_capability_policy(
            dbe,
            project_config_id=project_config_id,
            chat_id=ID("project-chat-1"),
        )
        assert stored_project_policy == project_chat_policy


def test_set_skill_sources_rejects_duplicate_ids_and_paths(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)

    source_a = workspace_root / "skills_a"
    source_b = workspace_root / "skills_b"
    source_a.mkdir(parents=True)
    source_b.mkdir(parents=True)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location=str(setta_root),
    ):
        dbe = DBE(setta_root)

        with pytest.raises(ValueError):
            # Duplicate IDs should be rejected.
            set_skill_sources(
                dbe,
                [
                    SkillSource(
                        id="dup",
                        path=str(source_a),
                        label="A",
                    ),
                    SkillSource(
                        id="dup",
                        path=str(source_b),
                        label="B",
                    ),
                ],
            )

        with pytest.raises(ValueError):
            # Duplicate normalized paths should be rejected.
            set_skill_sources(
                dbe,
                [
                    SkillSource(
                        id="a",
                        path=str(source_a),
                        label="A",
                    ),
                    SkillSource(
                        id="b",
                        path=str(source_a),
                        label="B",
                    ),
                ],
            )


def test_default_workspace_skill_source_points_to_setta_files(tmp_path: Path) -> None:
    # Imported workspace skills should live under setta_files/skills.
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location=str(setta_root),
    ):
        dbe = DBE(setta_root)
        config = load_skills_config(dbe)
        workspace_source = next(
            source
            for source in config.skillSources
            if source.id == WORKSPACE_SKILLS_SOURCE_ID
        )
        assert workspace_source.builtin is True
        assert workspace_source.path == str(
            (setta_root / "skills").resolve(strict=False)
        )


def test_load_skills_config_migrates_builtin_workspace_source_path(
    tmp_path: Path,
) -> None:
    # Existing configs with the old workspace-root skill path should be migrated
    # to setta_files/skills when loaded.
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location=str(setta_root),
    ):
        dbe = DBE(setta_root)
        dbe.write_skills_config(
            {
                "skillSources": [
                    {
                        "id": WORKSPACE_SKILLS_SOURCE_ID,
                        "path": str((workspace_root / "skills").resolve(strict=False)),
                        "label": "Workspace skills",
                        "builtin": True,
                    }
                ],
                "globalDefaults": {
                    "defaultSkillIds": [],
                    "defaultMcpServerIds": [],
                },
                "projectChatPolicies": {},
            }
        )

        migrated = load_skills_config(dbe)
        workspace_source = next(
            source
            for source in migrated.skillSources
            if source.id == WORKSPACE_SKILLS_SOURCE_ID
        )
        assert workspace_source.path == str(
            (setta_root / "skills").resolve(strict=False)
        )
