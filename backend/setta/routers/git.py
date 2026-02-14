from pathlib import Path

from fastapi import HTTPException, status

from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.git import (
    GetGitCommitDetailsRequest,
    GetGitCommitDetailsResponse,
    GetGitCommitFileDiffRequest,
    GetGitCommitFileDiffResponse,
    GetGitDiffRequest,
    GetGitDiffResponse,
    GetGitLogRequest,
    GetGitLogResponse,
    GetGitStatusResponse,
    GitCommit,
    GitCommitChangedFile,
    GitRepoInfoResponse,
    GitStatusEntry,
)
from setta.types.routes import Route
from setta.utils.git import get_workspace_repo_root, run_git
from setta.utils.paths import get_setta_paths

router = SettaAPIRouter()

_STATUS_TIMEOUT_S = 2.0
_DIFF_TIMEOUT_S = 4.0
_LOG_TIMEOUT_S = 3.0
_SHOW_TIMEOUT_S = 4.0

_MAX_STATUS_BYTES = 2_000_000
_MAX_DIFF_BYTES = 2_000_000
_MAX_LOG_BYTES = 4_000_000
_MAX_SHOW_BYTES = 2_000_000

_MAX_LOG_COUNT = 5000
_MAX_LOG_PAGE_SIZE = 500

_DECORATION_SEP = "\x1d"
_LOG_METADATA_FIELD_COUNT = 7
_COMMIT_METADATA_FIELD_COUNT = 10

_PATH_CHECK_TIMEOUT_S = 1.5


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


def _normalize_repo_relative_path(raw_path: str) -> str:
    if raw_path == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing path.",
        )
    if "\x00" in raw_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid path.",
        )
    candidate = Path(raw_path)
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
    # Normalize to forward slashes for display + API roundtrips.
    return candidate.as_posix()


def _git_pathspec_is_directory(
    repo_root: Path, *, rel_path: str, commitish: str
) -> bool:
    result = run_git(
        [
            "--literal-pathspecs",
            "ls-tree",
            "-z",
            "-d",
            "--name-only",
            commitish,
            "--",
            rel_path,
        ],
        cwd=repo_root,
        timeout_s=_PATH_CHECK_TIMEOUT_S,
        max_stdout_bytes=4096,
        max_stderr_bytes=8192,
    )
    if result.returncode != 0:
        return False
    tokens = result.stdout.split("\0")
    return any(token == rel_path for token in tokens if token)


def _assert_single_file_pathspec(
    repo_root: Path,
    *,
    raw_path: str,
    rel_path: str,
    commitish: str | None = None,
) -> None:
    if rel_path == "." or raw_path.endswith("/") or raw_path.endswith("\\"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must point to a file.",
        )

    if commitish:
        if _git_pathspec_is_directory(
            repo_root, rel_path=rel_path, commitish=commitish
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Path must point to a file.",
            )
        return

    candidate_abs = repo_root / Path(rel_path)
    if candidate_abs.exists() and candidate_abs.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must point to a file.",
        )

    if _git_pathspec_is_directory(repo_root, rel_path=rel_path, commitish="HEAD"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must point to a file.",
        )


def _resolve_path_for_untracked_synth(repo_root: Path, rel_path: str) -> Path:
    candidate_abs = repo_root / Path(rel_path)
    if candidate_abs.is_symlink():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Symlink paths are not supported for synthesized diffs.",
        )
    resolved_root = repo_root.resolve(strict=False)
    resolved_candidate = candidate_abs.resolve(strict=False)
    if not resolved_candidate.is_relative_to(resolved_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Path must be within the repo root.",
        )
    return resolved_candidate


def _get_head_ref_info(repo_root: Path) -> tuple[str | None, str | None]:
    # Use one git process to resolve both branch name and HEAD commit hash.
    result = run_git(
        ["rev-parse", "--abbrev-ref", "HEAD", "HEAD"],
        cwd=repo_root,
        timeout_s=1.5,
        max_stdout_bytes=256,
        max_stderr_bytes=4096,
    )
    if result.returncode != 0:
        return None, None
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        return None, None
    branch = lines[0]
    head_branch = None if branch == "HEAD" else branch
    head_commit = lines[1] if len(lines) > 1 else None
    return head_branch, head_commit


