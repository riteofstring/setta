import re
from pathlib import Path

from fastapi import HTTPException, status

from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.git import (
    GetGitCommitDiffRequest,
    GetGitCommitDiffResponse,
    GetGitDiffRequest,
    GetGitDiffResponse,
    GetGitLogRequest,
    GetGitLogResponse,
    GetGitStatusResponse,
    GitCommit,
    GitRepoInfoResponse,
    GitStatusEntry,
)
from setta.types.routes import Route
from setta.utils.git import get_workspace_repo_root, run_git
from setta.utils.paths import get_setta_paths

router = SettaAPIRouter()

_COMMIT_HASH_RE = re.compile(r"^[0-9a-fA-F]{4,40}$")

_STATUS_TIMEOUT_S = 2.0
_DIFF_TIMEOUT_S = 4.0
_LOG_TIMEOUT_S = 3.0
_SHOW_TIMEOUT_S = 4.0

_MAX_STATUS_BYTES = 2_000_000
_MAX_DIFF_BYTES = 2_000_000
_MAX_LOG_BYTES = 4_000_000
_MAX_SHOW_BYTES = 2_000_000

_MAX_LOG_COUNT = 5000


def _require_ide_mode(ctx: RuntimeContextFromRequest) -> None:
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Git features are disabled in deployment mode.",
        )


def _get_repo_root_or_none(*, ctx: RuntimeContextFromRequest) -> Path | None:
    _require_ide_mode(ctx)
    workspace_root = get_setta_paths().workspace_root
    return get_workspace_repo_root(workspace_root)


def _get_repo_root_or_400(*, ctx: RuntimeContextFromRequest) -> Path:
    repo_root = _get_repo_root_or_none(ctx=ctx)
    if repo_root is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current workspace is not a git repository.",
        )
    return repo_root


