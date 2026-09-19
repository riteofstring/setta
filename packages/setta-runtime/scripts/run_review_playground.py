from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = ROOT / "apps" / "review" / "examples" / "review-playground" / "fixture"
WORKSPACE_ROOT = ROOT / "tmp" / "review-playground" / "review-project"
BACKEND_ROOT = ROOT / "apps" / "review" / "backend"
ZERO_REVISION = "0" * 40
ZERO_SHA256 = "0" * 64
SEED_MARKER = Path(".local/review/playground-seeded-v1")
SEED_STATE = Path(".local/review/state.json")
PROJECT_FILES = (
    Path("go.mod"),
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
    Path("repository/event_bus.ts"),
    Path("repository/retry_policy.go"),
    Path("repository/support.go"),
)
FIXTURE_FILES = (
    *(path for path in PROJECT_FILES if path.parts[0] != "repository"),
    Path("repository-base/event_v3.ts"),
    Path("repository-base/event_bus.ts"),
    Path("repository-base/retry_policy.go"),
    Path("repository-base/support.go"),
    Path("repository-current/event_v3.ts"),
    Path("repository-current/event_bus.ts"),
    Path("repository-current/retry_policy.go"),
    Path("repository-current/support.go"),
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
HUNK_HEADER = re.compile(rb"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


class PlaygroundError(RuntimeError):
    pass


def _string_map(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    normalized: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            return None
        normalized[key] = item
    return normalized


def _object_list(value: object) -> list[object] | None:
    if not isinstance(value, list):
        return None
    return list(value)


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
            _install_evidence_identities(staging)
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


def _install_evidence_identities(project: Path) -> None:
    revision = _git_output(("rev-parse", "HEAD"), project / "repository")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise PlaygroundError("evidence repository returned an invalid base revision")
    for relative in REVISION_REQUESTS:
        path = project / relative
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PlaygroundError(f"cannot read revision request {relative}") from error
        document = _string_map(loaded)
        evidence_values = (
            None if document is None else _object_list(document.get("evidence"))
        )
        if document is None or evidence_values is None:
            raise PlaygroundError(
                f"revision request has an invalid evidence collection: {relative}"
            )
        normalized_evidence: list[object] = []
        for evidence_value in evidence_values:
            evidence = _string_map(evidence_value)
            if evidence is None:
                raise PlaygroundError(
                    f"invalid evidence in revision request {relative}"
                )
            _install_evidence_identity(project, revision, evidence, relative)
            normalized_evidence.append(evidence)
        document["evidence"] = normalized_evidence
        try:
            path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
        except OSError as error:
            raise PlaygroundError(
                f"cannot update evidence identities in {relative}"
            ) from error


def _install_evidence_identity(
    project: Path,
    revision: str,
    evidence: dict[str, object],
    request_path: Path,
) -> None:
    kind = evidence.get("kind")
    if not isinstance(kind, str):
        raise PlaygroundError(f"invalid evidence in revision request {request_path}")
    if kind == "gitDiff":
        _install_diff_identity(project, revision, evidence, request_path)
        return
    if kind == "text":
        _install_file_identity(project, "text", evidence, request_path)
    elif kind == "json":
        _install_file_identity(project, "json", evidence, request_path)


def _install_diff_identity(
    project: Path, revision: str, evidence: dict[str, object], request_path: Path
) -> None:
    payload = _string_map(evidence.get("gitDiff"))
    if payload is None:
        raise PlaygroundError(
            f"invalid Git evidence in revision request {request_path}"
        )
    if (
        payload.get("baseRevision") != ZERO_REVISION
        or payload.get("patchSha256") != ZERO_SHA256
    ):
        raise PlaygroundError(
            f"Git evidence placeholders are invalid in revision request {request_path}"
        )
    path = payload.get("path")
    context_lines = payload.get("contextLines")
    target = payload.get("targetRevision")
    hunk = _string_map(payload.get("hunk"))
    if not isinstance(path, str) or not isinstance(context_lines, int) or hunk is None:
        raise PlaygroundError(
            f"invalid Git evidence in revision request {request_path}"
        )
    arguments = [
        "diff",
        "--no-ext-diff",
        "--no-color",
        f"--unified={context_lines}",
        revision,
    ]
    if isinstance(target, str):
        arguments.append(target)
    arguments.extend(["--", path])
    patch = _select_diff_hunk(
        _git_bytes(arguments, project / "repository"), hunk, request_path
    )
    payload["baseRevision"] = revision
    payload["patchSha256"] = hashlib.sha256(patch).hexdigest()
    evidence["gitDiff"] = payload


def _select_diff_hunk(
    patch: bytes, hunk: dict[str, object], request_path: Path
) -> bytes:
    wanted = tuple(
        hunk.get(key) for key in ("oldStart", "oldLines", "newStart", "newLines")
    )
    if any(not isinstance(value, int) or isinstance(value, bool) for value in wanted):
        raise PlaygroundError(f"invalid Git hunk in revision request {request_path}")
    lines = patch.removesuffix(b"\n").split(b"\n")
    preamble_end: int | None = None
    selected_start: int | None = None
    selected_end = len(lines)
    for index, line in enumerate(lines):
        match = HUNK_HEADER.match(line)
        if match is None:
            continue
        if preamble_end is None:
            preamble_end = index
        if selected_start is not None:
            selected_end = index
            break
        observed = (
            int(match.group(1)),
            1 if match.group(2) is None else int(match.group(2)),
            int(match.group(3)),
            1 if match.group(4) is None else int(match.group(4)),
        )
        if observed == wanted:
            selected_start = index
    if preamble_end is None or selected_start is None:
        raise PlaygroundError(
            f"Git evidence hunk is missing in revision request {request_path}"
        )
    return (
        b"\n".join([*lines[:preamble_end], *lines[selected_start:selected_end]]) + b"\n"
    )


def _install_file_identity(
    project: Path,
    kind: Literal["json", "text"],
    evidence: dict[str, object],
    request_path: Path,
) -> None:
    payload = _string_map(evidence.get(kind))
    if payload is None or payload.get("sourceSha256") != ZERO_SHA256:
        raise PlaygroundError(
            f"file evidence placeholder is invalid in revision request {request_path}"
        )
    relative = payload.get("path")
    if not isinstance(relative, str):
        raise PlaygroundError(
            f"invalid file evidence in revision request {request_path}"
        )
    evidence_path = Path(relative)
    _require_regular_path(project, evidence_path, "playground evidence")
    try:
        content = (project / evidence_path).read_bytes()
    except OSError as error:
        raise PlaygroundError(
            f"cannot read file evidence in revision request {request_path}"
        ) from error
    payload["sourceSha256"] = hashlib.sha256(content).hexdigest()
    evidence[kind] = payload


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
            document = json.loads((root / relative).read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PlaygroundError(
                f"playground fixture file is unreadable: {relative}"
            ) from error
        revisions, digests = _placeholder_counts(document)
        if revisions != 1:
            raise PlaygroundError(
                f"playground fixture base placeholder is invalid: {relative}"
            )
        if digests != 3:
            raise PlaygroundError(
                f"playground fixture evidence placeholders are invalid: {relative}"
            )


def _validate_project(root: Path, label: str) -> None:
    _require_directory(root, label)
    for relative in PROJECT_FILES:
        _require_regular_path(root, relative, label)
    for relative in REVISION_REQUESTS:
        try:
            document = json.loads((root / relative).read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PlaygroundError(f"{label} file is unreadable: {relative}") from error
        revisions, digests = _placeholder_counts(document)
        if revisions != 0:
            raise PlaygroundError(
                f"{label} has an unresolved base revision: {relative}"
            )
        if digests != 0:
            raise PlaygroundError(
                f"{label} has an unresolved evidence identity: {relative}"
            )
    revision = _git_output(("rev-parse", "HEAD"), root / "repository")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise PlaygroundError(f"{label} has an invalid evidence repository")
    if not _git_output(
        ("status", "--porcelain", "--untracked-files=no"), root / "repository"
    ):
        raise PlaygroundError(f"{label} evidence repository has no submitted changes")


def _placeholder_counts(document: object) -> tuple[int, int]:
    document_map = _string_map(document)
    evidence_values = (
        None if document_map is None else _object_list(document_map.get("evidence"))
    )
    if evidence_values is None:
        return -1, -1
    revisions = 0
    digests = 0
    for evidence_value in evidence_values:
        evidence = _string_map(evidence_value)
        if evidence is None:
            continue
        kind = evidence.get("kind")
        payload = _string_map(evidence.get(kind)) if isinstance(kind, str) else None
        if payload is None:
            continue
        if kind == "gitDiff":
            revisions += int(payload.get("baseRevision") == ZERO_REVISION)
            digests += int(payload.get("patchSha256") == ZERO_SHA256)
        elif kind in {"text", "json"}:
            digests += int(payload.get("sourceSha256") == ZERO_SHA256)
    return revisions, digests


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


def _git_bytes(arguments: Sequence[str], repository: Path) -> bytes:
    git = shutil.which("git")
    if git is None:
        raise PlaygroundError("git is required")
    environment = os.environ.copy()
    environment.update(GIT_ENVIRONMENT)
    try:
        completed = subprocess.run(
            [git, "-c", "core.autocrlf=false", *arguments],
            cwd=repository,
            env=environment,
            check=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise PlaygroundError(
            f"evidence repository command failed: git {arguments[0]}"
        ) from error
    return completed.stdout


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
