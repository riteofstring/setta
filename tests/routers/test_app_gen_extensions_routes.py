import inspect
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

import setta.routers.app_gen_extensions as app_gen_extensions
from setta.routers.app_gen_extensions import (
    list_app_gen_skills,
    read_app_gen_skill_content,
)


class TestAppGenExtensionsRoutes:
    def test_route_handlers_are_sync_for_threadpool_fs_isolation(self) -> None:
        # Route handlers do heavy filesystem scans/reads and should remain sync
        # so FastAPI executes them off the event loop.
        assert inspect.iscoroutinefunction(app_gen_extensions.route_get_app_gen_skills) is False
        assert (
            inspect.iscoroutinefunction(
                app_gen_extensions.route_get_app_gen_skill_content
            )
            is False
        )

    def test_lists_workspace_skills(self, monkeypatch: pytest.MonkeyPatch) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / "skills" / "ui-layout"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(
                "# UI Layout\n\nCreate dense dashboard layouts.\n",
                encoding="utf-8",
            )

            # Keep user-level roots isolated for deterministic test behavior.
            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)

            rows = list_app_gen_skills(workspace_root)

            assert len(rows) == 1
            row = rows[0]
            assert row.skillId == "workspace_skills::ui-layout"
            assert row.name == "ui-layout"
            assert row.description == "Create dense dashboard layouts."
            assert not hasattr(row, "skillPath")

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
            (workspace_root / "skills").mkdir(parents=True, exist_ok=True)

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)

            with pytest.raises(ValueError):
                read_app_gen_skill_content(
                    workspace_root=workspace_root,
                    skill_id="workspace_skills::../outside",
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

    def test_skips_ignored_directories_during_walk(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            root_skills = workspace_root / "skills"
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
            assert [row.skillId for row in rows] == ["workspace_skills::kept"]

    def test_lists_skills_without_path_read_text_for_description(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / "skills" / "streamed-description"
            skill_dir.mkdir(parents=True, exist_ok=True)
            (skill_dir / "SKILL.md").write_text(
                "# Streamed Description\n\nRead only first useful line.\nMore content.\n",
                encoding="utf-8",
            )

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)

            def fail_read_text(*_: object, **__: object) -> str:
                raise AssertionError(
                    "Path.read_text should not be used for descriptions"
                )

            monkeypatch.setattr(Path, "read_text", fail_read_text)

            rows = list_app_gen_skills(workspace_root)

            assert len(rows) == 1
            assert rows[0].description == "Read only first useful line."

    def test_truncates_large_skill_content_with_metadata(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir)
            skill_dir = workspace_root / "skills" / "large-doc"
            skill_dir.mkdir(parents=True, exist_ok=True)
            oversized_content = "A" * (app_gen_extensions._MAX_SKILL_CONTENT_PREVIEW_BYTES + 5000)
            (skill_dir / "SKILL.md").write_text(oversized_content, encoding="utf-8")

            fake_home = workspace_root / "home"
            fake_home.mkdir(parents=True, exist_ok=True)
            monkeypatch.setattr(Path, "home", lambda: fake_home)

            content = read_app_gen_skill_content(
                workspace_root=workspace_root,
                skill_id="workspace_skills::large-doc",
            )

            assert content.skillId == "workspace_skills::large-doc"
            assert content.truncated is True
            assert content.originalSizeBytes == len(oversized_content)
            assert len(content.content) == app_gen_extensions._MAX_SKILL_CONTENT_PREVIEW_BYTES
