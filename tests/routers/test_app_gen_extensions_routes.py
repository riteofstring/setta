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
    upsert_app_gen_custom_skill,
    router as app_gen_extensions_router,
)
from setta.types.routes import Route
from setta.utils.paths import clear_setta_paths_cache


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
            assert row.description == "Create dense dashboard layouts."
            assert row.editable is True
            assert row.editBlockedReason is None
            assert not hasattr(row, "skillPath")

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
            assert response.editable is True
            assert response.editBlockedReason is None
            assert (
                expected_skill_doc.read_text(encoding="utf-8")
                == "# my-custom-skill\n\nBody.\n"
            )

    def test_creates_custom_skill_in_user_root_when_agents_home_root_is_invalid(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            fake_home = Path(tmpdir) / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            invalid_agents_home = Path(tmpdir) / "agents-home-file"
            invalid_agents_home.write_text("not a directory", encoding="utf-8")
            monkeypatch.setenv("AGENTS_HOME", str(invalid_agents_home))
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            response = upsert_app_gen_custom_skill(
                workspace_root=workspace_root,
                skill_id=None,
                relative_path="fallback-root-skill",
                content="# fallback-root-skill\n\nBody.\n",
            )

            expected_skill_doc = (
                fake_home / ".agents" / "skills" / "fallback-root-skill" / "SKILL.md"
            )
            assert response.skillId == "user_agents_skills::fallback-root-skill"
            assert response.created is True
            assert response.skillDocPath == str(expected_skill_doc.resolve(strict=False))
            assert (
                expected_skill_doc.read_text(encoding="utf-8")
                == "# fallback-root-skill\n\nBody.\n"
            )

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
            assert response.editable is True
            assert response.editBlockedReason is None
            assert skill_doc.read_text(encoding="utf-8") == "# editable\n\nUpdated.\n"

    def test_listed_skill_editability_matches_upsert_validation(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            workspace_skills_root = workspace_root / ".agents" / "skills"
            workspace_skills_root.mkdir(parents=True, exist_ok=True)

            (workspace_skills_root / "SKILL.md").write_text(
                "# root\n\nRoot skill doc.\n",
                encoding="utf-8",
            )

            editable_skill_doc = workspace_skills_root / "editable" / "SKILL.md"
            editable_skill_doc.parent.mkdir(parents=True, exist_ok=True)
            editable_skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

            nested_skill_doc = (
                workspace_skills_root / "nested" / "path" / "SKILL.md"
            )
            nested_skill_doc.parent.mkdir(parents=True, exist_ok=True)
            nested_skill_doc.write_text("# nested\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            rows = list_app_gen_skills(workspace_root)
            row_by_id = {row.skillId: row for row in rows}

            root_row = row_by_id["workspace_agents_skills::."]
            assert root_row.editable is False
            assert (
                root_row.editBlockedReason
                == "Editing root-level SKILL.md is not supported."
            )

            nested_row = row_by_id["workspace_agents_skills::nested/path"]
            assert nested_row.editable is False
            assert nested_row.editBlockedReason is not None
            assert (
                "skillId must start with an alphanumeric character"
                in nested_row.editBlockedReason
            )

            editable_row = row_by_id["workspace_agents_skills::editable"]
            assert editable_row.editable is True
            assert editable_row.editBlockedReason is None

            with pytest.raises(
                ValueError,
                match="Editing root-level SKILL.md is not supported.",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id=root_row.skillId,
                    relative_path=None,
                    content="# root\n\nUpdated.\n",
                )

            with pytest.raises(
                ValueError,
                match="skillId must start with an alphanumeric character",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id=nested_row.skillId,
                    relative_path=None,
                    content="# nested\n\nUpdated.\n",
                )

            response = upsert_app_gen_custom_skill(
                workspace_root=workspace_root,
                skill_id=editable_row.skillId,
                relative_path=None,
                content="# editable\n\nUpdated.\n",
            )
            assert response.created is False
            assert response.skillId == "workspace_agents_skills::editable"
            assert response.editable is True
            assert response.editBlockedReason is None
            assert (
                editable_skill_doc.read_text(encoding="utf-8")
                == "# editable\n\nUpdated.\n"
            )

    def test_rejects_skill_id_that_canonicalizes_to_root_skill_doc(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            workspace_skills_root = workspace_root / ".agents" / "skills"
            workspace_skills_root.mkdir(parents=True, exist_ok=True)
            root_skill_doc = workspace_skills_root / "SKILL.md"
            root_skill_doc.write_text("# root\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            with pytest.raises(
                ValueError,
                match="Editing root-level SKILL.md is not supported.",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::foo/..",
                    relative_path=None,
                    content="# root\n\nUpdated.\n",
                )
            assert root_skill_doc.read_text(encoding="utf-8") == "# root\n\nInitial.\n"

    def test_rejects_skill_id_with_non_canonical_relative_path(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            nested_skill_dir = workspace_root / ".agents" / "skills" / "nested" / "path"
            nested_skill_dir.mkdir(parents=True, exist_ok=True)
            nested_skill_doc = nested_skill_dir / "SKILL.md"
            nested_skill_doc.write_text("# nested\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            with pytest.raises(
                ValueError,
                match="skillId must start with an alphanumeric character",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::nested/path",
                    relative_path=None,
                    content="# nested\n\nUpdated.\n",
                )
            assert (
                nested_skill_doc.read_text(encoding="utf-8") == "# nested\n\nInitial.\n"
            )

    def test_skill_id_updates_require_existing_skill_doc(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            workspace_skills_root = workspace_root / ".agents" / "skills"
            workspace_skills_root.mkdir(parents=True, exist_ok=True)

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            monkeypatch.delenv("AGENTS_HOME", raising=False)
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            with pytest.raises(
                KeyError,
                match="Missing SKILL.md for workspace_agents_skills::missing-skill",
            ):
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="workspace_agents_skills::missing-skill",
                    relative_path=None,
                    content="# missing-skill\n\nBody.\n",
                )
            assert (workspace_skills_root / "missing-skill" / "SKILL.md").exists() is False

    def test_updates_workspace_skill_by_skill_id_when_agents_home_is_invalid(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            # Updating by skill id must target the resolved skill root directly
            # and never require creating AGENTS_HOME/skills.
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / ".agents" / "skills" / "editable"
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_doc = skill_dir / "SKILL.md"
            skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)
            invalid_agents_home = workspace_root / "agents-home-file"
            invalid_agents_home.write_text("not a directory", encoding="utf-8")
            monkeypatch.setenv("AGENTS_HOME", str(invalid_agents_home))
            monkeypatch.delenv("CODEX_HOME", raising=False)
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            response = upsert_app_gen_custom_skill(
                workspace_root=workspace_root,
                skill_id="workspace_agents_skills::editable",
                relative_path=None,
                content="# editable\n\nUpdated via skill id.\n",
            )

            assert response.skillId == "workspace_agents_skills::editable"
            assert response.created is False
            assert (
                skill_doc.read_text(encoding="utf-8")
                == "# editable\n\nUpdated via skill id.\n"
            )

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
            invalid_agents_home = workspace_root / "agents-home-file"
            invalid_agents_home.write_text("not a directory", encoding="utf-8")
            monkeypatch.setenv("AGENTS_HOME", str(invalid_agents_home))
            monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

            with pytest.raises(ValueError) as exc_info:
                upsert_app_gen_custom_skill(
                    workspace_root=workspace_root,
                    skill_id="codex_home_skills::read-only-skill",
                    relative_path=None,
                    content="# read-only\n\nUpdated.\n",
                )
            error_detail = str(exc_info.value)
            assert "Only skills under AGENTS_HOME/skills" in error_detail
            assert "Not a directory" not in error_detail

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
        assert payload["editable"] is True
        assert payload["editBlockedReason"] is None
        expected_skill_doc = (
            fake_home / ".agents" / "skills" / "route-created" / "SKILL.md"
        )
        assert payload["skillDocPath"] == str(expected_skill_doc)
        assert (
            expected_skill_doc.read_text(encoding="utf-8")
            == "# route-created\n\nBody.\n"
        )
        clear_setta_paths_cache()

    def test_get_app_gen_skills_route_includes_editability_metadata(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_skills_root = workspace_root / ".agents" / "skills"
        nested_skill_doc = workspace_skills_root / "nested" / "path" / "SKILL.md"
        nested_skill_doc.parent.mkdir(parents=True, exist_ok=True)
        nested_skill_doc.write_text("# nested\n\nBody.\n", encoding="utf-8")
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        clear_setta_paths_cache()

        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.delenv("AGENTS_HOME", raising=False)
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.get(f"{Route.PREFIX.value}{Route.GET_APP_GEN_SKILLS.value}")

        assert response.status_code == 200
        payload = response.json()
        nested_row = next(
            row
            for row in payload
            if row["skillId"] == "workspace_agents_skills::nested/path"
        )
        assert nested_row["editable"] is False
        assert "skillId must start with an alphanumeric character" in (
            nested_row["editBlockedReason"] or ""
        )
        clear_setta_paths_cache()

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
        invalid_agents_home = tmp_path / "agents-home-file"
        invalid_agents_home.write_text("not a directory", encoding="utf-8")
        monkeypatch.setenv("AGENTS_HOME", str(invalid_agents_home))
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
        error_detail = response.json()["detail"]
        assert "Only skills under AGENTS_HOME/skills" in error_detail
        assert "Not a directory" not in error_detail
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_updates_workspace_skill_when_agents_home_is_invalid(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Route updates by skill id should succeed even if AGENTS_HOME points
        # to a non-directory path.
        workspace_root = tmp_path / "workspace"
        skill_dir = workspace_root / ".agents" / "skills" / "editable"
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_doc = skill_dir / "SKILL.md"
        skill_doc.write_text("# editable\n\nInitial.\n", encoding="utf-8")

        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        invalid_agents_home = tmp_path / "agents-home-file"
        invalid_agents_home.write_text("not a directory", encoding="utf-8")
        monkeypatch.setenv("AGENTS_HOME", str(invalid_agents_home))
        monkeypatch.delenv("CODEX_HOME", raising=False)
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
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
                    "content": "# editable\n\nUpdated from route.\n",
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["skillId"] == "workspace_agents_skills::editable"
        assert payload["created"] is False
        assert payload["editable"] is True
        assert payload["editBlockedReason"] is None
        assert skill_doc.read_text(encoding="utf-8") == (
            "# editable\n\nUpdated from route.\n"
        )
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_rejects_non_canonical_skill_id_path(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        nested_skill_dir = workspace_root / ".agents" / "skills" / "nested" / "path"
        nested_skill_dir.mkdir(parents=True, exist_ok=True)
        nested_skill_doc = nested_skill_dir / "SKILL.md"
        nested_skill_doc.write_text("# nested\n\nInitial.\n", encoding="utf-8")

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
                    "skillId": "workspace_agents_skills::nested/path",
                    "relativePath": None,
                    "content": "# nested\n\nUpdated.\n",
                },
            )

        assert response.status_code == 400
        assert "skillId must start with an alphanumeric character" in response.json()[
            "detail"
        ]
        assert nested_skill_doc.read_text(encoding="utf-8") == "# nested\n\nInitial.\n"
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_rejects_skill_id_that_resolves_to_root(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_skills_root = workspace_root / ".agents" / "skills"
        workspace_skills_root.mkdir(parents=True, exist_ok=True)
        root_skill_doc = workspace_skills_root / "SKILL.md"
        root_skill_doc.write_text("# root\n\nInitial.\n", encoding="utf-8")

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
                    "skillId": "workspace_agents_skills::foo/..",
                    "relativePath": None,
                    "content": "# root\n\nUpdated.\n",
                },
            )

        assert response.status_code == 400
        assert "Editing root-level SKILL.md is not supported." in response.json()[
            "detail"
        ]
        assert root_skill_doc.read_text(encoding="utf-8") == "# root\n\nInitial.\n"
        clear_setta_paths_cache()

    def test_upsert_custom_skill_route_reports_when_no_writable_root_is_available(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        broken_agents_home = tmp_path / "broken-agents-home"
        broken_agents_home.write_text("not a directory", encoding="utf-8")
        broken_user_root = tmp_path / "broken-user-home"
        broken_user_root.write_text("not a directory", encoding="utf-8")
        broken_workspace_root = tmp_path / "broken-workspace-home"
        broken_workspace_root.write_text("not a directory", encoding="utf-8")

        monkeypatch.setattr(
            app_gen_extensions,
            "iter_skill_roots",
            lambda _: [
                (
                    "agents_home_skills",
                    "AGENTS_HOME skills",
                    broken_agents_home / "skills",
                ),
                (
                    "user_agents_skills",
                    "User ~/.agents/skills",
                    broken_user_root / "skills",
                ),
                (
                    "workspace_agents_skills",
                    "Workspace .agents/skills",
                    broken_workspace_root / "skills",
                ),
            ],
        )
        fake_home = tmp_path / "home"
        fake_home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(Path, "home", lambda: fake_home)
        monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
        clear_setta_paths_cache()

        app = FastAPI()
        app.state.setta = SimpleNamespace(deployment_mode=False)
        app.include_router(app_gen_extensions_router, prefix=Route.PREFIX.value)

        with TestClient(app) as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.UPSERT_APP_GEN_CUSTOM_SKILL.value}",
                json={
                    "skillId": None,
                    "relativePath": "cannot-create",
                    "content": "# cannot-create\n\nBody.\n",
                },
            )

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "No writable custom skill root is available." in detail
        assert "agents_home_skills" in detail
        assert "user_agents_skills" in detail
        assert "workspace_agents_skills" in detail
        clear_setta_paths_cache()
