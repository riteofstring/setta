from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = ROOT / "apps" / "review" / "examples" / "review-playground" / "fixture"
WORKSPACE_ROOT = ROOT / "tmp" / "review-playground" / "review-project"
BACKEND_ROOT = ROOT / "apps" / "review" / "backend"
ZERO_REVISION = "0" * 40
SEED_MARKER = Path(".local/review/playground-seeded-v1")
SEED_STATE = Path(".local/review/state.json")
PROJECT_FILES = (
    Path("review.json"),
    Path("seed-assessments.json"),
    Path("requests/checkout-completion.json"),
    Path("requests/schema-rollout.json"),
    Path("requests/launch-poster.json"),
    Path("evidence/checkout-results.json"),
    Path("evidence/checkout-run.log"),
    Path("evidence/consumers.json"),
    Path("evidence/shadow-read.json"),
    Path("artifacts/aperture.svg"),
    Path("artifacts/orbital.svg"),
    Path("artifacts/signal.svg"),
    Path("repository/event_v3.ts"),
    Path("repository/retry_policy.go"),
)
FIXTURE_FILES = (
    *(path for path in PROJECT_FILES if path.parts[0] != "repository"),
    Path("repository-base/event_v3.ts"),
    Path("repository-base/retry_policy.go"),
    Path("repository-current/event_v3.ts"),
    Path("repository-current/retry_policy.go"),
)
REVISION_REQUESTS = (
    Path("requests/checkout-completion.json"),
    Path("requests/schema-rollout.json"),
)
GIT_ENVIRONMENT = {
    "GIT_AUTHOR_DATE": "2026-09-18T09:00:00Z",
    "GIT_AUTHOR_EMAIL": "playground@setta.local",
    "GIT_AUTHOR_NAME": "Setta Playground",
    "GIT_COMMITTER_DATE": "2026-09-18T09:00:00Z",
    "GIT_COMMITTER_EMAIL": "playground@setta.local",
    "GIT_COMMITTER_NAME": "Setta Playground",
}


class PlaygroundError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    supplied = tuple(sys.argv[1:] if arguments is None else arguments)
    if supplied:
        sys.stderr.write("Usage: run_review_playground.py\n")
        return 2
    try:
        workspace = prepare_workspace()
        seed_workspace(workspace)
    except PlaygroundError as error:
        sys.stderr.write(f"run_review_playground: {error}\n")
        return 1
    return _open_workspace(workspace)


def prepare_workspace() -> Path:
    if _entry_exists(WORKSPACE_ROOT):
        _validate_project(WORKSPACE_ROOT, "playground workspace")
        return WORKSPACE_ROOT
    _validate_fixture(FIXTURE_ROOT)
    try:
        WORKSPACE_ROOT.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".review-project-", dir=WORKSPACE_ROOT.parent
        ) as temporary_directory:
            staging = Path(temporary_directory)
            shutil.copytree(FIXTURE_ROOT, staging, symlinks=True, dirs_exist_ok=True)
            _validate_fixture(staging)
            _initialize_repository(staging)
            _install_base_revision(staging)
            shutil.rmtree(staging / "repository-base")
            shutil.rmtree(staging / "repository-current")
            _validate_project(staging, "staged playground project")
            if _entry_exists(WORKSPACE_ROOT):
                _validate_project(WORKSPACE_ROOT, "playground workspace")
                return WORKSPACE_ROOT
            staging.rename(WORKSPACE_ROOT)
    except PlaygroundError:
        raise
    except OSError as error:
        raise PlaygroundError(f"cannot seed workspace: {error}") from error
    _validate_project(WORKSPACE_ROOT, "playground workspace")
    return WORKSPACE_ROOT


def seed_workspace(workspace: Path) -> bool:
    marker = workspace / SEED_MARKER
    if _entry_exists(marker):
        _require_regular_path(workspace, SEED_MARKER, "playground seed marker")
        _require_regular_path(workspace, SEED_STATE, "playground review state")
        return False
    _apply_seed(workspace)
    _require_regular_path(workspace, SEED_STATE, "playground review state")
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text("setta-review-playground-seed/v1\n", encoding="utf-8")
    except OSError as error:
        raise PlaygroundError(f"cannot record playground seed: {error}") from error
    _require_regular_path(workspace, SEED_MARKER, "playground seed marker")
    return True


def _initialize_repository(project: Path) -> None:
    repository = project / "repository"
    try:
        shutil.copytree(project / "repository-base", repository, symlinks=True)
    except OSError as error:
        raise PlaygroundError(f"cannot create evidence repository: {error}") from error
    _run_git(("init", "--quiet", "--object-format=sha1"), repository)
    _run_git(("add", "--all"), repository)
    _run_git(("commit", "--quiet", "-m", "Playground evidence base"), repository)
    try:
        shutil.copytree(
            project / "repository-current",
            repository,
            symlinks=True,
            dirs_exist_ok=True,
        )
    except OSError as error:
        raise PlaygroundError(
            f"cannot install current evidence files: {error}"
        ) from error