def _get_head_branch(repo_root: Path) -> str | None:
    head_branch, _head_commit = _get_head_ref_info(repo_root)
    return head_branch


def _git_log_error_is_invalid_revision(stderr: str) -> bool:
    lowered = stderr.lower()
    return (
        "ambiguous argument" in lowered
        or "bad revision" in lowered
        or "unknown revision or path not in the working tree" in lowered
        or "invalid object name" in lowered
        or "needed a single revision" in lowered
    )


def _verify_log_revision_or_400(repo_root: Path, rev: str) -> None:
    verify_rev = run_git(
        ["rev-parse", "--verify", "--quiet", "--end-of-options", rev],
        cwd=repo_root,
        timeout_s=1.5,
        max_stdout_bytes=256,
        max_stderr_bytes=4096,
    )
    if verify_rev.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out verifying revision.",
        )
    if verify_rev.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid revision: {rev}",
        )


def _build_repo_info(repo_root: Path | None) -> GitRepoInfoResponse:
    if repo_root is None:
        return GitRepoInfoResponse(isGitRepo=False)
    head_branch, head_commit = _get_head_ref_info(repo_root)
    return GitRepoInfoResponse(
        isGitRepo=True,
        repoRoot=str(repo_root),
        headBranch=head_branch,
        headCommit=head_commit,
    )


def _resolve_commit_hash(repo_root: Path, raw_commit_hash: str) -> str:
    commit_hash = raw_commit_hash.strip()
    if not commit_hash or commit_hash.startswith("-") or "\x00" in commit_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid commit hash.",
        )

    verify = run_git(
        [
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            f"{commit_hash}^{{commit}}",
        ],
        cwd=repo_root,
        timeout_s=1.5,
        max_stdout_bytes=256,
        max_stderr_bytes=4096,
    )
    if verify.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out verifying commit hash.",
        )

    resolved = verify.stdout.strip()
    if verify.returncode != 0 or not resolved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid commit hash.",
        )
    return resolved


def _parse_git_show_raw_and_numstat_z(
    diff_payload: str,
) -> tuple[list[tuple[str, str | None, str]], dict[str, tuple[int | None, int | None]]]:
    payload = diff_payload.lstrip("\r\n")
    tokens = payload.split("\0")
    if tokens and tokens[-1] == "":
        tokens.pop()

    raw_changed_files: list[tuple[str, str | None, str]] = []
    i = 0
    while i < len(tokens):
        header = tokens[i]
        if not header or not header.startswith(":"):
            break
        i += 1
        header_parts = header.split()
        if not header_parts:
            continue
        status_code = header_parts[-1].strip()
        if not status_code:
            continue

        old_path: str | None = None
        new_path: str | None = None
        if status_code.startswith(("R", "C")):
            if i + 1 >= len(tokens):
                break
            old_path = tokens[i] or None
            new_path = tokens[i + 1] or None
            i += 2
        else:
            if i >= len(tokens):
                break
            new_path = tokens[i] or None
            i += 1

        if not new_path:
            continue
        raw_changed_files.append((new_path, old_path, status_code))

    stats_by_new_path: dict[str, tuple[int | None, int | None]] = {}
    while i < len(tokens):
        token = tokens[i]
        i += 1
        if not token:
            continue

        first_tab = token.find("\t")
        if first_tab == -1:
            continue
        second_tab = token.find("\t", first_tab + 1)
        if second_tab == -1:
            continue

        additions_text = token[:first_tab]
        deletions_text = token[first_tab + 1 : second_tab]
        path_or_marker = token[second_tab + 1 :]
        if not (
            (additions_text.isdigit() or additions_text == "-")
            and (deletions_text.isdigit() or deletions_text == "-")
        ):
            continue

        additions = int(additions_text) if additions_text.isdigit() else None
        deletions = int(deletions_text) if deletions_text.isdigit() else None

        new_path: str | None = None
        if path_or_marker:
            new_path = path_or_marker
        else:
            # `git show --numstat -z` emits renames/copies as:
            # `<add>\t<del>\t\0<old-path>\0<new-path>\0`
            if i + 1 >= len(tokens):
                continue
            _old_path = tokens[i]
            new_path = tokens[i + 1] or None
            i += 2

        if not new_path:
            continue
        stats_by_new_path[new_path] = (additions, deletions)

    return raw_changed_files, stats_by_new_path


