import subprocess
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import HTTPException
from fastapi import FastAPI
import pytest
import pytest_asyncio

import setta.routers.git as git_router
from setta.routers.git import (
    _parse_porcelain_status,
    route_get_git_commit_details,
    route_get_git_commit_file_diff,
    route_get_git_diff,
    route_get_git_log,
    route_get_git_status,
)
from setta.server_state import SettaFastAPIState
from setta.types.git import (
    GetGitCommitDetailsRequest,
    GetGitCommitFileDiffRequest,
    GetGitDiffRequest,
    GetGitLogRequest,
)
from setta.utils.constants import C
from setta.utils.git import GitCommandOutput
from tests.utils.manager_fixture import _seed_minimal_setta_files
from tests.utils.runtime_context import runtime_context
from tests.utils.setta_paths import temporary_setta_paths


async def _shutdown_state(state: SettaFastAPIState) -> None:
    if state.specific_file_watcher:
        state.specific_file_watcher.stop()
    if not state.mcp_client.disabled:
        await state.mcp_client.stop()


def _run_git(cwd: Path, args: list[str]) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def _append_commits(cwd: Path, count: int, *, prefix: str) -> None:
    for idx in range(count):
        (cwd / "tracked.txt").write_text(f"{prefix}-{idx}\n", encoding="utf-8")
        _run_git(cwd, ["add", "tracked.txt"])
        _run_git(cwd, ["commit", "-m", f"{prefix}-{idx}"])


