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

_RECORD_SEP = "\x1e"
_FIELD_SEP = "\x1f"


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

        if (index_status in {"R", "C"} or worktree_status in {"R", "C"}) and i < len(
            tokens
        ):
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
        return GetGitStatusResponse(
            repo=_build_repo_info(None), entries=[], isTruncated=False
        )

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
    return GetGitStatusResponse(
        repo=_build_repo_info(repo_root),
        entries=entries,
        isTruncated=result.stdout_truncated,
    )


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
    rel_old_path: str | None = None
    if x.oldPath:
        rel_old_path = _normalize_repo_relative_path(x.oldPath)

    diff_paths = [rel_path]
    if rel_old_path and rel_old_path != rel_path:
        diff_paths = [rel_old_path, rel_path]
    if x.mode == "staged":
        args = ["diff", "--cached", "--no-color", "--patch", "--", *diff_paths]
    else:
        args = ["diff", "--no-color", "--patch", "--", *diff_paths]

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
    head_branch = _get_head_branch(repo_root) if offset == 0 else None

    if offset >= _MAX_LOG_COUNT:
        return GetGitLogResponse(
            repoRoot=str(repo_root),
            headBranch=head_branch,
            commits=[],
            offset=offset,
            pageSize=page_size,
            nextOffset=None,
            hasMore=False,
            isCapped=True,
        )

    remaining_budget = _MAX_LOG_COUNT - offset
    fetch_count = min(page_size + 1, remaining_budget)
    rev = x.rev.strip()
    if not x.allRefs:
        if not rev:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing revision.",
            )
        if rev.startswith("-"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid revision.",
            )

    # Use ASCII-safe separators to simplify parsing.
    record_sep = "\x1e"
    field_sep = "\x1f"
    fmt = f"%H{field_sep}%P{field_sep}%an{field_sep}%ae{field_sep}%at{field_sep}%s{field_sep}%D{record_sep}"

    args = [
        "log",
        "--topo-order",
        f"--skip={offset}",
        f"--max-count={fetch_count}",
        "--no-color",
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"git log failed: {result.stderr.strip() or 'unknown error'}",
        )

    commits: list[GitCommit] = []
    for raw_record in result.stdout.split(record_sep):
        # git log inserts newlines between records even when using a custom format.
        # Our record separator is ASCII 0x1e, and our field separator is 0x1f; both
        # are treated as whitespace by Python, so avoid `.strip()` here.
        raw_record = raw_record.lstrip("\r\n")
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

    has_more = len(commits) > page_size or result.stdout_truncated
    if len(commits) > page_size:
        commits = commits[:page_size]

    # If we reached the backend safety cap, check whether older commits exist
    # beyond the cap so UI can communicate that this is a cap, not true history end.
    is_capped = False
    at_cap_boundary = offset + len(commits) >= _MAX_LOG_COUNT
    if at_cap_boundary:
        cap_probe_args = [
            "log",
            "--topo-order",
            f"--skip={_MAX_LOG_COUNT}",
            "--max-count=1",
            "--no-color",
            "--pretty=format:%H",
        ]
        if x.allRefs:
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
        is_capped = (
            not cap_probe.timed_out
            and cap_probe.returncode == 0
            and bool(cap_probe.stdout.strip())
        )
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

    fmt = (
        f"%H{_FIELD_SEP}%P{_FIELD_SEP}%an{_FIELD_SEP}%ae{_FIELD_SEP}%at{_FIELD_SEP}"
        f"%cn{_FIELD_SEP}%ce{_FIELD_SEP}%ct{_FIELD_SEP}%s{_FIELD_SEP}%b{_RECORD_SEP}"
    )
    show_res = run_git(
        [
            "show",
            "--no-color",
            f"--pretty=format:{fmt}",
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

    raw_record, _sep, diff_payload = show_res.stdout.partition(_RECORD_SEP)
    raw_record = raw_record.lstrip("\r\n")
    parts = raw_record.split(_FIELD_SEP)
    if len(parts) != 10:
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
    )


@router.post(Route.GET_GIT_COMMIT_FILE_DIFF)
def route_get_git_commit_file_diff(
    x: GetGitCommitFileDiffRequest,
    ctx: RuntimeContextFromRequest,
) -> GetGitCommitFileDiffResponse:
    repo_root = _get_repo_root_or_400(ctx=ctx)
    commit_hash = _resolve_commit_hash(repo_root, x.commitHash)

    rel_path = _normalize_repo_relative_path(x.path)
    rel_old_path: str | None = None
    if x.oldPath:
        rel_old_path = _normalize_repo_relative_path(x.oldPath)

    args = ["show", "--no-color", "--patch", "--format=", commit_hash, "--"]
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

    return GetGitCommitFileDiffResponse(
        repoRoot=str(repo_root),
        commitHash=commit_hash,
        path=rel_path,
        diff=result.stdout,
        isTruncated=result.stdout_truncated,
    )