def _trim_to_last_complete_nul_record(output: str) -> str:
    if not output:
        return ""
    last_nul = output.rfind("\0")
    if last_nul == -1:
        return ""
    return output[: last_nul + 1]


def _parse_nul_delimited_fields(
    output: str, *, field_count: int
) -> tuple[list[str], str] | None:
    fields: list[str] = []
    cursor = 0
    for _ in range(field_count):
        sep_idx = output.find("\0", cursor)
        if sep_idx == -1:
            return None
        fields.append(output[cursor:sep_idx])
        cursor = sep_idx + 1
    return fields, output[cursor:]


def _parse_porcelain_head_branch(output: str) -> str | None:
    tokens = output.split("\0")
    for token in tokens:
        if not token.startswith("# branch.head "):
            continue
        branch = token.removeprefix("# branch.head ").strip()
        if branch in {"", "(detached)", "(unknown)", "HEAD", "HEAD (no branch)"}:
            return None
        return branch
    return None


def _parse_porcelain_head_commit(output: str) -> str | None:
    tokens = output.split("\0")
    for token in tokens:
        if not token.startswith("# branch.oid "):
            continue
        head_commit = token.removeprefix("# branch.oid ").strip()
        if head_commit in {"", "(initial)", "(unknown)"}:
            return None
        return head_commit
    return None


def _parse_porcelain_status(output: str) -> list[GitStatusEntry]:
    # `git status --porcelain=v2 -z --branch` returns NUL-delimited records.
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
        if token.startswith("# "):
            continue

        old_path: str | None = None
        index_status: str | None = None
        worktree_status: str | None = None
        path: str | None = None

        if token.startswith("1 "):
            parts = token.split(" ", 8)
            if len(parts) != 9:
                continue
            status_pair = parts[1]
            path = parts[8]
            if len(status_pair) != 2:
                continue
            index_status = status_pair[0]
            worktree_status = status_pair[1]
        elif token.startswith("2 "):
            parts = token.split(" ", 9)
            if len(parts) != 10:
                continue
            status_pair = parts[1]
            path = parts[9]
            if len(status_pair) != 2:
                continue
            index_status = status_pair[0]
            worktree_status = status_pair[1]
            if i < len(tokens):
                old_path = tokens[i] or None
                i += 1
        elif token.startswith("u "):
            parts = token.split(" ", 10)
            if len(parts) != 11:
                continue
            status_pair = parts[1]
            path = parts[10]
            if len(status_pair) != 2:
                continue
            index_status = status_pair[0]
            worktree_status = status_pair[1]
        elif token.startswith("? "):
            entries.append(
                GitStatusEntry(
                    path=token[2:],
                    oldPath=None,
                    indexStatus="?",
                    worktreeStatus="?",
                    kind="untracked",
                )
            )
            continue
        else:
            continue

        if path is None or index_status is None or worktree_status is None:
            continue

        status_pair = f"{index_status}{worktree_status}"

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
        if index_status != ".":
            entries.append(
                GitStatusEntry(
                    path=path,
                    oldPath=old_path,
                    indexStatus=index_status,
                    worktreeStatus=worktree_status,
                    kind="staged",
                )
            )
        if worktree_status != ".":
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


def _parse_commit_metadata_parts(
    output: str,
) -> tuple[tuple[str, str, str, str, str, str, str, str, str, str], str] | None:
    parsed = _parse_nul_delimited_fields(
        output.lstrip("\r\n"), field_count=_COMMIT_METADATA_FIELD_COUNT
    )
    if parsed is None:
        return None
    fields, remainder = parsed
    return (
        (
            fields[0],
            fields[1],
            fields[2],
            fields[3],
            fields[4],
            fields[5],
            fields[6],
            fields[7],
            fields[8],
            fields[9],
        ),
        remainder,
    )