class TestGitRoutes:
    pytestmark = pytest.mark.asyncio

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._states: list[SettaFastAPIState] = []
        self._temp_dir = TemporaryDirectory()
        root = Path(self._temp_dir.name)
        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=root,
                setta_files_root=root / "setta_files",
            )
        )
        for path in (
            C.SETTA_FILES_FOLDER,
            C.CODE_FOLDER,
            C.DB_BACKUP_FOLDER,
            C.ARTIFACTS_FOLDER,
            C.RUNTIME_FOLDER,
            C.RUNTIME_SESSIONS_FOLDER,
            C.RUNTIME_LOGS_FOLDER,
            C.RUNTIME_MCP_FOLDER,
            C.RUNTIME_SECRETS_FOLDER,
            C.DETACHED_RUNS_FOLDER,
            C.SHARE_DEPLOYMENTS_FOLDER,
        ):
            path.mkdir(parents=True, exist_ok=True)
        _seed_minimal_setta_files(C.SETTA_FILES_FOLDER)

        # Initialize git repo in the workspace root.
        _run_git(root, ["init"])
        _run_git(root, ["config", "user.email", "a@example.com"])
        _run_git(root, ["config", "user.name", "A"])
        (root / ".gitignore").write_text("setta_files/\n", encoding="utf-8")
        _run_git(root, ["add", ".gitignore"])
        _run_git(root, ["commit", "-m", "init"])

        (root / "tracked.txt").write_text("one\n", encoding="utf-8")
        _run_git(root, ["add", "tracked.txt"])
        _run_git(root, ["commit", "-m", "add tracked"])

        self._workspace_root = root
        try:
            yield
        finally:
            for state in self._states:
                await _shutdown_state(state)
            self._stack.close()
            self._temp_dir.cleanup()

    async def _build_state(self) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            enable_mcp_connections=False,
            enable_language_server=False,
        )
        app.state.setta = state
        self._states.append(state)
        await state.wait_until_ready()
        return state

    async def test_parse_porcelain_status_handles_unstaged_rename_and_copy(
        self,
    ) -> None:
        # Unstaged rename/copy use worktree status R/C and include an extra old-path token.
        output = " R new.txt\0old.txt\0 C copy.txt\0source.txt\0?? loose.txt\0"
        entries = _parse_porcelain_status(output)

        assert len(entries) == 3
        rename = entries[0]
        copy = entries[1]
        untracked = entries[2]
        assert rename.kind == "unstaged"
        assert rename.path == "new.txt"
        assert rename.oldPath == "old.txt"
        assert copy.kind == "unstaged"
        assert copy.path == "copy.txt"
        assert copy.oldPath == "source.txt"
        assert untracked.kind == "untracked"
        assert untracked.path == "loose.txt"

    async def test_status_staged_unstaged_untracked(self) -> None:
        # Stage a change, then modify again to get staged + unstaged on the same file.
        (self._workspace_root / "tracked.txt").write_text("two\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "tracked.txt"])
        (self._workspace_root / "tracked.txt").write_text("three\n", encoding="utf-8")
        (self._workspace_root / "new.txt").write_text("hello\n", encoding="utf-8")

        state = await self._build_state()
        with runtime_context(state) as ctx:
            status = route_get_git_status(ctx)

        staged = [
            e for e in status.entries if e.kind == "staged" and e.path == "tracked.txt"
        ]
        unstaged = [
            e
            for e in status.entries
            if e.kind == "unstaged" and e.path == "tracked.txt"
        ]
        untracked = [
            e for e in status.entries if e.kind == "untracked" and e.path == "new.txt"
        ]

        assert len(staged) == 1
        assert len(unstaged) == 1
        assert len(untracked) == 1

    async def test_diff_unstaged_staged_and_untracked(self) -> None:
        (self._workspace_root / "tracked.txt").write_text("two\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "tracked.txt"])
        (self._workspace_root / "tracked.txt").write_text("three\n", encoding="utf-8")
        (self._workspace_root / "new.txt").write_text("hello\n", encoding="utf-8")

        state = await self._build_state()
        with runtime_context(state) as ctx:
            unstaged = route_get_git_diff(
                GetGitDiffRequest(path="tracked.txt", mode="unstaged"),
                ctx,
            )
            staged = route_get_git_diff(
                GetGitDiffRequest(path="tracked.txt", mode="staged"),
                ctx,
            )
            untracked = route_get_git_diff(
                GetGitDiffRequest(path="new.txt", mode="unstaged"),
                ctx,
            )

        assert "diff --git a/tracked.txt b/tracked.txt" in unstaged.diff
        assert "-two" in unstaged.diff
        assert "+three" in unstaged.diff

        assert "diff --git a/tracked.txt b/tracked.txt" in staged.diff
        assert "-one" in staged.diff
        assert "+two" in staged.diff

        assert "diff --git a/new.txt b/new.txt" in untracked.diff
        assert "+hello" in untracked.diff

    async def test_diff_staged_rename_uses_old_path_when_provided(self) -> None:
        _run_git(self._workspace_root, ["mv", "tracked.txt", "renamed.txt"])
        state = await self._build_state()

        with runtime_context(state) as ctx:
            rename_diff = route_get_git_diff(
                GetGitDiffRequest(
                    path="renamed.txt",
                    oldPath="tracked.txt",
                    mode="staged",
                ),
                ctx,
            )
            single_path_diff = route_get_git_diff(
                GetGitDiffRequest(path="renamed.txt", mode="staged"),
                ctx,
            )

        assert "rename from tracked.txt" in rename_diff.diff
        assert "rename to renamed.txt" in rename_diff.diff
        assert "rename from tracked.txt" not in single_path_diff.diff
        assert "rename to renamed.txt" not in single_path_diff.diff

    async def test_diff_preserves_leading_space_in_repo_relative_paths(self) -> None:
        # Git allows filenames with leading spaces; preserve exact path identity.
        leading_space_path = " leading-space.txt"
        abs_path = self._workspace_root / leading_space_path
        abs_path.write_text("one\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", leading_space_path])
        _run_git(self._workspace_root, ["commit", "-m", "add leading-space path"])
        abs_path.write_text("two\n", encoding="utf-8")

        state = await self._build_state()
        with runtime_context(state) as ctx:
            diff = route_get_git_diff(
                GetGitDiffRequest(path=leading_space_path, mode="unstaged"),
                ctx,
            )

        assert f"diff --git a/{leading_space_path} b/{leading_space_path}" in diff.diff
        assert "-one" in diff.diff
        assert "+two" in diff.diff

    async def test_diff_rejects_untracked_directory_path_for_synthesized_diff(
        self,
    ) -> None:
        # Untracked directories should produce a clear client error, not a 500.
        untracked_dir = self._workspace_root / "new-dir"
        untracked_dir.mkdir()
        (untracked_dir / "inside.txt").write_text("x\n", encoding="utf-8")

        state = await self._build_state()
        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_diff(
                    GetGitDiffRequest(path="new-dir", mode="unstaged"),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "regular file" in str(exc.value.detail)

    async def test_diff_allows_tracked_symlink_pathspec_outside_repo(self) -> None:
        # Tracked symlinks may target outside the repo; git diff pathspec should still work.
        with TemporaryDirectory() as external_tmp:
            external_root = Path(external_tmp)
            external_old = external_root / "old-target.txt"
            external_new = external_root / "new-target.txt"
            external_old.write_text("old\n", encoding="utf-8")
            external_new.write_text("new\n", encoding="utf-8")

            link_path = self._workspace_root / "outside-link.txt"
            link_path.symlink_to(external_old)
            _run_git(self._workspace_root, ["add", "outside-link.txt"])
            _run_git(self._workspace_root, ["commit", "-m", "add outside symlink"])

            link_path.unlink()
            link_path.symlink_to(external_new)

            state = await self._build_state()
            with runtime_context(state) as ctx:
                diff = route_get_git_diff(
                    GetGitDiffRequest(path="outside-link.txt", mode="unstaged"),
                    ctx,
                )

        assert "diff --git a/outside-link.txt b/outside-link.txt" in diff.diff

    async def test_diff_rejects_untracked_symlink_path_for_synthesized_diff(
        self,
    ) -> None:
        with TemporaryDirectory() as external_tmp:
            target = Path(external_tmp) / "outside-target.txt"
            target.write_text("outside\n", encoding="utf-8")
            link_path = self._workspace_root / "untracked-outside-link.txt"
            link_path.symlink_to(target)

            state = await self._build_state()
            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    route_get_git_diff(
                        GetGitDiffRequest(
                            path="untracked-outside-link.txt",
                            mode="unstaged",
                        ),
                        ctx,
                    )

        assert exc.value.status_code == 403
        assert "Symlink paths" in str(exc.value.detail)

    async def test_status_marks_truncation_when_output_is_capped(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        for idx in range(300):
            (self._workspace_root / f"untracked-{idx:03d}.txt").write_text(
                "x\n", encoding="utf-8"
            )
        monkeypatch.setattr(git_router, "_MAX_STATUS_BYTES", 64)
        state = await self._build_state()

        with runtime_context(state) as ctx:
            status_res = route_get_git_status(ctx)

        assert status_res.isTruncated is True

    async def test_log_rejects_option_like_revision(self) -> None:
        state = await self._build_state()

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_log(
                    GetGitLogRequest(
                        rev="--all",
                        pageSize=20,
                        offset=0,
                        allRefs=False,
                    ),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Invalid revision" in str(exc.value.detail)

    async def test_log_commit_details_and_file_diff(self) -> None:
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            log = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=20, offset=0, allRefs=False),
                ctx,
            )
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=head),
                ctx,
            )
            file_diff = route_get_git_commit_file_diff(
                GetGitCommitFileDiffRequest(
                    commitHash=head,
                    path="tracked.txt",
                    oldPath=None,
                ),
                ctx,
            )

        assert log.repoRoot
        assert len(log.commits) > 0
        assert log.commits[0].hash
        assert details.repoRoot
        assert details.commitHash == head
        assert details.subject == "add tracked"
        assert len(details.files) == 1
        assert details.files[0].path == "tracked.txt"
        assert details.files[0].status == "A"
        assert file_diff.repoRoot
        assert file_diff.commitHash == head
        assert file_diff.path == "tracked.txt"
        assert "diff --git a/tracked.txt b/tracked.txt" in file_diff.diff

    async def test_commit_details_parses_paths_with_tabs(self) -> None:
        tab_path = "tab\tname.txt"
        (self._workspace_root / tab_path).write_text("tab\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", tab_path])
        _run_git(self._workspace_root, ["commit", "-m", "add tab path"])
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=head),
                ctx,
            )

        tab_entry = next(
            (file for file in details.files if file.path == tab_path), None
        )
        assert tab_entry is not None
        assert tab_entry.status == "A"
        assert tab_entry.additions == 1
        assert tab_entry.deletions == 0

    async def test_commit_details_parses_rename_numstat_with_nul_delimiters(
        self,
    ) -> None:
        (self._workspace_root / "rename-src.txt").write_text(
            "rename\n", encoding="utf-8"
        )
        _run_git(self._workspace_root, ["add", "rename-src.txt"])
        _run_git(self._workspace_root, ["commit", "-m", "add rename source"])
        _run_git(self._workspace_root, ["mv", "rename-src.txt", "rename-dst.txt"])
        _run_git(self._workspace_root, ["commit", "-m", "rename source to dest"])
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=head),
                ctx,
            )

        renamed = next(
            (file for file in details.files if file.path == "rename-dst.txt"),
            None,
        )
        assert renamed is not None
        assert renamed.oldPath == "rename-src.txt"
        assert renamed.status.startswith("R")
        assert renamed.additions == 0
        assert renamed.deletions == 0

    async def test_commit_details_uses_single_git_show_call(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Commit details should be built from one git subprocess to reduce latency.
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()
        original_run_git = git_router.run_git
        captured_args: list[list[str]] = []

        def recording_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ):
            captured_args.append(args)
            return original_run_git(
                args,
                cwd=cwd,
                timeout_s=timeout_s,
                max_stdout_bytes=max_stdout_bytes,
                max_stderr_bytes=max_stderr_bytes,
            )

        monkeypatch.setattr(git_router, "run_git", recording_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=head),
                ctx,
            )

        show_calls = [args for args in captured_args if args and args[0] == "show"]
        assert len(show_calls) == 1
        assert "--raw" in show_calls[0]
        assert "--numstat" in show_calls[0]
        assert "-z" in show_calls[0]
        assert details.commitHash == head
        assert len(details.files) == 1
        assert details.files[0].path == "tracked.txt"

    async def test_commit_routes_accept_sha256_length_hash_when_git_verifies(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sha256_hash = "a" * 64
        captured_rev_parse_args: list[list[str]] = []

        def fake_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            if args[:4] == ["rev-parse", "--verify", "--quiet", "--end-of-options"]:
                captured_rev_parse_args.append(args)
                return GitCommandOutput(
                    returncode=0,
                    stdout=f"{sha256_hash}\n",
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "show" and "--raw" in args and "--numstat" in args:
                show_payload = (
                    f"{sha256_hash}\x1f\x1fA\x1fa@example.com\x1f1\x1f"
                    f"A\x1fa@example.com\x1f1\x1fsubject\x1fbody\x1e\n"
                    ":100644 100644 0000000 1111111 M\0tracked.txt\0"
                    "1\t1\ttracked.txt\0"
                )
                return GitCommandOutput(
                    returncode=0,
                    stdout=show_payload,
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "show" and "--format=" in args and "--patch" in args:
                return GitCommandOutput(
                    returncode=0,
                    stdout="diff --git a/tracked.txt b/tracked.txt\n",
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            return GitCommandOutput(
                returncode=1,
                stdout="",
                stderr="unexpected command in fake run_git",
                stdout_truncated=False,
                stderr_truncated=False,
                timed_out=False,
            )

        monkeypatch.setattr(git_router, "run_git", fake_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=sha256_hash),
                ctx,
            )
            file_diff = route_get_git_commit_file_diff(
                GetGitCommitFileDiffRequest(
                    commitHash=sha256_hash,
                    path="tracked.txt",
                    oldPath=None,
                ),
                ctx,
            )

        assert len(captured_rev_parse_args) == 2
        assert details.commitHash == sha256_hash
        assert details.files[0].path == "tracked.txt"
        assert file_diff.commitHash == sha256_hash

    async def test_log_pagination_offsets_without_overlap(self) -> None:
        # Build enough history to span multiple pages.
        _append_commits(self._workspace_root, 6, prefix="page")
        state = await self._build_state()
        with runtime_context(state) as ctx:
            page1 = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=3, offset=0, allRefs=False),
                ctx,
            )
            assert page1.hasMore is True
            assert page1.nextOffset == 3
            assert len(page1.commits) == 3

            page2 = route_get_git_log(
                GetGitLogRequest(
                    rev="HEAD",
                    pageSize=3,
                    offset=page1.nextOffset or 0,
                    allRefs=False,
                ),
                ctx,
            )

        assert page2.offset == 3
        assert page2.pageSize == 3
        assert len(page2.commits) == 3
        page1_hashes = {commit.hash for commit in page1.commits}
        page2_hashes = {commit.hash for commit in page2.commits}
        assert page1_hashes.isdisjoint(page2_hashes)

    async def test_log_non_initial_page_skips_head_branch_lookup(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _append_commits(self._workspace_root, 4, prefix="skip-head")
        original_run_git = git_router.run_git
        rev_parse_calls = 0

        def recording_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            nonlocal rev_parse_calls
            if args and args[0] == "rev-parse":
                rev_parse_calls += 1
            return original_run_git(
                args,
                cwd=cwd,
                timeout_s=timeout_s,
                max_stdout_bytes=max_stdout_bytes,
                max_stderr_bytes=max_stderr_bytes,
            )

        monkeypatch.setattr(git_router, "run_git", recording_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            page = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=2, offset=2, allRefs=False),
                ctx,
            )

        assert rev_parse_calls == 0
        assert page.headBranch is None

    async def test_log_reports_cap_boundary(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Use a small cap so the behavior is testable without huge histories.
        monkeypatch.setattr(git_router, "_MAX_LOG_COUNT", 5)
        _append_commits(self._workspace_root, 8, prefix="cap")
        state = await self._build_state()

        with runtime_context(state) as ctx:
            first = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=4, offset=0, allRefs=False),
                ctx,
            )
            second = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=4, offset=4, allRefs=False),
                ctx,
            )
            beyond = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=4, offset=99, allRefs=False),
                ctx,
            )

        assert len(first.commits) == 4
        assert first.hasMore is True
        assert first.nextOffset == 4
        assert first.isCapped is False

        assert len(second.commits) == 1
        assert second.hasMore is False
        assert second.nextOffset is None
        assert second.isCapped is True

        assert beyond.commits == []
        assert beyond.hasMore is False
        assert beyond.nextOffset is None
        assert beyond.isCapped is True
