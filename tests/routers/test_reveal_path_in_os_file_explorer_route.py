from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from setta.routers.status import router as status_router
from setta.types.routes import Route
from setta.utils.paths import clear_setta_paths_cache


@pytest.fixture
def _mock_reveal_command(monkeypatch: pytest.MonkeyPatch) -> list[list[str]]:
    launched_commands: list[list[str]] = []

    def fake_build_command(path: Path) -> list[str]:
        return ["mock-open", str(path)]

    def fake_run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
    ):
        assert check is False
        assert capture_output is True
        assert text is True
        launched_commands.append(command)
        return SimpleNamespace(returncode=0, stderr="", stdout="")

    monkeypatch.setattr(
        "setta.routers.status._build_reveal_path_command", fake_build_command
    )
    monkeypatch.setattr(
        "setta.routers.status.shutil.which",
        lambda command: "/usr/bin/mock-open" if command == "mock-open" else None,
    )
    monkeypatch.setattr("setta.routers.status.subprocess.run", fake_run)
    return launched_commands


def _build_client() -> TestClient:
    app = FastAPI()
    app.state.setta = SimpleNamespace(deployment_mode=False)
    app.include_router(status_router, prefix=Route.PREFIX.value)
    return TestClient(app)


def test_reveal_path_allows_workspace_and_setta_files_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    _mock_reveal_command: list[list[str]],
) -> None:
    # Configure an isolated workspace root so allowlist checks are deterministic.
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
    clear_setta_paths_cache()

    workspace_file = workspace_root / "docs" / "notes.txt"
    workspace_file.parent.mkdir(parents=True, exist_ok=True)
    workspace_file.write_text("workspace", encoding="utf-8")

    setta_file = workspace_root / "setta_files" / "llm_config.json"
    setta_file.parent.mkdir(parents=True, exist_ok=True)
    setta_file.write_text("{}", encoding="utf-8")

    with _build_client() as client:
        workspace_response = client.post(
            f"{Route.PREFIX.value}{Route.REVEAL_PATH_IN_OS_FILE_EXPLORER.value}",
            json={"path": str(workspace_file)},
        )
        setta_response = client.post(
            f"{Route.PREFIX.value}{Route.REVEAL_PATH_IN_OS_FILE_EXPLORER.value}",
            json={"path": str(setta_file)},
        )

    assert workspace_response.status_code == 200
    assert setta_response.status_code == 200
    assert _mock_reveal_command == [
        ["mock-open", str(workspace_file)],
        ["mock-open", str(setta_file)],
    ]


def test_reveal_path_allows_discovered_skill_root_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    _mock_reveal_command: list[list[str]],
) -> None:
    # Skill roots discovered from CODEX_HOME should also be revealable.
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    codex_home = tmp_path / "codex-home"
    monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
    monkeypatch.setenv("CODEX_HOME", str(codex_home))
    clear_setta_paths_cache()

    skill_doc = codex_home / "skills" / "ui-layout" / "SKILL.md"
    skill_doc.parent.mkdir(parents=True, exist_ok=True)
    skill_doc.write_text("# ui-layout\n", encoding="utf-8")

    with _build_client() as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.REVEAL_PATH_IN_OS_FILE_EXPLORER.value}",
            json={"path": str(skill_doc)},
        )

    assert response.status_code == 200
    assert _mock_reveal_command == [["mock-open", str(skill_doc)]]


def test_reveal_path_rejects_paths_outside_allowlist(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    _mock_reveal_command: list[list[str]],
) -> None:
    # Existing paths outside workspace/setta_files/skill roots should be blocked.
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
    clear_setta_paths_cache()

    outside_path = tmp_path / "outside" / "secret.txt"
    outside_path.parent.mkdir(parents=True, exist_ok=True)
    outside_path.write_text("secret", encoding="utf-8")

    with _build_client() as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.REVEAL_PATH_IN_OS_FILE_EXPLORER.value}",
            json={"path": str(outside_path)},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Path is outside allowed reveal roots."
    assert _mock_reveal_command == []


def test_reveal_path_outside_allowlist_returns_same_error_for_missing_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    _mock_reveal_command: list[list[str]],
) -> None:
    # Disallowed roots should return a consistent error regardless of filesystem existence.
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
    clear_setta_paths_cache()

    missing_outside_path = tmp_path / "outside" / "missing.txt"

    with _build_client() as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.REVEAL_PATH_IN_OS_FILE_EXPLORER.value}",
            json={"path": str(missing_outside_path)},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Path is outside allowed reveal roots."
    assert _mock_reveal_command == []


def test_reveal_path_returns_error_when_explorer_command_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Non-zero command exits should surface an explicit backend error.
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(workspace_root))
    clear_setta_paths_cache()

    workspace_file = workspace_root / "docs" / "notes.txt"
    workspace_file.parent.mkdir(parents=True, exist_ok=True)
    workspace_file.write_text("workspace", encoding="utf-8")
    launched_commands: list[list[str]] = []

    def fake_build_command(path: Path) -> list[str]:
        return ["mock-open", str(path)]

    def fake_run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
    ):
        assert check is False
        assert capture_output is True
        assert text is True
        launched_commands.append(command)
        return SimpleNamespace(returncode=7, stderr="No display found.", stdout="")

    monkeypatch.setattr(
        "setta.routers.status._build_reveal_path_command", fake_build_command
    )
    monkeypatch.setattr(
        "setta.routers.status.shutil.which",
        lambda command: "/usr/bin/mock-open" if command == "mock-open" else None,
    )
    monkeypatch.setattr("setta.routers.status.subprocess.run", fake_run)

    with _build_client() as client:
        response = client.post(
            f"{Route.PREFIX.value}{Route.REVEAL_PATH_IN_OS_FILE_EXPLORER.value}",
            json={"path": str(workspace_file)},
        )

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Failed to reveal path in file explorer: No display found."
    )
    assert launched_commands == [["mock-open", str(workspace_file)]]