def _load_commit_metadata_without_diff(
    repo_root: Path, *, commit_hash: str, fmt: str
) -> tuple[str, str, str, str, str, str, str, str, str, str] | None:
    metadata_res = run_git(
        [
            "show",
            "--no-color",
            f"--pretty=format:{fmt}",
            "--no-ext-diff",
            "--no-textconv",
            "--no-patch",
            commit_hash,
            "--",
        ],
        cwd=repo_root,
        timeout_s=_SHOW_TIMEOUT_S,
        max_stdout_bytes=_MAX_SHOW_BYTES,
        max_stderr_bytes=200_000,
    )
    if metadata_res.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out loading commit metadata.",
        )
    if metadata_res.returncode != 0 and not metadata_res.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=metadata_res.stderr.strip() or "Unknown commit hash.",
        )
    parsed = _parse_commit_metadata_parts(metadata_res.stdout)
    if parsed is None:
        return None
    parts, _remainder = parsed
    return parts


def _probe_history_beyond_cap(repo_root: Path, *, all_refs: bool, rev: str) -> bool:
    cap_probe_args = [
        "log",
        "--topo-order",
        f"--skip={_MAX_LOG_COUNT}",
        "--max-count=1",
        "--no-color",
        "--pretty=format:%H",
    ]
    if all_refs:
        cap_probe_args.append("--all")
    else:
        cap_probe_args.append(rev)
    cap_probe = run_git(
        cap_probe_args,
        cwd=repo_root,
        timeout_s=_LOG_TIMEOUT_S,
        max_stdout_bytes=512,
        max_stderr_bytes=200_000,
    )
    return (
        not cap_probe.timed_out
        and cap_probe.returncode == 0
        and bool(cap_probe.stdout.strip())
    )


