import re
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


def _parse_git_numstat_path(path_text: str) -> tuple[str, str | None]:
    # `git show --numstat` may format renames using a brace shorthand, for example:
    # - `a.txt => b.txt`
    # - `{old => new}/file.txt`
    # - `src/{a => b}/c.txt`
    if "=>" not in path_text:
        return path_text, None

    if "{" in path_text and "}" in path_text:
        prefix, rest = path_text.split("{", 1)
        inside, suffix = rest.split("}", 1)
        if "=>" not in inside:
            return path_text, None
        old_part, new_part = inside.split("=>", 1)
        old_part = old_part.strip()
        new_part = new_part.strip()
        old_path = f"{prefix}{old_part}{suffix}"
        new_path = f"{prefix}{new_part}{suffix}"
        return new_path, old_path

    # Fallback: treat as a simple `old => new` string.
    pieces = path_text.split("=>", 1)
    if len(pieces) != 2:
        return path_text, None
    old_path = pieces[0].strip()
    new_path = pieces[1].strip()
    return new_path, old_path


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
    rel_old_path: str | None = None
    if x.oldPath:
        rel_old_path, _abs_old_path = _resolve_repo_relative_path(repo_root, x.oldPath)

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

    if offset >= _MAX_LOG_COUNT:
        return GetGitLogResponse(
            repoRoot=str(repo_root),
            headBranch=_get_head_branch(repo_root),
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
        headBranch=_get_head_branch(repo_root),
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
    commit_hash = x.commitHash.strip()
    if not _COMMIT_HASH_RE.match(commit_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid commit hash.",
        )

    fmt = (
        f"%H{_FIELD_SEP}%P{_FIELD_SEP}%an{_FIELD_SEP}%ae{_FIELD_SEP}%at{_FIELD_SEP}"
        f"%cn{_FIELD_SEP}%ce{_FIELD_SEP}%ct{_FIELD_SEP}%s{_FIELD_SEP}%b{_RECORD_SEP}"
    )
    meta = run_git(
        ["show", "--no-color", "-s", f"--pretty=format:{fmt}", commit_hash, "--"],
        cwd=repo_root,
        timeout_s=_SHOW_TIMEOUT_S,
        max_stdout_bytes=400_000,
        max_stderr_bytes=200_000,
    )
    if meta.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out loading commit details.",
        )
    if meta.returncode != 0 and not meta.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=meta.stderr.strip() or "Unknown commit hash.",
        )

    raw_record = meta.stdout.split(_RECORD_SEP)[0].lstrip("\r\n")
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

    name_status = run_git(
        ["show", "--no-color", "--format=", "--name-status", commit_hash, "--"],
        cwd=repo_root,
        timeout_s=_SHOW_TIMEOUT_S,
        max_stdout_bytes=_MAX_SHOW_BYTES,
        max_stderr_bytes=200_000,
    )
    if name_status.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out loading changed files.",
        )
    if name_status.returncode != 0 and not name_status.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=name_status.stderr.strip() or "Unknown commit hash.",
        )

    numstat = run_git(
        ["show", "--no-color", "--format=", "--numstat", commit_hash, "--"],
        cwd=repo_root,
        timeout_s=_SHOW_TIMEOUT_S,
        max_stdout_bytes=_MAX_SHOW_BYTES,
        max_stderr_bytes=200_000,
    )
    if numstat.timed_out:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timed out loading file stats.",
        )
    if numstat.returncode != 0 and not numstat.stdout_truncated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=numstat.stderr.strip() or "Unknown commit hash.",
        )

    stats_by_new_path: dict[str, tuple[int | None, int | None]] = {}
    for line in numstat.stdout.splitlines():
        if not line.strip():
            continue
        stat_parts = line.split("\t")
        if len(stat_parts) < 3:
            continue
        add_s = stat_parts[0]
        del_s = stat_parts[1]
        path_text = stat_parts[2]
        additions = int(add_s) if add_s.isdigit() else None
        deletions = int(del_s) if del_s.isdigit() else None
        new_path, _old_path = _parse_git_numstat_path(path_text)
        if new_path:
            stats_by_new_path[new_path] = (additions, deletions)

    changed_files: list[GitCommitChangedFile] = []
    for line in name_status.stdout.splitlines():
        if not line.strip():
            continue
        ns_parts = line.split("\t")
        if not ns_parts:
            continue
        status_code = ns_parts[0].strip()
        if not status_code:
            continue

        old_path: str | None = None
        new_path: str | None = None
        if status_code.startswith(("R", "C")):
            if len(ns_parts) < 3:
                continue
            old_path = ns_parts[1].strip() or None
            new_path = ns_parts[2].strip() or None
        else:
            if len(ns_parts) < 2:
                continue
            new_path = ns_parts[1].strip() or None

        if not new_path:
            continue

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
    commit_hash = x.commitHash.strip()
    if not _COMMIT_HASH_RE.match(commit_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid commit hash.",
        )

    rel_path, _abs_path = _resolve_repo_relative_path(repo_root, x.path)
    rel_old_path: str | None = None
    if x.oldPath:
        rel_old_path, _abs_old_path = _resolve_repo_relative_path(repo_root, x.oldPath)

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
