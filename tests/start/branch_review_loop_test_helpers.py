import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def run_branch_review_command(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def create_git_repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "init"], cwd=root, check=True, capture_output=True, text=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    (root / "README.md").write_text("initial\n", encoding="utf-8")
    subprocess.run(
        ["git", "add", "README.md"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "commit", "-m", "init"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return root


def runner_script() -> Path:
    return repo_root() / "scripts" / "run-codex-branch-review-loop.sh"


def standalone_wrapper_script() -> Path:
    return (
        repo_root()
        / "scripts"
        / "run-codex-app-subsystem-standalone-branch-review-loop.sh"
    )
