import os
import re
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _extract_remote_catalog_program() -> str:
    script_path = _repo_root() / "scripts" / "aws-devbox-worktree-picker.sh"
    script_text = script_path.read_text(encoding="utf-8")
    match = re.search(
        r"render_worktree_catalog\(\) \{\npython3 - <<'PY'\n(.*?)\nPY\n\}",
        script_text,
        re.DOTALL,
    )
    assert match is not None
    return match.group(1)


def _run_git(*args: str, cwd: Path) -> None:
    subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )


def _write_executable(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _init_repo(path: Path, *, origin: str, include_runtime_info: bool) -> None:
    path.mkdir(parents=True, exist_ok=True)
    _run_git("init", cwd=path)
    _run_git("config", "user.name", "Setta Tests", cwd=path)
    _run_git("config", "user.email", "tests@example.com", cwd=path)
    _run_git("remote", "add", "origin", origin, cwd=path)
    (path / "README.md").write_text("fixture\n", encoding="utf-8")
    _write_executable(path / "ai.sh", "#!/bin/sh\nexit 0\n")
    if include_runtime_info:
        _write_executable(
            path / "scripts" / "dev-runtime-info.sh",
            "#!/bin/sh\nprintf '{}\\n'\n",
        )
    _run_git("add", ".", cwd=path)
    _run_git("commit", "-m", "init", cwd=path)


def _init_legacy_scripts_ai_repo(path: Path, *, origin: str) -> None:
    path.mkdir(parents=True, exist_ok=True)
    _run_git("init", cwd=path)
    _run_git("config", "user.name", "Setta Tests", cwd=path)
    _run_git("config", "user.email", "tests@example.com", cwd=path)
    _run_git("remote", "add", "origin", origin, cwd=path)
    (path / "README.md").write_text("fixture\n", encoding="utf-8")
    _write_executable(path / "scripts" / "ai.sh", "#!/bin/sh\nexit 0\n")
    _run_git("add", ".", cwd=path)
    _run_git("commit", "-m", "init", cwd=path)


def test_remote_catalog_includes_legacy_ai_sh_worktrees(tmp_path: Path) -> None:
    siblings_root = tmp_path / "dev"
    origin = "git@github.com:riteofstring/setta.git"

    current_repo = siblings_root / "setta.pixijs-graph"
    _init_repo(current_repo, origin=origin, include_runtime_info=True)

    legacy_family_root = siblings_root / "setta"
    _init_repo(legacy_family_root, origin=origin, include_runtime_info=False)

    legacy_worktree = siblings_root / "setta.go-rewrite-dom-simple"
    _run_git(
        "worktree",
        "add",
        "-b",
        "go-rewrite-dom-simple",
        str(legacy_worktree),
        "HEAD",
        cwd=legacy_family_root,
    )

    catalog_program = _extract_remote_catalog_program()
    env = os.environ.copy()
    env["SETTA_REMOTE_REPO_ROOT"] = str(current_repo)
    env["SETTA_REMOTE_ENTRYPOINT_PARENT"] = str(siblings_root)
    result = subprocess.run(
        ["python3", "-c", catalog_program],
        cwd=_repo_root(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    rows = [line.split("\t") for line in result.stdout.splitlines() if line.strip()]
    indexed = {row[0]: row[1:] for row in rows}

    assert str(legacy_family_root) in indexed
    assert str(legacy_worktree) in indexed
    assert indexed[str(legacy_worktree)][0] == "setta.go-rewrite-dom-simple"
    assert indexed[str(legacy_worktree)][1] == "go-rewrite-dom-simple"
    assert indexed[str(legacy_worktree)][3] == "worktree"


def test_remote_catalog_normalizes_equivalent_origin_urls_across_families(tmp_path: Path) -> None:
    siblings_root = tmp_path / "dev"

    current_repo = siblings_root / "setta.pixijs-graph"
    _init_repo(
        current_repo,
        origin="git@github.com:riteofstring/setta.git",
        include_runtime_info=True,
    )

    legacy_family_root = siblings_root / "setta"
    _init_repo(
        legacy_family_root,
        origin="https://github.com/riteofstring/setta.git",
        include_runtime_info=False,
    )

    legacy_worktree = siblings_root / "setta.go-rewrite-dom-simple"
    _run_git(
        "worktree",
        "add",
        "-b",
        "go-rewrite-dom-simple",
        str(legacy_worktree),
        "HEAD",
        cwd=legacy_family_root,
    )

    catalog_program = _extract_remote_catalog_program()
    env = os.environ.copy()
    env["SETTA_REMOTE_REPO_ROOT"] = str(current_repo)
    env["SETTA_REMOTE_ENTRYPOINT_PARENT"] = str(siblings_root)
    result = subprocess.run(
        ["python3", "-c", catalog_program],
        cwd=_repo_root(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    rows = [line.split("\t") for line in result.stdout.splitlines() if line.strip()]
    indexed = {row[0]: row[1:] for row in rows}

    assert str(legacy_family_root) in indexed
    assert str(legacy_worktree) in indexed
    assert indexed[str(legacy_worktree)][1] == "go-rewrite-dom-simple"
    assert indexed[str(legacy_worktree)][3] == "worktree"


def test_remote_catalog_includes_legacy_scripts_ai_worktrees(tmp_path: Path) -> None:
    siblings_root = tmp_path / "dev"
    origin = "git@github.com:riteofstring/setta.git"

    current_repo = siblings_root / "setta.pixijs-graph"
    _init_repo(current_repo, origin=origin, include_runtime_info=True)

    legacy_family_root = siblings_root / "setta"
    _init_legacy_scripts_ai_repo(legacy_family_root, origin=origin)

    legacy_worktree = siblings_root / "setta.go-rewrite-dom-simple"
    _run_git(
        "worktree",
        "add",
        "-b",
        "go-rewrite-dom-simple",
        str(legacy_worktree),
        "HEAD",
        cwd=legacy_family_root,
    )

    catalog_program = _extract_remote_catalog_program()
    env = os.environ.copy()
    env["SETTA_REMOTE_REPO_ROOT"] = str(current_repo)
    env["SETTA_REMOTE_ENTRYPOINT_PARENT"] = str(siblings_root)
    result = subprocess.run(
        ["python3", "-c", catalog_program],
        cwd=_repo_root(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    rows = [line.split("\t") for line in result.stdout.splitlines() if line.strip()]
    indexed = {row[0]: row[1:] for row in rows}

    assert str(legacy_family_root) in indexed
    assert str(legacy_worktree) in indexed
    assert indexed[str(legacy_worktree)][1] == "go-rewrite-dom-simple"
    assert indexed[str(legacy_worktree)][3] == "worktree"
