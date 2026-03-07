import inspect
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import setta.routers.app_gen_extensions as app_gen_extensions
from setta.routers.app_gen_extensions import (
    list_app_gen_skills,
    read_app_gen_skill_content,
    resolve_app_gen_skills_response,
    upsert_app_gen_custom_skill,
    router as app_gen_extensions_router,
)
from setta.types.routes import Route
from setta.utils.paths import clear_setta_paths_cache


def _raise_no_space_left_on_device(_fd: int) -> None:
    raise OSError("No space left on device")


class TestAppGenExtensionsRoutes:
    def test_route_handlers_are_sync_for_threadpool_fs_isolation(self) -> None:
        # Route handlers do heavy filesystem scans/reads and should remain sync
        # so FastAPI executes them off the event loop.
        assert (
            inspect.iscoroutinefunction(app_gen_extensions.route_get_app_gen_skills)
            is False
        )
        assert (
            inspect.iscoroutinefunction(
                app_gen_extensions.route_get_app_gen_skill_content
            )
            is False
        )
        assert (
            inspect.iscoroutinefunction(
                app_gen_extensions.route_upsert_app_gen_custom_skill
            )
            is False
        )

    def test_lists_workspace_skills(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "ui-layout"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(
                "# UI Layout\n\nCreate dense dashboard layouts.\n",
                encoding="utf-8",
            )

            # Keep user-level roots isolated for deterministic test behavior.
            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            rows = list_app_gen_skills(workspace_root)

            row_by_id = {row.skillId: row for row in rows}
            row = row_by_id["workspace_agents_skills::ui-layout"]
            assert row.skillId == "workspace_agents_skills::ui-layout"
            assert row.name == "ui-layout"
            assert row.isEditable is True
            assert row.editabilityReason is None
            assert row.description == "Create dense dashboard layouts."
            assert not hasattr(row, "skillPath")

    def test_marks_root_level_custom_skill_as_non_editable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            root_skills_dir = workspace_root / ".agents" / "skills"
            root_skills_dir.mkdir(parents=True, exist_ok=True)
            (root_skills_dir / "SKILL.md").write_text(
                "# Root Skill\n\nTop-level instructions.\n",
                encoding="utf-8",
            )

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            rows = list_app_gen_skills(workspace_root)

            row_by_id = {row.skillId: row for row in rows}
            row = row_by_id["workspace_agents_skills::."]
            assert row.relativePath == "."
            assert row.isEditable is False
            assert (
                row.editabilityReason == "Editing root-level SKILL.md is not supported."
            )

    def test_marks_existing_custom_skill_as_editable_when_skill_doc_is_read_only_but_directory_is_writable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "read-only"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# Read Only\n\nLocked.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
            skill_doc.chmod(0o444)

            try:
                rows = list_app_gen_skills(workspace_root)
            finally:
                skill_doc.chmod(0o644)

            row_by_id = {row.skillId: row for row in rows}
            row = row_by_id["workspace_agents_skills::read-only"]
            assert row.isEditable is True
            assert row.editabilityReason is None

    def test_marks_existing_custom_skill_as_non_editable_when_skill_directory_is_not_writable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "locked-dir"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# Locked Dir\n\nLocked.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
            skill_dir.chmod(0o555)

            try:
                rows = list_app_gen_skills(workspace_root)
            finally:
                skill_dir.chmod(0o755)

            row_by_id = {row.skillId: row for row in rows}
            row = row_by_id["workspace_agents_skills::locked-dir"]
            assert row.isEditable is False
            assert row.editabilityReason == "Skill directory is not writable."

    def test_lists_workspace_claude_and_opencode_skills(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            claude_skill_dir = workspace_root / ".claude" / "skills" / "prompt-review"
            claude_skill_dir.mkdir(parents=True, exist_ok=True)
            (claude_skill_dir / "SKILL.md").write_text(
                "# Prompt Review\n\nAudit prompts.\n",
                encoding="utf-8",
            )
            opencode_skill_dir = workspace_root / ".opencode" / "skills" / "code-plan"
            opencode_skill_dir.mkdir(parents=True, exist_ok=True)
            (opencode_skill_dir / "SKILL.md").write_text(
                "# Code Plan\n\nPlan implementation tasks.\n",
                encoding="utf-8",
            )

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            rows = list_app_gen_skills(workspace_root)
            row_by_id = {row.skillId: row for row in rows}

            claude_row = row_by_id["workspace_claude_skills::prompt-review"]
            assert claude_row.rootLabel == "Workspace .claude/skills"
            assert claude_row.rootPath == str(
                (workspace_root / ".claude" / "skills").resolve(strict=False)
            )

            opencode_row = row_by_id["workspace_opencode_skills::code-plan"]
            assert opencode_row.rootLabel == "Workspace .opencode/skills"
            assert opencode_row.rootPath == str(
                (workspace_root / ".opencode" / "skills").resolve(strict=False)
            )

    def test_lists_workspace_skills_when_description_file_is_invalid_utf8(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "broken-encoding"
            skill_dir.mkdir(parents=True, exist_ok=True)
            # Invalid UTF-8 payload should not fail the entire skill listing route.
            (skill_dir / "SKILL.md").write_bytes(b"\xff\xfe\xfd")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            rows = list_app_gen_skills(workspace_root)

            row_by_id = {row.skillId: row for row in rows}
            row = row_by_id["workspace_agents_skills::broken-encoding"]
            assert row.skillId == "workspace_agents_skills::broken-encoding"
            assert row.description == ""

    def test_reads_skill_content_by_skill_id(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "prompting"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(
                "# Prompting\n\nUse concise constraints.\n",
                encoding="utf-8",
            )

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            content = read_app_gen_skill_content(
                workspace_root=workspace_root,
                skill_id="workspace_agents_skills::prompting",
            )

            assert content.skillId == "workspace_agents_skills::prompting"
            assert "Use concise constraints." in content.content
            assert content.truncated is False
            assert content.originalSizeBytes > 0

    def test_rejects_path_traversal(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            (workspace_root / ".agents" / "skills").mkdir(parents=True, exist_ok=True)

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            with pytest.raises(ValueError):
                read_app_gen_skill_content(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::../outside",
                )

    def test_lists_user_claude_and_user_opencode_skills(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)

            user_claude_skill_dir = fake_home / ".claude" / "skills" / "handoff"
            user_claude_skill_dir.mkdir(parents=True, exist_ok=True)
            (user_claude_skill_dir / "SKILL.md").write_text(
                "# Handoff\n\nSummarize context.\n",
                encoding="utf-8",
            )
            xdg_config_home = workspace_root / "xdg-config"
            user_opencode_skill_dir = (
                xdg_config_home / "opencode" / "skills" / "plan-generator"
            )
            user_opencode_skill_dir.mkdir(parents=True, exist_ok=True)
            (user_opencode_skill_dir / "SKILL.md").write_text(
                "# Plan Generator\n\nGenerate implementation plans.\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("XDG_CONFIG_HOME", str(xdg_config_home))

            rows = list_app_gen_skills(workspace_root)
            row_by_id = {row.skillId: row for row in rows}

            claude_row = row_by_id["user_claude_skills::handoff"]
            assert claude_row.rootLabel == "User ~/.claude/skills"
            assert claude_row.rootPath == str(
                (fake_home / ".claude" / "skills").resolve(strict=False)
            )

            opencode_row = row_by_id["user_opencode_skills::plan-generator"]
            assert (
                opencode_row.rootLabel
                == "User ${XDG_CONFIG_HOME:-~/.config}/opencode/skills"
            )
            assert opencode_row.rootPath == str(
                (xdg_config_home / "opencode" / "skills").resolve(strict=False)
            )

    def test_lists_skills_from_env_home_roots(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            # Verify we pick up AGENTS_HOME/skills when it is outside Path.home().
            agents_home = workspace_root / "agents-home"
            agents_skill_dir = agents_home / "skills" / "release-checklist"
            agents_skill_dir.mkdir(parents=True, exist_ok=True)
            (agents_skill_dir / "SKILL.md").write_text(
                "# Release Checklist\n\nShip safely.\n",
                encoding="utf-8",
            )

            # Verify we pick up CODEX_HOME/skills as well.
            codex_home = workspace_root / "codex-home"
            codex_skill_dir = codex_home / "skills" / "qa-review"
            codex_skill_dir.mkdir(parents=True, exist_ok=True)
            (codex_skill_dir / "SKILL.md").write_text(
                "# QA Review\n\nRun focused checks.\n",
                encoding="utf-8",
            )

            monkeypatch.setenv("AGENTS_HOME", str(agents_home))
            monkeypatch.setenv("CODEX_HOME", str(codex_home))

            rows = list_app_gen_skills(workspace_root)
            row_by_id = {row.skillId: row for row in rows}

            agents_row = row_by_id["agents_home_skills::release-checklist"]
            assert agents_row.rootLabel == "AGENTS_HOME skills"
            assert agents_row.rootPath == str(
                (agents_home / "skills").resolve(strict=False)
            )

            codex_row = row_by_id["codex_home_skills::qa-review"]
            assert codex_row.rootLabel == "CODEX_HOME skills"
            assert codex_row.rootPath == str(
                (codex_home / "skills").resolve(strict=False)
            )
            assert codex_row.isEditable is False
            assert (
                codex_row.editabilityReason
                == "Only skills under AGENTS_HOME/skills, ~/.agents/skills, or workspace .agents/skills are editable."
            )

    def test_skips_unreadable_skill_root_during_listing(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # Unreadable roots (e.g. /etc/codex/skills without permission)
            # should be skipped rather than failing the entire listing.
            workspace_root = Path(tmpdir)
            readable_root = workspace_root / ".agents" / "skills"
            readable_skill_dir = readable_root / "readable-skill"
            readable_skill_dir.mkdir(parents=True, exist_ok=True)
            (readable_skill_dir / "SKILL.md").write_text(
                "# Readable Skill\n\nVisible.\n",
                encoding="utf-8",
            )
            blocked_root = workspace_root / "blocked-root"

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            monkeypatch.setattr(
                app_gen_extensions,
                "iter_skill_roots",
                lambda _: [
                    ("blocked_root", "Blocked root", blocked_root),
                    (
                        "workspace_agents_skills",
                        "Workspace .agents/skills",
                        readable_root,
                    ),
                ],
            )

            original_exists = Path.exists
            original_is_dir = Path.is_dir

            def patched_exists(path: Path) -> bool:
                if path == blocked_root:
                    raise PermissionError("Permission denied")
                return original_exists(path)

            def patched_is_dir(path: Path) -> bool:
                if path == blocked_root:
                    raise PermissionError("Permission denied")
                return original_is_dir(path)

            monkeypatch.setattr(Path, "exists", patched_exists)
            monkeypatch.setattr(Path, "is_dir", patched_is_dir)

            rows = list_app_gen_skills(workspace_root)
            row_by_id = {row.skillId: row for row in rows}
            assert "blocked_root::." not in row_by_id
            assert "workspace_agents_skills::readable-skill" in row_by_id

    def test_skips_ignored_directories_during_walk(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            root_skills = workspace_root / ".agents" / "skills"
            kept_skill_dir = root_skills / "kept"
            ignored_skill_dir = root_skills / "node_modules" / "ignored"
            kept_skill_dir.mkdir(parents=True, exist_ok=True)
            ignored_skill_dir.mkdir(parents=True, exist_ok=True)
            (kept_skill_dir / "SKILL.md").write_text(
                "# Kept\n\nVisible skill.\n",
                encoding="utf-8",
            )
            (ignored_skill_dir / "SKILL.md").write_text(
                "# Ignored\n\nShould not be listed.\n",
                encoding="utf-8",
            )

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            walked_after_prune: list[str] = []
            original_os_walk = os.walk
            resolved_root_skills = root_skills.resolve(strict=False)

            def fake_walk(path: Path, topdown: bool = True):
                if Path(path).resolve(strict=False) != resolved_root_skills:
                    yield from original_os_walk(path, topdown=topdown)
                    return
                dirnames = ["node_modules", "kept"]
                yield (str(resolved_root_skills), dirnames, [])
                walked_after_prune.extend(dirnames)
                for dirname in dirnames:
                    skill_dir = resolved_root_skills / dirname
                    yield (str(skill_dir), [], ["SKILL.md"])

            monkeypatch.setattr(app_gen_extensions.os, "walk", fake_walk)

            rows = list_app_gen_skills(workspace_root)

            assert walked_after_prune == ["kept"]
            skill_ids = {row.skillId for row in rows}
            assert "workspace_agents_skills::kept" in skill_ids
            assert "workspace_agents_skills::node_modules/ignored" not in skill_ids

    def test_lists_skills_without_path_read_text_for_description(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "streamed-description"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(
                "# Streamed Description\n\nRead only first useful line.\nMore content.\n",
                encoding="utf-8",
            )

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            def fail_read_text(*_: object, **__: object) -> str:
                raise AssertionError(
                    "Path.read_text should not be used for descriptions"
                )

            monkeypatch.setattr(Path, "read_text", fail_read_text)

            rows = list_app_gen_skills(workspace_root)

            row_by_id = {row.skillId: row for row in rows}
            assert (
                row_by_id["workspace_agents_skills::streamed-description"].description
                == "Read only first useful line."
            )

    def test_truncates_large_skill_content_with_metadata(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "large-doc"
            skill_dir.mkdir(parents=True, exist_ok=True)
            oversized_content = "A" * (
                app_gen_extensions._MAX_SKILL_CONTENT_PREVIEW_BYTES + 5000
            )
            (skill_dir / "SKILL.md").write_text(oversized_content, encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            content = read_app_gen_skill_content(
                workspace_root=workspace_root,
                skill_id="workspace_agents_skills::large-doc",
            )

            assert content.skillId == "workspace_agents_skills::large-doc"
            assert content.truncated is True
            assert content.originalSizeBytes == len(oversized_content)
            assert (
                len(content.content)
                == app_gen_extensions._MAX_SKILL_CONTENT_PREVIEW_BYTES
            )

    def test_read_skill_content_raises_valueerror_when_exists_check_is_denied(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # Permission failures while probing SKILL.md existence should map to
            # a controlled ValueError path.
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "permission-denied"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(
                "# Permission Denied\n\nBody.\n",
                encoding="utf-8",
            )

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            denied_skill_doc = skill_dir / "SKILL.md"
            original_exists = Path.exists

            def patched_exists(path: Path) -> bool:
                if path.resolve(strict=False) == denied_skill_doc.resolve(strict=False):
                    raise PermissionError("Permission denied")
                return original_exists(path)

            monkeypatch.setattr(Path, "exists", patched_exists)

            with pytest.raises(ValueError, match="Permission denied"):
                read_app_gen_skill_content(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::permission-denied",
                )

    def test_creates_custom_skill_in_user_agents_root_when_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            response = upsert_app_gen_custom_skill(
                workspace_root=workspace_root,
                skill_id=None,
                relative_path="my-custom-skill",
                content="# my-custom-skill\n\nBody.\n",
            )

            expected_skill_doc = (
                fake_home / ".agents" / "skills" / "my-custom-skill" / "SKILL.md"
            )
            assert response.skillId == "user_agents_skills::my-custom-skill"
            assert response.created is True
            assert response.rootPath == str(
                (fake_home / ".agents" / "skills").resolve(strict=False)
            )
            assert response.skillDocPath == str(
                expected_skill_doc.resolve(strict=False)
            )
            assert response.skill.skillId == "user_agents_skills::my-custom-skill"
            assert response.skill.relativePath == "my-custom-skill"
            assert response.skill.isEditable is True
            assert (
                response.skillContent.skillId == "user_agents_skills::my-custom-skill"
            )
            assert response.skillContent.content == "# my-custom-skill\n\nBody.\n"
            assert response.skillContent.truncated is False
            assert (
                expected_skill_doc.read_text(encoding="utf-8")
                == "# my-custom-skill\n\nBody.\n"
            )

    def test_create_custom_skill_rejects_name_collisions_without_overwrite(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            existing_skill_doc = (
                fake_home / ".agents" / "skills" / "existing" / "SKILL.md"
            )
            existing_skill_doc.parent.mkdir(parents=True, exist_ok=True)
            existing_skill_doc.write_text(
                "# existing\n\nOriginal content.\n",
                encoding="utf-8",
            )

            with pytest.raises(
                ValueError,
                match="Custom skill already exists for relativePath 'existing'.",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id=None,
                    relative_path="existing",
                    content="# existing\n\nOverwritten unexpectedly.\n",
                )

            assert (
                existing_skill_doc.read_text(encoding="utf-8")
                == "# existing\n\nOriginal content.\n"
            )

    def test_create_custom_skill_removes_partial_outputs_when_temp_write_fails(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            expected_skill_doc = (
                fake_home / ".agents" / "skills" / "failed-create" / "SKILL.md"
            )

            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
            monkeypatch.setattr(
                app_gen_extensions.os,
                "fsync",
                _raise_no_space_left_on_device,
            )

            with pytest.raises(ValueError, match="No space left on device"):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id=None,
                    relative_path="failed-create",
                    content="# failed-create\n\nBody.\n",
                )

            assert expected_skill_doc.exists() is False
            assert expected_skill_doc.parent.exists() is False

    def test_create_custom_skill_uses_prioritized_root_even_when_agents_home_aliases_workspace(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            agents_home = workspace_root / ".agents"

            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.setenv("AGENTS_HOME", str(agents_home))
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            response = upsert_app_gen_custom_skill(
                workspace_root=workspace_root,
                skill_id=None,
                relative_path="priority-check",
                content="# priority-check\n\nBody.\n",
            )

            expected_workspace_skill_doc = (
                workspace_root / ".agents" / "skills" / "priority-check" / "SKILL.md"
            )
            home_skill_doc = (
                fake_home / ".agents" / "skills" / "priority-check" / "SKILL.md"
            )
            assert response.skillId == "workspace_agents_skills::priority-check"
            assert response.rootPath == str(
                (workspace_root / ".agents" / "skills").resolve(strict=False)
            )
            assert response.skillDocPath == str(
                expected_workspace_skill_doc.resolve(strict=False)
            )
            assert response.skill.skillId == "workspace_agents_skills::priority-check"
            assert response.skill.rootPath == str(
                (workspace_root / ".agents" / "skills").resolve(strict=False)
            )
            assert response.skillContent.content == "# priority-check\n\nBody.\n"
            assert expected_workspace_skill_doc.exists() is True
            assert home_skill_doc.exists() is False

    def test_resolve_app_gen_skills_response_uses_authoritative_create_root(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            workspace_skill_doc = (
                workspace_root / ".agents" / "skills" / "workspace-only" / "SKILL.md"
            )
            workspace_skill_doc.parent.mkdir(parents=True, exist_ok=True)
            workspace_skill_doc.write_text(
                "# workspace-only\n\nWorkspace custom skill.\n",
                encoding="utf-8",
            )

            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
            expected_create_root = fake_home / ".agents" / "skills"

            assert expected_create_root.exists() is False

            response = resolve_app_gen_skills_response(workspace_root)

            assert response.customSkillCreateRootPath == str(
                expected_create_root.resolve(strict=False)
            )
            assert response.customSkillCreateRootActionable is False
            assert [skill.skillId for skill in response.skills] == [
                "workspace_agents_skills::workspace-only"
            ]
            assert expected_create_root.exists() is False

    def test_resolve_app_gen_skills_response_does_not_probe_writes(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            original_open = Path.open

            def fail_mkdir(path: Path, *_args: object, **_kwargs: object) -> None:
                raise AssertionError(
                    f"resolve_app_gen_skills_response must not mkdir {path}"
                )

            def fail_open(
                path: Path,
                mode: str = "r",
                *args: object,
                **kwargs: object,
            ):
                if any(flag in mode for flag in ("w", "a", "x", "+")):
                    raise AssertionError(
                        f"resolve_app_gen_skills_response must not open {path} with mode {mode}"
                    )
                return original_open(path, mode, *args, **kwargs)

            monkeypatch.setattr(Path, "mkdir", fail_mkdir)
            monkeypatch.setattr(Path, "open", fail_open)

            response = resolve_app_gen_skills_response(workspace_root)

            assert response.customSkillCreateRootPath == str(
                (fake_home / ".agents" / "skills").resolve(strict=False)
            )
            assert response.customSkillCreateRootActionable is False

    def test_resolve_app_gen_skills_response_matches_create_root_when_higher_priority_root_is_unwritable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            user_skills_root = fake_home / ".agents" / "skills"
            user_skills_root.mkdir(parents=True, exist_ok=True)
            agents_home = Path(tmpdir) / "agents-home"
            agents_skills_root = agents_home / "skills"
            agents_skills_root.mkdir(parents=True, exist_ok=True)
            agents_skills_root.chmod(0o500)

            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.setenv("AGENTS_HOME", str(agents_home))
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            try:
                response = resolve_app_gen_skills_response(workspace_root)
                create_response = upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id=None,
                    relative_path="authoritative-root-check",
                    content="# authoritative-root-check\n\nBody.\n",
                )
            finally:
                agents_skills_root.chmod(0o700)

            assert response.customSkillCreateRootPath == create_response.rootPath
            assert response.customSkillCreateRootPath == str(
                user_skills_root.resolve(strict=False)
            )
            assert response.customSkillCreateRootActionable is True

    def test_updates_existing_workspace_custom_skill_by_skill_id(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "editable"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            response = upsert_app_gen_custom_skill(
                workspace_root=workspace_root,
                skill_id="workspace_agents_skills::editable",
                relative_path=None,
                content="# editable\n\nUpdated.\n",
            )

            assert response.skillId == "workspace_agents_skills::editable"
            assert response.created is False
            assert response.skill.skillId == "workspace_agents_skills::editable"
            assert response.skillContent.content == "# editable\n\nUpdated.\n"
            assert skill_doc.read_text(encoding="utf-8") == "# editable\n\nUpdated.\n"

    def test_updates_existing_workspace_custom_skill_when_skill_doc_is_read_only(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "editable"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
            skill_doc.chmod(0o444)

            try:
                response = upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::editable",
                    relative_path=None,
                    content="# editable\n\nUpdated.\n",
                )
            finally:
                if skill_doc.exists():
                    skill_doc.chmod(0o644)

            assert response.skillId == "workspace_agents_skills::editable"
            assert response.created is False
            assert response.skill.isEditable is True
            assert response.skillContent.content == "# editable\n\nUpdated.\n"
            assert skill_doc.read_text(encoding="utf-8") == "# editable\n\nUpdated.\n"

    def test_update_custom_skill_preserves_existing_content_when_temp_write_fails(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "editable"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            original_content = "# editable\n\nInitial.\n"
            skill_doc.write_text(original_content, encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
            monkeypatch.setattr(
                app_gen_extensions.os,
                "fsync",
                _raise_no_space_left_on_device,
            )

            with pytest.raises(ValueError, match="No space left on device"):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::editable",
                    relative_path=None,
                    content="# editable\n\nUpdated.\n",
                )

            assert skill_doc.read_text(encoding="utf-8") == original_content
            assert [path.name for path in skill_dir.iterdir()] == ["SKILL.md"]

    def test_update_custom_skill_by_skill_id_fails_when_target_disappears_before_open(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "editable"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            original_write_existing = (
                app_gen_extensions._write_existing_custom_skill_doc
            )

            def delete_before_update_open(
                *,
                skill_doc: Path,
                skill_id: str,
                content: str,
            ) -> None:
                # Simulate the target disappearing after validation but before the
                # non-creating update open executes.
                skill_doc.unlink()
                original_write_existing(
                    skill_doc=skill_doc,
                    skill_id=skill_id,
                    content=content,
                )

            monkeypatch.setattr(
                app_gen_extensions,
                "_write_existing_custom_skill_doc",
                delete_before_update_open,
            )

            with pytest.raises(
                KeyError,
                match="Missing SKILL.md for workspace_agents_skills::editable",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::editable",
                    relative_path=None,
                    content="# editable\n\nUpdated.\n",
                )

            assert skill_doc.exists() is False
            assert skill_dir.exists() is True

    def test_create_custom_skill_fails_when_target_appears_before_open_without_overwrite(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)

            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            skill_doc = fake_home / ".agents" / "skills" / "racy-create" / "SKILL.md"
            winning_content = "# racy-create\n\nCreated by another writer.\n"
            original_write_new = app_gen_extensions._write_new_custom_skill_doc

            def create_before_exclusive_open(
                *,
                skill_doc: Path,
                relative_path: str,
                content: str,
            ) -> None:
                # Simulate another process winning the create race immediately
                # before the exclusive open runs.
                skill_doc.parent.mkdir(parents=True, exist_ok=True)
                skill_doc.write_text(winning_content, encoding="utf-8")
                original_write_new(
                    skill_doc=skill_doc,
                    relative_path=relative_path,
                    content=content,
                )

            monkeypatch.setattr(
                app_gen_extensions,
                "_write_new_custom_skill_doc",
                create_before_exclusive_open,
            )

            with pytest.raises(
                ValueError,
                match="Custom skill already exists for relativePath 'racy-create'.",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id=None,
                    relative_path="racy-create",
                    content="# racy-create\n\nUnexpected overwrite.\n",
                )

            assert skill_doc.read_text(encoding="utf-8") == winning_content

    def test_rejects_skill_id_target_when_skill_is_not_discoverable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            workspace_skills = workspace_root / ".agents" / "skills"
            workspace_skills.mkdir(parents=True, exist_ok=True)

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            target_skill_doc = workspace_skills / ".hidden" / "nested" / "SKILL.md"
            with pytest.raises(
                KeyError,
                match="Unknown or non-discoverable skillId: workspace_agents_skills::.hidden/nested",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::.hidden/nested",
                    relative_path=None,
                    content="# nested\n\nCreated unexpectedly.\n",
                )

            assert target_skill_doc.exists() is False

    def test_rejects_hidden_skill_id_targets_even_when_skill_doc_exists(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            hidden_skill_doc = (
                workspace_root / ".agents" / "skills" / ".git" / "hooks" / "SKILL.md"
            )
            hidden_skill_doc.parent.mkdir(parents=True, exist_ok=True)
            hidden_skill_doc.write_text("# hidden\n\nOriginal.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            skill_ids = {row.skillId for row in list_app_gen_skills(workspace_root)}
            assert "workspace_agents_skills::.git/hooks" not in skill_ids

            with pytest.raises(
                KeyError,
                match="Unknown or non-discoverable skillId: workspace_agents_skills::.git/hooks",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::.git/hooks",
                    relative_path=None,
                    content="# hidden\n\nUnexpected overwrite.\n",
                )

            assert (
                hidden_skill_doc.read_text(encoding="utf-8")
                == "# hidden\n\nOriginal.\n"
            )

    def test_updates_skill_id_target_when_agents_home_root_is_unwritable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # Updating by explicit skillId should not depend on default root writability.
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "editable"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            agents_home = workspace_root / "agents-home"
            agents_skills_root = agents_home / "skills"
            agents_skills_root.mkdir(parents=True, exist_ok=True)
            agents_skills_root.chmod(0o500)

            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.setenv("AGENTS_HOME", str(agents_home))
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            try:
                response = upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::editable",
                    relative_path=None,
                    content="# editable\n\nUpdated.\n",
                )
            finally:
                agents_skills_root.chmod(0o700)

            assert response.skillId == "workspace_agents_skills::editable"
            assert response.created is False
            assert response.skill.skillId == "workspace_agents_skills::editable"
            assert response.skillContent.content == "# editable\n\nUpdated.\n"
            assert skill_doc.read_text(encoding="utf-8") == "# editable\n\nUpdated.\n"

    def test_creates_custom_skill_in_next_writable_priority_root(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # Create should skip non-writable AGENTS_HOME and fall back to the next
            # writable root in configured priority order.
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            user_skills_root = fake_home / ".agents" / "skills"
            user_skills_root.mkdir(parents=True, exist_ok=True)
            agents_home = Path(tmpdir) / "agents-home"
            agents_skills_root = agents_home / "skills"
            agents_skills_root.mkdir(parents=True, exist_ok=True)
            agents_skills_root.chmod(0o500)

            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.setenv("AGENTS_HOME", str(agents_home))
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            try:
                response = upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id=None,
                    relative_path="writable-fallback",
                    content="# writable-fallback\n\nBody.\n",
                )
            finally:
                agents_skills_root.chmod(0o700)

            expected_skill_doc = user_skills_root / "writable-fallback" / "SKILL.md"
            assert response.skillId == "user_agents_skills::writable-fallback"
            assert response.created is True
            assert response.skillDocPath == str(
                expected_skill_doc.resolve(strict=False)
            )
            assert response.skill.skillId == "user_agents_skills::writable-fallback"
            assert response.skillContent.content == "# writable-fallback\n\nBody.\n"
            assert (
                expected_skill_doc.read_text(encoding="utf-8")
                == "# writable-fallback\n\nBody.\n"
            )

    def test_create_custom_skill_fails_when_no_writable_root_exists(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # If all editable roots are non-writable, create should fail with a
            # deterministic client-facing error message.
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            workspace_skills_root = workspace_root / ".agents" / "skills"
            workspace_skills_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            user_skills_root = fake_home / ".agents" / "skills"
            user_skills_root.mkdir(parents=True, exist_ok=True)
            agents_home = Path(tmpdir) / "agents-home"
            agents_skills_root = agents_home / "skills"
            agents_skills_root.mkdir(parents=True, exist_ok=True)

            workspace_skills_root.chmod(0o500)
            user_skills_root.chmod(0o500)
            agents_skills_root.chmod(0o500)

            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.setenv("AGENTS_HOME", str(agents_home))
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            try:
                with pytest.raises(
                    ValueError,
                    match="No writable custom skill root available",
                ):
                    upsert_app_gen_custom_skill(
                        workspace_root=workspace_root,
                        skill_id=None,
                        relative_path="no-writable-root",
                        content="# no-writable-root\n\nBody.\n",
                    )
            finally:
                workspace_skills_root.chmod(0o700)
                user_skills_root.chmod(0o700)
                agents_skills_root.chmod(0o700)

    def test_rejects_updates_for_non_custom_skill_root(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            codex_home = workspace_root / "codex-home"
            skill_dir = codex_home / "skills" / "read-only-skill"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text("# read-only\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            with pytest.raises(
                ValueError,
                match="Only skills under AGENTS_HOME/skills, ~/.agents/skills, or workspace .agents/skills are editable.",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="codex_home_skills::read-only-skill",
                    relative_path=None,
                    content="# read-only\n\nUpdated.\n",
                )

    def test_rejects_updates_when_existing_custom_skill_directory_is_no_longer_writable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "read-only"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# read-only\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
            skill_dir.chmod(0o555)

            try:
                with pytest.raises(
                    ValueError,
                    match="Skill directory is not writable.",
                ):
                    upsert_app_gen_custom_skill(
                        workspace_root=workspace_root,
                        skill_id="workspace_agents_skills::read-only",
                        relative_path=None,
                        content="# read-only\n\nUpdated.\n",
                    )
            finally:
                skill_dir.chmod(0o755)

    def test_skill_content_route_returns_plain_keyerror_detail(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_agents_skills_root = workspace_root / ".agents" / "skills"
        workspace_agents_skills_root.mkdir(parents=True, exist_ok=True)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILL_CONTENT.value}",
                json={"skillId": "workspace_agents_skills::missing-skill"},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == (
            "Missing SKILL.md for workspace_agents_skills::missing-skill"
        )
        clear_setta_paths_cache()

    def test_skill_content_route_returns_400_for_permission_error(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Route surface should return a client error instead of a 500 when
        # permission checks fail on skill doc reads.
        workspace_root = tmp_path / "workspace"
        skill_dir = workspace_root / ".agents" / "skills" / "blocked"
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_doc = skill_dir / "SKILL.md"
        skill_doc.write_text("# blocked\n", encoding="utf-8")
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        clear_setta_paths_cache()

        original_exists = Path.exists

        def patched_exists(path: Path) -> bool:
            if path.resolve(strict=False) == skill_doc.resolve(strict=False):
                raise PermissionError("Permission denied")
            return original_exists(path)

        monkeypatch.setattr(Path, "exists", patched_exists)

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILL_CONTENT.value}",
                json={"skillId": "workspace_agents_skills::blocked"},
            )

        assert response.status_code == 400
        assert "Permission denied" in response.json()["detail"]
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_creates_skill(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": None,
                    "relativePath": "route-created",
                    "content": "# route-created\n\nBody.\n",
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["skillId"] == "user_agents_skills::route-created"
        assert payload["created"] is True
        expected_skill_doc = (
            fake_home / ".agents" / "skills" / "route-created" / "SKILL.md"
        )
        assert payload["skillDocPath"] == str(expected_skill_doc)
        assert payload["skill"]["skillId"] == "user_agents_skills::route-created"
        assert payload["skill"]["relativePath"] == "route-created"
        assert payload["skillContent"]["content"] == "# route-created\n\nBody.\n"
        assert (
            expected_skill_doc.read_text(encoding="utf-8")
            == "# route-created\n\nBody.\n"
        )
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_rejects_create_collisions_without_overwrite(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        existing_skill_doc = fake_home / ".agents" / "skills" / "existing" / "SKILL.md"
        existing_skill_doc.parent.mkdir(parents=True, exist_ok=True)
        existing_skill_doc.write_text("# existing\n\nOriginal.\n", encoding="utf-8")

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": None,
                    "relativePath": "existing",
                    "content": "# existing\n\nUnexpected overwrite.\n",
                },
            )

        assert response.status_code == 400
        assert (
            "Custom skill already exists for relativePath 'existing'."
            in (response.json()["detail"])
        )
        assert (
            existing_skill_doc.read_text(encoding="utf-8")
            == "# existing\n\nOriginal.\n"
        )
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_returns_400_and_no_skill_doc_when_create_temp_write_fails(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        expected_skill_doc = (
            fake_home / ".agents" / "skills" / "route-failed-create" / "SKILL.md"
        )

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        monkeypatch.setattr(
            app_gen_extensions.os,
            "fsync",
            _raise_no_space_left_on_device,
        )
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": None,
                    "relativePath": "route-failed-create",
                    "content": "# route-failed-create\n\nBody.\n",
                },
            )

        assert response.status_code == 400
        assert "No space left on device" in response.json()["detail"]
        assert expected_skill_doc.exists() is False
        assert expected_skill_doc.parent.exists() is False
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_rejects_late_create_collisions_without_overwrite(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        skill_doc = fake_home / ".agents" / "skills" / "racy-create" / "SKILL.md"
        winning_content = "# racy-create\n\nCreated by another writer.\n"

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        original_write_new = app_gen_extensions._write_new_custom_skill_doc

        def create_before_exclusive_open(
            *,
            skill_doc: Path,
            relative_path: str,
            content: str,
        ) -> None:
            # Simulate another writer creating the file after validation but
            # before the route reaches the exclusive create open.
            skill_doc.parent.mkdir(parents=True, exist_ok=True)
            skill_doc.write_text(winning_content, encoding="utf-8")
            original_write_new(
                skill_doc=skill_doc,
                relative_path=relative_path,
                content=content,
            )

        monkeypatch.setattr(
            app_gen_extensions,
            "_write_new_custom_skill_doc",
            create_before_exclusive_open,
        )

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": None,
                    "relativePath": "racy-create",
                    "content": "# racy-create\n\nUnexpected overwrite.\n",
                },
            )

        assert response.status_code == 400
        assert (
            "Custom skill already exists for relativePath 'racy-create'."
            in response.json()["detail"]
        )
        assert skill_doc.read_text(encoding="utf-8") == winning_content
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_returns_400_and_preserves_existing_content_when_update_temp_write_fails(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        skill_doc = workspace_root / ".agents" / "skills" / "editable" / "SKILL.md"
        skill_doc.parent.mkdir(parents=True, exist_ok=True)
        original_content = "# editable\n\nInitial.\n"
        skill_doc.write_text(original_content, encoding="utf-8")

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        monkeypatch.setattr(
            app_gen_extensions.os,
            "fsync",
            _raise_no_space_left_on_device,
        )
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": "workspace_agents_skills::editable",
                    "relativePath": None,
                    "content": "# editable\n\nUpdated.\n",
                },
            )

        assert response.status_code == 400
        assert "No space left on device" in response.json()["detail"]
        assert skill_doc.read_text(encoding="utf-8") == original_content
        assert [path.name for path in skill_doc.parent.iterdir()] == ["SKILL.md"]
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_returns_missing_when_update_target_disappears_before_open(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        skill_doc = workspace_root / ".agents" / "skills" / "editable" / "SKILL.md"
        skill_doc.parent.mkdir(parents=True, exist_ok=True)
        skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        original_write_existing = app_gen_extensions._write_existing_custom_skill_doc

        def delete_before_update_open(
            *,
            skill_doc: Path,
            skill_id: str,
            content: str,
        ) -> None:
            # Simulate the selected target being deleted after validation but
            # before the route performs the non-creating update open.
            skill_doc.unlink()
            original_write_existing(
                skill_doc=skill_doc,
                skill_id=skill_id,
                content=content,
            )

        monkeypatch.setattr(
            app_gen_extensions,
            "_write_existing_custom_skill_doc",
            delete_before_update_open,
        )

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": "workspace_agents_skills::editable",
                    "relativePath": None,
                    "content": "# editable\n\nUpdated.\n",
                },
            )

        assert response.status_code == 404
        assert (
            response.json()["detail"]
            == "Missing SKILL.md for workspace_agents_skills::editable"
        )
        assert skill_doc.exists() is False
        assert skill_doc.parent.exists() is True
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_uses_workspace_root_when_agents_home_aliases_workspace(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        agents_home = workspace_root / ".agents"

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.setenv("AGENTS_HOME", str(agents_home))
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": None,
                    "relativePath": "priority-check",
                    "content": "# priority-check\n\nBody.\n",
                },
            )

        assert response.status_code == 200
        payload = response.json()
        workspace_skill_doc = (
            workspace_root / ".agents" / "skills" / "priority-check" / "SKILL.md"
        )
        home_skill_doc = (
            fake_home / ".agents" / "skills" / "priority-check" / "SKILL.md"
        )
        assert payload["skillId"] == "workspace_agents_skills::priority-check"
        assert payload["rootPath"] == str(
            (workspace_root / ".agents" / "skills").resolve(strict=False)
        )
        assert payload["skillDocPath"] == str(workspace_skill_doc.resolve(strict=False))
        assert payload["skill"]["skillId"] == "workspace_agents_skills::priority-check"
        assert payload["skillContent"]["content"] == "# priority-check\n\nBody.\n"
        assert workspace_skill_doc.exists() is True
        assert home_skill_doc.exists() is False
        clear_setta_paths_cache()

    def test_get_app_gen_skills_route_exposes_editability_flags(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_skills = workspace_root / ".agents" / "skills"
        editable_dir = workspace_skills / "editable"
        editable_dir.mkdir(parents=True, exist_ok=True)
        workspace_skills.mkdir(parents=True, exist_ok=True)
        (workspace_skills / "SKILL.md").write_text(
            "# Root Skill\n\nRoot instructions.\n",
            encoding="utf-8",
        )
        (editable_dir / "SKILL.md").write_text(
            "# Editable\n\nNested skill.\n",
            encoding="utf-8",
        )
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        try:
            with TestClient(app) as client:
                response = client.get(
                    f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILLS.value}"
                )
        finally:
            clear_setta_paths_cache()

        assert response.status_code == 200
        payload = response.json()
        assert payload["customSkillCreateRootPath"] == str(
            (fake_home / ".agents" / "skills").resolve(strict=False)
        )
        assert payload["customSkillCreateRootActionable"] is False
        assert (fake_home / ".agents" / "skills").exists() is False
        row_by_id = {row["skillId"]: row for row in payload["skills"]}
        root_row = row_by_id["workspace_agents_skills::."]
        assert root_row["isEditable"] is False
        assert (
            root_row["editabilityReason"]
            == "Editing root-level SKILL.md is not supported."
        )
        editable_row = row_by_id["workspace_agents_skills::editable"]
        assert editable_row["isEditable"] is True
        assert editable_row["editabilityReason"] is None

    def test_get_app_gen_skills_and_upsert_route_reject_non_writable_skill_directory(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        skill_dir = workspace_root / ".agents" / "skills" / "read-only"
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_doc = skill_dir / "SKILL.md"
        skill_doc.write_text("# read-only\n", encoding="utf-8")
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()
        skill_dir.chmod(0o555)

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        try:
            with TestClient(app) as client:
                get_response = client.get(
                    f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILLS.value}"
                )
                post_response = client.post(
                    f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                    json={
                        "skillId": "workspace_agents_skills::read-only",
                        "relativePath": None,
                        "content": "# read-only\n\nUpdated.\n",
                    },
                )
        finally:
            skill_dir.chmod(0o755)
            clear_setta_paths_cache()

        assert get_response.status_code == 200
        payload = get_response.json()
        row_by_id = {row["skillId"]: row for row in payload["skills"]}
        read_only_row = row_by_id["workspace_agents_skills::read-only"]
        assert read_only_row["isEditable"] is False
        assert read_only_row["editabilityReason"] == "Skill directory is not writable."
        assert post_response.status_code == 400
        assert post_response.json()["detail"] == "Skill directory is not writable."
        assert skill_doc.read_text(encoding="utf-8") == "# read-only\n"

    def test_get_app_gen_skills_and_upsert_route_treat_read_only_skill_doc_as_editable(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        skill_dir = workspace_root / ".agents" / "skills" / "editable"
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_doc = skill_dir / "SKILL.md"
        skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")
        skill_doc.chmod(0o444)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        try:
            with TestClient(app) as client:
                get_response = client.get(
                    f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILLS.value}"
                )
                post_response = client.post(
                    f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                    json={
                        "skillId": "workspace_agents_skills::editable",
                        "relativePath": None,
                        "content": "# editable\n\nUpdated.\n",
                    },
                )
        finally:
            if skill_doc.exists():
                skill_doc.chmod(0o644)
            clear_setta_paths_cache()

        assert get_response.status_code == 200
        get_payload = get_response.json()
        row_by_id = {row["skillId"]: row for row in get_payload["skills"]}
        editable_row = row_by_id["workspace_agents_skills::editable"]
        assert editable_row["isEditable"] is True
        assert editable_row["editabilityReason"] is None

        assert post_response.status_code == 200
        assert post_response.json()["skill"]["isEditable"] is True
        assert skill_doc.read_text(encoding="utf-8") == "# editable\n\nUpdated.\n"

    def test_get_app_gen_skills_route_does_not_probe_writes(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        original_open = Path.open

        def fail_mkdir(path: Path, *_args: object, **_kwargs: object) -> None:
            raise AssertionError(f"GET /getAppGenSkills must not mkdir {path}")

        def fail_open(
            path: Path,
            mode: str = "r",
            *args: object,
            **kwargs: object,
        ):
            if any(flag in mode for flag in ("w", "a", "x", "+")):
                raise AssertionError(
                    f"GET /getAppGenSkills must not open {path} with mode {mode}"
                )
            return original_open(path, mode, *args, **kwargs)

        monkeypatch.setattr(Path, "mkdir", fail_mkdir)
        monkeypatch.setattr(Path, "open", fail_open)

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        try:
            with TestClient(app) as client:
                response = client.get(
                    f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILLS.value}"
                )
        finally:
            clear_setta_paths_cache()

        assert response.status_code == 200
        payload = response.json()
        assert payload["customSkillCreateRootPath"] == str(
            (fake_home / ".agents" / "skills").resolve(strict=False)
        )
        assert payload["customSkillCreateRootActionable"] is False

    def test_get_app_gen_skills_route_matches_create_route_under_fallback_root(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        user_skills_root = fake_home / ".agents" / "skills"
        user_skills_root.mkdir(parents=True, exist_ok=True)
        agents_home = tmp_path / "agents-home"
        agents_skills_root = agents_home / "skills"
        agents_skills_root.mkdir(parents=True, exist_ok=True)
        agents_skills_root.chmod(0o500)

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.setenv("AGENTS_HOME", str(agents_home))
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        try:
            with TestClient(app) as client:
                get_response = client.get(
                    f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILLS.value}"
                )
                create_response = client.post(
                    f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                    json={
                        "skillId": None,
                        "relativePath": "route-authoritative-root-check",
                        "content": "# route-authoritative-root-check\n\nBody.\n",
                    },
                )
        finally:
            agents_skills_root.chmod(0o700)
            clear_setta_paths_cache()

        assert get_response.status_code == 200
        assert create_response.status_code == 200
        get_payload = get_response.json()
        create_payload = create_response.json()
        assert get_payload["customSkillCreateRootPath"] == create_payload["rootPath"]
        assert get_payload["customSkillCreateRootPath"] == str(
            user_skills_root.resolve(strict=False)
        )
        assert get_payload["customSkillCreateRootActionable"] is True

    def test_upsert_custom_skill_route_rejects_non_custom_roots(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        codex_home = tmp_path / "codex-home"
        skill_dir = codex_home / "skills" / "read-only"
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text("# read-only\n", encoding="utf-8")

        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.setenv("CODEX_HOME", str(codex_home))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": "codex_home_skills::read-only",
                    "relativePath": None,
                    "content": "# read-only\n\nUpdated.\n",
                },
            )

        assert response.status_code == 400
        assert "Only skills under AGENTS_HOME/skills" in response.json()["detail"]
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_updates_selected_skill_when_agents_home_is_unwritable(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Route updates must succeed when the selected skill is writable, even if
        # the default AGENTS_HOME root is not writable.
        workspace_root = tmp_path / "workspace"
        skill_dir = workspace_root / ".agents" / "skills" / "editable"
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_doc = skill_dir / "SKILL.md"
        skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        agents_home = tmp_path / "agents-home"
        agents_skills_root = agents_home / "skills"
        agents_skills_root.mkdir(parents=True, exist_ok=True)
        agents_skills_root.chmod(0o500)

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.setenv("AGENTS_HOME", str(agents_home))
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        try:
            with TestClient(app) as client:
                response = client.post(
                    f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                    json={
                        "skillId": "workspace_agents_skills::editable",
                        "relativePath": None,
                        "content": "# editable\n\nUpdated.\n",
                    },
                )
        finally:
            agents_skills_root.chmod(0o700)
            clear_setta_paths_cache()

        assert response.status_code == 200
        assert response.json()["skillId"] == "workspace_agents_skills::editable"
        assert skill_doc.read_text(encoding="utf-8") == "# editable\n\nUpdated.\n"

    def test_upsert_custom_skill_route_rejects_non_discoverable_skill_id_target(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_skills = workspace_root / ".agents" / "skills"
        workspace_skills.mkdir(parents=True, exist_ok=True)

        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        missing_skill_doc = workspace_skills / ".hidden" / "nested" / "SKILL.md"
        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": "workspace_agents_skills::.hidden/nested",
                    "relativePath": None,
                    "content": "# nested\n\nCreated unexpectedly.\n",
                },
            )

        assert response.status_code == 404
        assert (
            "Unknown or non-discoverable skillId: workspace_agents_skills::.hidden/nested"
            in (response.json()["detail"])
        )
        assert missing_skill_doc.exists() is False
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_rejects_hidden_skill_id_target_even_when_file_exists(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        hidden_skill_doc = (
            workspace_root / ".agents" / "skills" / ".git" / "hooks" / "SKILL.md"
        )
        hidden_skill_doc.parent.mkdir(parents=True, exist_ok=True)
        hidden_skill_doc.write_text("# hidden\n\nOriginal.\n", encoding="utf-8")

        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": "workspace_agents_skills::.git/hooks",
                    "relativePath": None,
                    "content": "# hidden\n\nUnexpected overwrite.\n",
                },
            )

        assert response.status_code == 404
        assert (
            "Unknown or non-discoverable skillId: workspace_agents_skills::.git/hooks"
            in (response.json()["detail"])
        )
        assert hidden_skill_doc.read_text(encoding="utf-8") == "# hidden\n\nOriginal.\n"
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_returns_400_when_no_writable_roots(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Route create should return a controlled 400 when no editable root is writable.
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        workspace_skills_root = workspace_root / ".agents" / "skills"
        workspace_skills_root.mkdir(parents=True, exist_ok=True)

        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        user_skills_root = fake_home / ".agents" / "skills"
        user_skills_root.mkdir(parents=True, exist_ok=True)

        agents_home = tmp_path / "agents-home"
        agents_skills_root = agents_home / "skills"
        agents_skills_root.mkdir(parents=True, exist_ok=True)

        workspace_skills_root.chmod(0o500)
        user_skills_root.chmod(0o500)
        agents_skills_root.chmod(0o500)

        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        monkeypatch.setenv("AGENTS_HOME", str(agents_home))
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        try:
            with TestClient(app) as client:
                response = client.post(
                    f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                    json={
                        "skillId": None,
                        "relativePath": "no-writable-root",
                        "content": "# no-writable-root\n\nBody.\n",
                    },
                )
        finally:
            workspace_skills_root.chmod(0o700)
            user_skills_root.chmod(0o700)
            agents_skills_root.chmod(0o700)
            clear_setta_paths_cache()

        assert response.status_code == 400
        assert "No writable custom skill root available" in response.json()["detail"]