@router.post(Route.GET_GIT_STATUS)
def route_get_git_status(
    ctx: RuntimeContextFromRequest,
) -> GetGitStatusResponse:
    repo_root = _get_repo_root_or_none(ctx=ctx)
    if repo_root is None:
        return GetGitStatusResponse(
            repo=_build_repo_info(None), entries=[], isTruncated=False
        )

    result = run_git(
        ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
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

    status_output = result.stdout
    if result.stdout_truncated or (status_output and not status_output.endswith("\0")):
        status_output = _trim_to_last_complete_nul_record(status_output)

    entries = _parse_porcelain_status(status_output)
    head_branch = _parse_porcelain_head_branch(status_output)
    head_commit = _parse_porcelain_head_commit(status_output)
    return GetGitStatusResponse(
        repo=GitRepoInfoResponse(
            isGitRepo=True,
            repoRoot=str(repo_root),
            headBranch=head_branch,
            headCommit=head_commit,
        ),
        entries=entries,
        isTruncated=result.stdout_truncated,
    )


def _is_untracked_path(repo_root: Path, rel_path: str) -> bool:
    result = run_git(
        [
            "--literal-pathspecs",
            "ls-files",
            "--others",
            "--exclude-standard",
            "--",
            rel_path,
        ],
        cwd=repo_root,
        timeout_s=1.5,
        max_stdout_bytes=8192,
        max_stderr_bytes=8192,
    )
    if result.returncode != 0:
        return False
    return bool(result.stdout.strip())


def _synthesize_untracked_diff(*, rel_path: str, abs_path: Path) -> tuple[str, bool]:
    if not abs_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Path must point to a regular file: {rel_path}",
        )

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
    with abs_path.open("rb") as f:
        data = f.read(max_bytes + 1)
    if len(data) > max_bytes:
        data = data[:max_bytes]
        is_truncated = True
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
    rel_path = _normalize_repo_relative_path(x.path)
    _assert_single_file_pathspec(repo_root, raw_path=x.path, rel_path=rel_path)
    rel_old_path: str | None = None
    if x.oldPath:
        rel_old_path = _normalize_repo_relative_path(x.oldPath)
        _assert_single_file_pathspec(
            repo_root,
            raw_path=x.oldPath,
            rel_path=rel_old_path,
        )

    diff_paths = [rel_path]
    if rel_old_path and rel_old_path != rel_path:
        diff_paths = [rel_old_path, rel_path]
    if x.mode == "staged":
        args = [
            "--literal-pathspecs",
            "diff",
            "--cached",
            "--no-color",
            "--patch",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            *diff_paths,
        ]
    else:
        args = [
            "--literal-pathspecs",
            "diff",
            "--no-color",
            "--patch",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            *diff_paths,
        ]

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
            abs_path = _resolve_path_for_untracked_synth(repo_root, rel_path)
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
    offset = max(0, int(x.offset))
    page_size = max(1, min(int(x.pageSize), _MAX_LOG_PAGE_SIZE))
    rev = x.rev.strip()
    if not x.allRefs:
        if not rev:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing revision.",
            )
        if rev.startswith("-") or "\x00" in rev:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid revision.",
            )
        if rev != "HEAD":
            _verify_log_revision_or_400(repo_root, rev)

    head_branch = _get_head_branch(repo_root) if offset == 0 else None

    if offset >= _MAX_LOG_COUNT:
        is_capped = _probe_history_beyond_cap(repo_root, all_refs=x.allRefs, rev=rev)
        return GetGitLogResponse(
            repoRoot=str(repo_root),
            headBranch=head_branch,
            commits=[],
            offset=offset,
            pageSize=page_size,
            nextOffset=None,
            hasMore=False,
            isCapped=is_capped,
        )

    remaining_budget = _MAX_LOG_COUNT - offset
    fetch_count = min(page_size + 1, remaining_budget)

    if not x.allRefs and offset == 0 and rev == "HEAD":
        verify_head = run_git(
            ["rev-parse", "--verify", "--quiet", "HEAD"],
            cwd=repo_root,
            timeout_s=1.5,
            max_stdout_bytes=256,
            max_stderr_bytes=4096,
        )
        if verify_head.timed_out:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Timed out verifying HEAD.",
            )
        if verify_head.returncode != 0:
            return GetGitLogResponse(
                repoRoot=str(repo_root),
                headBranch=head_branch,
                commits=[],
                offset=offset,
                pageSize=page_size,
                nextOffset=None,
                hasMore=False,
                isCapped=False,
            )

    fmt = (
        "%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00"
        "%(decorate:prefix=,suffix=,separator=%x1d)%x00"
    )

    args = [
        "log",
        "--topo-order",
        f"--skip={offset}",
        f"--max-count={fetch_count}",
        "--no-color",
        "-z",
        f"--pretty=format:{fmt}",
    ]
    if x.allRefs:
        args.append("--all")
    else:
        args.append(rev)

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
        stderr = result.stderr.strip() or "unknown error"
        if not x.allRefs and _git_log_error_is_invalid_revision(stderr):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid revision: {rev}",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"git log failed: {stderr}",
        )

    commits: list[GitCommit] = []
    remaining_log_output = result.stdout.lstrip("\r\n")
    while remaining_log_output:
        parsed = _parse_nul_delimited_fields(
            remaining_log_output, field_count=_LOG_METADATA_FIELD_COUNT
        )
        if parsed is None:
            break
        parts, remaining_log_output = parsed
        if remaining_log_output.startswith("\0"):
            # `git log -z` adds an additional record separator NUL between commits.
            remaining_log_output = remaining_log_output[1:]
        remaining_log_output = remaining_log_output.lstrip("\r\n")

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
            for item in decorations_raw.split(_DECORATION_SEP):
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

    has_more = len(commits) > page_size or result.stdout_truncated
    if len(commits) > page_size:
        commits = commits[:page_size]
    if has_more and not commits:
        # Prevent infinite pagination loops when output is truncated before a full record.
        has_more = False

    is_capped = False
    at_cap_boundary = offset + len(commits) >= _MAX_LOG_COUNT
    if at_cap_boundary:
        is_capped = _probe_history_beyond_cap(repo_root, all_refs=x.allRefs, rev=rev)
        if is_capped:
            has_more = False

    next_offset = offset + len(commits) if has_more else None

    return GetGitLogResponse(
        repoRoot=str(repo_root),
        headBranch=head_branch,
        commits=commits,
        offset=offset,
        pageSize=page_size,
        nextOffset=next_offset,
        hasMore=has_more,
        isCapped=is_capped,
    )