def _resolve_repo_relative_path(repo_root: Path, raw_path: str) -> tuple[str, Path]:
    trimmed = raw_path.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing path.",
        )
    candidate = Path(trimmed)
    if candidate.is_absolute():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must be repo-relative.",
        )
    if ".." in candidate.parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must not contain '..'.",
        )
    resolved = (repo_root / candidate).resolve(strict=False)
    if not resolved.is_relative_to(repo_root.resolve(strict=False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Path must be within the repo root.",
        )
    # Normalize to forward slashes for display + API roundtrips.
    normalized_rel = candidate.as_posix()
    return normalized_rel, resolved


def _get_head_commit(repo_root: Path) -> str | None:
    result = run_git(
        ["rev-parse", "HEAD"],
        cwd=repo_root,
        timeout_s=1.5,
        max_stdout_bytes=128,
        max_stderr_bytes=4096,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def _get_head_branch(repo_root: Path) -> str | None:
    result = run_git(
        ["symbolic-ref", "--short", "HEAD"],
        cwd=repo_root,
        timeout_s=1.5,
        max_stdout_bytes=512,
        max_stderr_bytes=4096,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def _build_repo_info(repo_root: Path | None) -> GitRepoInfoResponse:
    if repo_root is None:
        return GitRepoInfoResponse(isGitRepo=False)
    return GitRepoInfoResponse(
        isGitRepo=True,
        repoRoot=str(repo_root),
        headBranch=_get_head_branch(repo_root),
        headCommit=_get_head_commit(repo_root),
    )


@router.post(Route.GET_GIT_REPO_INFO)
def route_get_git_repo_info(
    ctx: RuntimeContextFromRequest,
) -> GitRepoInfoResponse:
    repo_root = _get_repo_root_or_none(ctx=ctx)
    return _build_repo_info(repo_root)


def _parse_porcelain_status(output: str) -> list[GitStatusEntry]:
    # `git status --porcelain -z` returns NUL-delimited records.
    # Normal record: "XY <path>"
    # Rename/copy: "R? <new_path>\\0<old_path>" (same for C?)
    tokens = output.split("\0")
    if tokens and tokens[-1] == "":
        tokens.pop()

    entries: list[GitStatusEntry] = []
    i = 0
    while i < len(tokens):
        token = tokens[i]
        i += 1
        if not token:
            continue
        if len(token) < 4:
            continue
        index_status = token[0]
        worktree_status = token[1]
        # token[2] is expected to be a space.
        path = token[3:]
        old_path: str | None = None

        if index_status in {"R", "C"} and i < len(tokens):
            old_path = tokens[i] or None
            i += 1

        status_pair = f"{index_status}{worktree_status}"

        if status_pair == "??":
            entries.append(
                GitStatusEntry(
                    path=path,
                    oldPath=old_path,
                    indexStatus=index_status,
                    worktreeStatus=worktree_status,
                    kind="untracked",
                )
            )
            continue

        is_conflict = "U" in status_pair or status_pair in {
            "DD",
            "AU",
            "UD",
            "UA",
            "DU",
            "AA",
        }
        if is_conflict:
            entries.append(
                GitStatusEntry(
                    path=path,
                    oldPath=old_path,
                    indexStatus=index_status,
                    worktreeStatus=worktree_status,
                    kind="conflict",
                )
            )
            continue

        # Match VS Code: show staged and unstaged entries separately if both exist.
        if index_status != " ":
            entries.append(
                GitStatusEntry(
                    path=path,
                    oldPath=old_path,
                    indexStatus=index_status,
                    worktreeStatus=worktree_status,
                    kind="staged",
                )
            )
        if worktree_status != " ":
            entries.append(
                GitStatusEntry(
                    path=path,
                    oldPath=old_path,
                    indexStatus=index_status,
                    worktreeStatus=worktree_status,
                    kind="unstaged",
                )
            )

    return entries


@router.post(Route.GET_GIT_STATUS)
def route_get_git_status(
    ctx: RuntimeContextFromRequest,
) -> GetGitStatusResponse:
    repo_root = _get_repo_root_or_none(ctx=ctx)
    if repo_root is None:
        return GetGitStatusResponse(repo=_build_repo_info(None), entries=[])

    result = run_git(
        ["status", "--porcelain", "-z", "--untracked-files=all"],
        cwd=repo_root,
        timeout_s=_STATUS_TIMEOUT_S,
        max_stdout_bytes=_MAX_STATUS_BYTES,
        max_stderr_bytes=200_000,
    )
    if result.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out running git status.",
        )
    if result.returncode != 0 and not result.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"git status failed: {result.stderr.strip() or 'unknown error'}",
        )

    entries = _parse_porcelain_status(result.stdout)
    return GetGitStatusResponse(repo=_build_repo_info(repo_root), entries=entries)


def _is_untracked_path(repo_root: Path, rel_path: str) -> bool:
    result = run_git(
        ["ls-files", "--others", "--exclude-standard", "--", rel_path],
        cwd=repo_root,
        timeout_s=1.5,
        max_stdout_bytes=8192,
        max_stderr_bytes=8192,
    )
    if result.returncode != 0:
        return False
    return bool(result.stdout.strip())


def _synthesize_untracked_diff(*, rel_path: str, abs_path: Path) -> tuple[str, bool]:
    # Avoid expensive diffs for huge files.
    try:
        size = abs_path.stat().st_size
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {rel_path}",
        ) from None

    # Limit how much we read when synthesizing.
    max_bytes = _MAX_DIFF_BYTES
    is_truncated = size > max_bytes
    data = abs_path.read_bytes()[:max_bytes]
    if b"\x00" in data:
        return (
            "\n".join(
                [
                    f"diff --git a/{rel_path} b/{rel_path}",
                    "GIT binary patch",
                    "(binary file, diff omitted)",
                    "",
                ]
            ),
            is_truncated,
        )

    text = data.decode("utf-8", errors="replace")
    has_trailing_newline = text.endswith("\n")
    lines = text.splitlines()
    out: list[str] = [
        f"diff --git a/{rel_path} b/{rel_path}",
        "new file mode 100644",
        "--- /dev/null",
        f"+++ b/{rel_path}",
    ]
    if lines:
        out.append(f"@@ -0,0 +1,{len(lines)} @@")
        for line in lines:
            out.append(f"+{line}")
        if not has_trailing_newline:
            out.append("\\ No newline at end of file")
    out.append("")
    return "\n".join(out), is_truncated


