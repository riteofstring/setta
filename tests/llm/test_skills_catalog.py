from pathlib import Path

import pytest
from setta.database.db_objs import DBE
from setta.llm.capabilities_config import set_skill_sources
from setta.llm.skills_catalog import (
    delete_skills,
    get_skill_details,
    get_skills_catalog,
    import_skill_markdown,
    load_skill_prompt_blocks,
)
from setta.types.capabilities import SkillSource
from tests.utils.setta_paths import temporary_setta_paths


def _write_skill_doc(skill_dir: Path, contents: str) -> None:
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(contents, encoding="utf-8")


def test_skills_catalog_scans_multiple_sources_and_surfaces_parse_errors(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    source_a = tmp_path / "skills_source_a"
    source_b = tmp_path / "skills_source_b"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)
    source_a.mkdir(parents=True)
    source_b.mkdir(parents=True)

    _write_skill_doc(
        source_a / "lint-helper",
        """---
name: Lint Helper
description: Helps clean lint warnings
metadata:
  version: 1.0.0
---
Run lint checks and propose targeted fixes.
""",
    )
    _write_skill_doc(
        source_b / "broken-skill",
        """---
name: Broken Skill
This is invalid front matter
---
Body is present but front matter is malformed.
""",
    )
    _write_skill_doc(
        source_b / "cli-only",
        """---
name: CLI Only
description: Should not appear in Setta in-app skill catalog
metadata:
  version: 1.0.0
  settaInAppVisible: false
---
Used by external coding agents only.
""",
    )

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_root=setta_root,
    ):
        dbe = DBE(setta_root)
        set_skill_sources(
            dbe,
            [
                SkillSource(id="source_a", path=str(source_a), label="Source A"),
                SkillSource(id="source_b", path=str(source_b), label="Source B"),
            ],
        )

        catalog = get_skills_catalog(dbe)

        # The catalog should include entries from each configured source root.
        skill_ids = {entry.id for entry in catalog.skills}
        assert "source_a::lint-helper" in skill_ids
        assert "source_b::broken-skill" in skill_ids
        assert "source_b::cli-only" not in skill_ids

        valid_entry = next(
            entry for entry in catalog.skills if entry.id == "source_a::lint-helper"
        )
        assert valid_entry.parseError is None
        assert valid_entry.name == "Lint Helper"
        assert valid_entry.description == "Helps clean lint warnings"
        assert valid_entry.version == "1.0.0"

        invalid_entry = next(
            entry for entry in catalog.skills if entry.id == "source_b::broken-skill"
        )
        assert invalid_entry.parseError is not None
        assert "Invalid YAML front matter" in invalid_entry.parseError


def test_skill_details_and_prompt_blocks_include_content_and_fail_on_invalid_skills(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    source_root = tmp_path / "skills_source"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)
    source_root.mkdir(parents=True)

    _write_skill_doc(
        source_root / "planner",
        """---
name: Planner
description: Plan complex work
metadata:
  version: 2.1.0
---
Break work into explicit, ordered steps.
""",
    )
    _write_skill_doc(
        source_root / "invalid",
        """Missing front matter entirely.
This file should trigger a parse error.
""",
    )

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_root=setta_root,
    ):
        dbe = DBE(setta_root)
        set_skill_sources(
            dbe,
            [SkillSource(id="source", path=str(source_root), label="Source")],
        )

        details = get_skill_details(dbe, "source::planner")
        assert details.name == "Planner"
        assert details.parseError is None
        assert details.metadata == {
            "name": "Planner",
            "description": "Plan complex work",
            "metadata": {"version": "2.1.0"},
        }
        assert "Break work into explicit, ordered steps." in details.content

        prompt_blocks = load_skill_prompt_blocks(dbe, ["source::planner"])
        assert len(prompt_blocks) == 1
        assert prompt_blocks[0].startswith("### Planner (source::planner)")
        assert "Break work into explicit, ordered steps." in prompt_blocks[0]

        with pytest.raises(ValueError):
            # Invalid skill docs should not be injected into runtime prompts.
            load_skill_prompt_blocks(dbe, ["source::invalid"])

        with pytest.raises(KeyError):
            # Unknown ids should fail loudly instead of silently being ignored.
            load_skill_prompt_blocks(dbe, ["source::missing"])


def test_import_and_delete_skills_from_markdown(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_root=setta_root,
    ):
        dbe = DBE(setta_root)

        imported = import_skill_markdown(
            dbe,
            markdown="# Quick Skill\n\nDo this quickly.",
            slug="quick-skill",
        )
        assert imported.id.startswith("workspace_skills::quick-skill")
        assert (setta_root / "skills" / "quick-skill" / "SKILL.md").exists()
        details = get_skill_details(dbe, imported.id)
        assert details.parseError is None
        assert details.name == "Quick Skill"

        deleted_refs = delete_skills(dbe, [imported.id])
        assert deleted_refs == [imported.id]
        with pytest.raises(KeyError):
            get_skill_details(dbe, imported.id)


def test_delete_skills_rejects_builtin_sources(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    builtin_source = tmp_path / "builtin_skills"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)
    builtin_source.mkdir(parents=True)

    _write_skill_doc(
        builtin_source / "safe-skill",
        """---
name: Safe Skill
description: Protected from deletion
metadata:
  version: 1.0.0
---
Builtin skills should not be removable from the in-app catalog.
""",
    )

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_root=setta_root,
    ):
        dbe = DBE(setta_root)
        set_skill_sources(
            dbe,
            [
                SkillSource(
                    id="builtin_source",
                    path=str(builtin_source),
                    label="Builtin Source",
                    builtin=True,
                )
            ],
        )

        with pytest.raises(PermissionError):
            delete_skills(dbe, ["builtin_source::safe-skill"])


def test_delete_root_level_skill_only_removes_skill_doc(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"
    setta_root = workspace_root / "setta_files"
    source_root = tmp_path / "skills_source"
    workspace_root.mkdir(parents=True)
    setta_root.mkdir(parents=True)
    source_root.mkdir(parents=True)

    (source_root / "SKILL.md").write_text(
        """---
name: Root Skill
description: Defined at source root
metadata:
  version: 1.0.0
---
Root-level skill document.
""",
        encoding="utf-8",
    )
    _write_skill_doc(
        source_root / "nested",
        """---
name: Nested Skill
description: Should remain after root delete
metadata:
  version: 1.0.0
---
Nested skill document.
""",
    )

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_root=setta_root,
    ):
        dbe = DBE(setta_root)
        set_skill_sources(
            dbe,
            [SkillSource(id="source", path=str(source_root), label="Source")],
        )

        deleted_refs = delete_skills(dbe, ["source::."])
        assert deleted_refs == ["source::."]
        assert source_root.exists()
        assert not (source_root / "SKILL.md").exists()
        assert (source_root / "nested" / "SKILL.md").exists()

        remaining_ids = {entry.id for entry in get_skills_catalog(dbe).skills}
        assert "source::." not in remaining_ids
        assert "source::nested" in remaining_ids