@router.post(Route.GET_GIT_COMMIT_DETAILS)
def route_get_git_commit_details(
    x: GetGitCommitDetailsRequest,
    ctx: RuntimeContextFromRequest,
) -> GetGitCommitDetailsResponse:
    repo_root = _get_repo_root_or_400(ctx=ctx)
    commit_hash = _resolve_commit_hash(repo_root, x.commitHash)

    fmt = "%H%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%s%x00%b%x00"
    show_res = run_git(
        [
            "show",
            "--no-color",
            f"--pretty=format:{fmt}",
            "--no-ext-diff",
            "--no-textconv",
            "--raw",
            "--numstat",
            "-z",
            commit_hash,
            "--",
        ],
        cwd=repo_root,
        timeout_s=_SHOW_TIMEOUT_S,
        max_stdout_bytes=_MAX_SHOW_BYTES,
        max_stderr_bytes=200_000,
    )
    if show_res.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out loading commit details.",
        )
    if show_res.returncode != 0 and not show_res.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=show_res.stderr.strip() or "Unknown commit hash.",
        )

    parsed = _parse_commit_metadata_parts(show_res.stdout)
    parts = parsed[0] if parsed is not None else None
    diff_payload = parsed[1] if parsed is not None else ""
    if parts is None and show_res.stdout_truncated:
        parts = _load_commit_metadata_without_diff(
            repo_root,
            commit_hash=commit_hash,
            fmt=fmt,
        )
        diff_payload = ""
    if parts is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse commit metadata.",
        )

    (
        _commit_hash,
        parents_raw,
        author_name,
        author_email,
        author_time_s,
        committer_name,
        committer_email,
        committer_time_s,
        subject,
        body,
    ) = parts

    parents = [p for p in parents_raw.split(" ") if p]
    try:
        author_time_ms = int(author_time_s) * 1000
    except ValueError:
        author_time_ms = 0
    try:
        committer_time_ms = int(committer_time_s) * 1000
    except ValueError:
        committer_time_ms = 0

    raw_changed_files, stats_by_new_path = _parse_git_show_raw_and_numstat_z(
        diff_payload
    )

    changed_files: list[GitCommitChangedFile] = []
    for new_path, old_path, status_code in raw_changed_files:
        additions, deletions = stats_by_new_path.get(new_path, (None, None))
        changed_files.append(
            GitCommitChangedFile(
                path=new_path,
                oldPath=old_path,
                status=status_code,
                additions=additions,
                deletions=deletions,
            )
        )

    changed_files.sort(key=lambda f: f.path)

    return GetGitCommitDetailsResponse(
        repoRoot=str(repo_root),
        commitHash=commit_hash,
        parents=parents,
        authorName=author_name,
        authorEmail=author_email,
        authorTimeMs=author_time_ms,
        committerName=committer_name,
        committerEmail=committer_email,
        committerTimeMs=committer_time_ms,
        subject=subject,
        body=body.rstrip("\n"),
        files=changed_files,
        isTruncated=show_res.stdout_truncated,
    )


@router.post(Route.GET_GIT_COMMIT_FILE_DIFF)
def route_get_git_commit_file_diff(
    x: GetGitCommitFileDiffRequest,
    ctx: RuntimeContextFromRequest,
) -> GetGitCommitFileDiffResponse:
    repo_root = _get_repo_root_or_400(ctx=ctx)
    commit_hash = _resolve_commit_hash(repo_root, x.commitHash)

    rel_path = _normalize_repo_relative_path(x.path)
    _assert_single_file_pathspec(
        repo_root,
        raw_path=x.path,
        rel_path=rel_path,
        commitish=commit_hash,
    )
    rel_old_path: str | None = None
    if x.oldPath:
        rel_old_path = _normalize_repo_relative_path(x.oldPath)
        _assert_single_file_pathspec(
            repo_root,
            raw_path=x.oldPath,
            rel_path=rel_old_path,
            commitish=commit_hash,
        )

    args = [
        "--literal-pathspecs",
        "show",
        "--no-color",
        "--patch",
        "--no-ext-diff",
        "--no-textconv",
        "--format=",
        commit_hash,
        "--",
    ]
    if rel_old_path and rel_old_path != rel_path:
        args.extend([rel_old_path, rel_path])
    else:
        args.append(rel_path)

    result = run_git(
        args,
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
    if not result.stdout_truncated and not result.stdout.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File is not part of this commit diff.",
        )

    return GetGitCommitFileDiffResponse(
        repoRoot=str(repo_root),
        commitHash=commit_hash,
        path=rel_path,
        diff=result.stdout,
        isTruncated=result.stdout_truncated,
    )