@router.post(Route.GET_GIT_DIFF)
def route_get_git_diff(
    x: GetGitDiffRequest,
    ctx: RuntimeContextFromRequest,
) -> GetGitDiffResponse:
    repo_root = _get_repo_root_or_400(ctx=ctx)
    rel_path, abs_path = _resolve_repo_relative_path(repo_root, x.path)

    if x.mode == "staged":
        args = ["diff", "--cached", "--no-color", "--patch", "--", rel_path]
    else:
        args = ["diff", "--no-color", "--patch", "--", rel_path]

    result = run_git(
        args,
        cwd=repo_root,
        timeout_s=_DIFF_TIMEOUT_S,
        max_stdout_bytes=_MAX_DIFF_BYTES,
        max_stderr_bytes=200_000,
    )
    if result.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out running git diff.",
        )

    # `git diff` returns 1 when differences exist.
    if result.returncode not in {0, 1} and not result.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"git diff failed: {result.stderr.strip() or 'unknown error'}",
        )

    diff_text = result.stdout
    is_truncated = result.stdout_truncated

    if x.mode == "unstaged" and not diff_text.strip():
        if _is_untracked_path(repo_root, rel_path):
            diff_text, synth_truncated = _synthesize_untracked_diff(
                rel_path=rel_path,
                abs_path=abs_path,
            )
            is_truncated = is_truncated or synth_truncated

    return GetGitDiffResponse(
        repoRoot=str(repo_root),
        path=rel_path,
        mode=x.mode,
        diff=diff_text,
        isTruncated=is_truncated,
    )


@router.post(Route.GET_GIT_LOG)
def route_get_git_log(
    x: GetGitLogRequest,
    ctx: RuntimeContextFromRequest,
) -> GetGitLogResponse:
    repo_root = _get_repo_root_or_400(ctx=ctx)
    max_count = max(1, min(int(x.maxCount), _MAX_LOG_COUNT))

    # Use ASCII-safe separators to simplify parsing.
    record_sep = "\x1e"
    field_sep = "\x1f"
    fmt = f"%H{field_sep}%P{field_sep}%an{field_sep}%ae{field_sep}%at{field_sep}%s{field_sep}%D{record_sep}"

    args = [
        "log",
        "--topo-order",
        f"--max-count={max_count}",
        "--no-color",
        f"--pretty=format:{fmt}",
    ]
    if x.allRefs:
        args.append("--all")
    else:
        args.append(x.rev)

    result = run_git(
        args,
        cwd=repo_root,
        timeout_s=_LOG_TIMEOUT_S,
        max_stdout_bytes=_MAX_LOG_BYTES,
        max_stderr_bytes=200_000,
    )
    if result.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out running git log.",
        )
    if result.returncode != 0 and not result.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"git log failed: {result.stderr.strip() or 'unknown error'}",
        )

    commits: list[GitCommit] = []
    for raw_record in result.stdout.split(record_sep):
        if not raw_record:
            continue
        parts = raw_record.split(field_sep)
        if len(parts) != 7:
            continue
        (
            commit_hash,
            parents_raw,
            author_name,
            author_email,
            author_time_s,
            subject,
            decorations_raw,
        ) = parts

        parents = [p for p in parents_raw.split(" ") if p]
        try:
            author_time_ms = int(author_time_s) * 1000
        except ValueError:
            author_time_ms = 0
        decorations: list[str] = []
        if decorations_raw.strip():
            for item in decorations_raw.split(","):
                dec = item.strip()
                if dec:
                    decorations.append(dec)

        commits.append(
            GitCommit(
                hash=commit_hash,
                parents=parents,
                authorName=author_name,
                authorEmail=author_email,
                authorTimeMs=author_time_ms,
                subject=subject,
                decorations=decorations,
            )
        )

    return GetGitLogResponse(
        repoRoot=str(repo_root),
        headBranch=_get_head_branch(repo_root),
        commits=commits,
    )


@router.post(Route.GET_GIT_COMMIT_DIFF)
def route_get_git_commit_diff(
    x: GetGitCommitDiffRequest,
    ctx: RuntimeContextFromRequest,
) -> GetGitCommitDiffResponse:
    repo_root = _get_repo_root_or_400(ctx=ctx)
    commit_hash = x.commitHash.strip()
    if not _COMMIT_HASH_RE.match(commit_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid commit hash.",
        )

    result = run_git(
        ["show", "--no-color", "--patch", "--format=fuller", commit_hash, "--"],
        cwd=repo_root,
        timeout_s=_SHOW_TIMEOUT_S,
        max_stdout_bytes=_MAX_SHOW_BYTES,
        max_stderr_bytes=200_000,
    )
    if result.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out running git show.",
        )
    if result.returncode != 0 and not result.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.stderr.strip() or "Unknown commit hash.",
        )

    return GetGitCommitDiffResponse(
        repoRoot=str(repo_root),
        commitHash=commit_hash,
        diff=result.stdout,
        isTruncated=result.stdout_truncated,
    )