def _install_base_revision(project: Path) -> None:
    revision = _git_output(("rev-parse", "HEAD"), project / "repository")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise PlaygroundError("evidence repository returned an invalid base revision")
    for relative in REVISION_REQUESTS:
        path = project / relative
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise PlaygroundError(f"cannot read revision request {relative}") from error
        if source.count(ZERO_REVISION) != 1:
            raise PlaygroundError(
                f"revision request must contain one base placeholder: {relative}"
            )
        try:
            path.write_text(source.replace(ZERO_REVISION, revision), encoding="utf-8")
        except OSError as error:
            raise PlaygroundError(
                f"cannot update revision request {relative}"
            ) from error


def _apply_seed(workspace: Path) -> None:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(runtime_root))
    from scripts import run_local_setta

    try:
        go = run_local_setta._pinned_go()
    except run_local_setta.LocalRunError as error:
        raise PlaygroundError(str(error)) from error
    try:
        completed = subprocess.run(
            [
                str(go),
                "-C",
                str(BACKEND_ROOT),
                "run",
                "-mod=readonly",
                "./cmd/review",
                "apply",
                "--project-root",
                str(workspace),
                "--file",
                str(workspace / "seed-assessments.json"),
            ],
            cwd=ROOT,
            check=False,
            stdout=subprocess.DEVNULL,
        )
    except OSError as error:
        raise PlaygroundError("cannot execute the Review seed command") from error
    if completed.returncode != 0:
        raise PlaygroundError("Review rejected the playground assessment seed")


def _open_workspace(workspace: Path) -> int:
    runtime_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(runtime_root))
    from scripts import run_local_setta

    return run_local_setta.main(["review", "open", "--project-root", str(workspace)])


def _validate_fixture(root: Path) -> None:
    _require_directory(root, "playground fixture")
    for relative in FIXTURE_FILES:
        _require_regular_path(root, relative, "playground fixture")
    for relative in REVISION_REQUESTS:
        try:
            source = (root / relative).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise PlaygroundError(
                f"playground fixture file is unreadable: {relative}"
            ) from error
        if source.count(ZERO_REVISION) != 1:
            raise PlaygroundError(
                f"playground fixture base placeholder is invalid: {relative}"
            )


def _validate_project(root: Path, label: str) -> None:
    _require_directory(root, label)
    for relative in PROJECT_FILES:
        _require_regular_path(root, relative, label)
    for relative in REVISION_REQUESTS:
        try:
            source = (root / relative).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise PlaygroundError(f"{label} file is unreadable: {relative}") from error
        if ZERO_REVISION in source:
            raise PlaygroundError(
                f"{label} has an unresolved base revision: {relative}"
            )
    revision = _git_output(("rev-parse", "HEAD"), root / "repository")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise PlaygroundError(f"{label} has an invalid evidence repository")
    if not _git_output(
        ("status", "--porcelain", "--untracked-files=no"), root / "repository"
    ):
        raise PlaygroundError(f"{label} evidence repository has no submitted changes")


def _require_regular_path(root: Path, relative: Path, label: str) -> None:
    current = root
    for part in relative.parts[:-1]:
        current /= part
        _require_directory(current, f"{label} directory {relative.parent}")
    _require_regular_file(root / relative, f"{label} file {relative}")


def _run_git(arguments: Sequence[str], repository: Path) -> None:
    _git_process(arguments, repository, capture=False)


def _git_output(arguments: Sequence[str], repository: Path) -> str:
    completed = _git_process(arguments, repository, capture=True)
    return completed.stdout.strip()


def _git_process(
    arguments: Sequence[str], repository: Path, *, capture: bool
) -> subprocess.CompletedProcess[str]:
    git = shutil.which("git")
    if git is None:
        raise PlaygroundError("git is required")
    environment = os.environ.copy()
    environment.update(GIT_ENVIRONMENT)
    try:
        return subprocess.run(
            [git, "-c", "core.autocrlf=false", *arguments],
            cwd=repository,
            env=environment,
            check=True,
            capture_output=capture,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise PlaygroundError(
            f"evidence repository command failed: git {arguments[0]}"
        ) from error


def _entry_exists(path: Path) -> bool:
    try:
        path.lstat()
    except FileNotFoundError:
        return False
    except OSError as error:
        raise PlaygroundError(f"cannot inspect {path}: {error}") from error
    return True


def _require_directory(path: Path, label: str) -> None:
    mode = _entry_mode(path, label)
    if not stat.S_ISDIR(mode):
        raise PlaygroundError(f"{label} must be a non-symlink directory: {path}")


def _require_regular_file(path: Path, label: str) -> None:
    mode = _entry_mode(path, label)
    if not stat.S_ISREG(mode):
        raise PlaygroundError(f"{label} must be a regular non-symlink file: {path}")


def _entry_mode(path: Path, label: str) -> int:
    try:
        return path.lstat().st_mode
    except OSError as error:
        raise PlaygroundError(f"{label} is unavailable: {path}: {error}") from error


if __name__ == "__main__":
    raise SystemExit(main())
