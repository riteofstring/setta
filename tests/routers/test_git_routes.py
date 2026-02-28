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
    _parse_porcelain_head_commit,
    _parse_porcelain_head_branch,
    _parse_porcelain_status,
    _trim_to_last_complete_nul_record,
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
                setta_files_location="local",
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
        # Porcelain v2 rename/copy entries include an extra old-path token.
        output = (
            "# branch.oid abc123\0"
            "# branch.head main\0"
            "2 R. N... 100644 100644 100644 a b R100 new.txt\0old.txt\0"
            "2 C. N... 100644 100644 100644 a b C100 copy.txt\0source.txt\0"
            "? loose.txt\0"
        )
        entries = _parse_porcelain_status(output)

        assert len(entries) == 3
        rename = entries[0]
        copy = entries[1]
        untracked = entries[2]
        assert rename.kind == "staged"
        assert rename.path == "new.txt"
        assert rename.oldPath == "old.txt"
        assert copy.kind == "staged"
        assert copy.path == "copy.txt"
        assert copy.oldPath == "source.txt"
        assert untracked.kind == "untracked"
        assert untracked.path == "loose.txt"

    async def test_trim_to_last_complete_nul_record_discards_partial_tail(
        self,
    ) -> None:
        # Truncated stream parsing must not include partial trailing tokens.
        trimmed = _trim_to_last_complete_nul_record("?? a.txt\0 M b.txt\0?? partial")

        assert trimmed == "?? a.txt\0 M b.txt\0"

    async def test_parse_porcelain_head_branch_parses_normal_and_detached_states(
        self,
    ) -> None:
        assert (
            _parse_porcelain_head_branch("# branch.oid abc123\0# branch.head main\0")
            == "main"
        )
        assert (
            _parse_porcelain_head_branch(
                "# branch.oid (initial)\0# branch.head feature/new\0"
            )
            == "feature/new"
        )
        assert _parse_porcelain_head_branch("# branch.head (detached)\0") is None

    async def test_parse_porcelain_head_commit_parses_oid_and_initial_state(
        self,
    ) -> None:
        assert (
            _parse_porcelain_head_commit("# branch.oid abc123\0# branch.head main\0")
            == "abc123"
        )
        assert _parse_porcelain_head_commit("# branch.oid (initial)\0") is None

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

    async def test_diff_treats_special_characters_as_literal_pathspecs(self) -> None:
        # Requesting a file with glob-like chars should only diff that exact file.
        special_path = "a[1].txt"
        plain_path = "a1.txt"
        (self._workspace_root / special_path).write_text("one\n", encoding="utf-8")
        (self._workspace_root / plain_path).write_text("one\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", special_path, plain_path])
        _run_git(self._workspace_root, ["commit", "-m", "add special path names"])
        (self._workspace_root / special_path).write_text("two\n", encoding="utf-8")
        (self._workspace_root / plain_path).write_text("two\n", encoding="utf-8")

        state = await self._build_state()
        with runtime_context(state) as ctx:
            diff = route_get_git_diff(
                GetGitDiffRequest(path=special_path, mode="unstaged"),
                ctx,
            )

        assert f"diff --git a/{special_path} b/{special_path}" in diff.diff
        assert f"diff --git a/{plain_path} b/{plain_path}" not in diff.diff

    async def test_diff_rejects_repo_root_pathspec(self) -> None:
        # The file-diff endpoint should reject repo-root pathspecs.
        state = await self._build_state()
        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_diff(
                    GetGitDiffRequest(path=".", mode="unstaged"),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Path must point to a file." in str(exc.value.detail)

    async def test_diff_rejects_directory_pathspec(self) -> None:
        # The file-diff endpoint should reject directory pathspecs.
        nested_dir = self._workspace_root / "dir"
        nested_dir.mkdir()
        nested_file = nested_dir / "nested.txt"
        nested_file.write_text("one\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "dir/nested.txt"])
        _run_git(self._workspace_root, ["commit", "-m", "add nested file"])
        nested_file.write_text("two\n", encoding="utf-8")

        state = await self._build_state()
        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_diff(
                    GetGitDiffRequest(path="dir", mode="unstaged"),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Path must point to a file." in str(exc.value.detail)

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
        assert "Path must point to a file." in str(exc.value.detail)

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

    async def test_status_trims_partial_records_when_truncated(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Truncated status output should ignore the last incomplete record.
        def fake_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            assert cwd.resolve(strict=False) == self._workspace_root.resolve(
                strict=False
            )
            assert timeout_s > 0
            assert max_stdout_bytes > 0
            assert max_stderr_bytes > 0
            if args and args[0] == "status":
                return GitCommandOutput(
                    returncode=0,
                    stdout=(
                        "# branch.oid abc123\0"
                        "# branch.head main\0"
                        "1 .M N... 100644 100644 100644 a b tracked.txt\0"
                        "? complete.txt\0"
                        "? partial"
                    ),
                    stderr="",
                    stdout_truncated=True,
                    stderr_truncated=False,
                    timed_out=False,
                )
            raise AssertionError(f"unexpected git command: {args}")

        monkeypatch.setattr(git_router, "run_git", fake_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            status_res = route_get_git_status(ctx)

        assert status_res.isTruncated is True
        assert status_res.repo.headBranch == "main"
        assert status_res.repo.headCommit == "abc123"
        paths = sorted(entry.path for entry in status_res.entries)
        assert paths == ["complete.txt", "tracked.txt"]

    async def test_status_route_parses_porcelain_v2_head_metadata(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Status should parse branch and full HEAD hash directly from porcelain v2 output.
        original_run_git = git_router.run_git
        captured_args: list[list[str]] = []

        def recording_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
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
            status_res = route_get_git_status(ctx)

        assert status_res.repo.isGitRepo is True
        expected_head_commit = _run_git(
            self._workspace_root, ["rev-parse", "HEAD"]
        ).strip()
        assert status_res.repo.headCommit == expected_head_commit
        assert any(
            args
            and args[0] == "status"
            and "--porcelain=v2" in args
            and "--branch" in args
            for args in captured_args
        )
        assert not any(args and args[0] == "rev-parse" for args in captured_args)

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

    async def test_log_rejects_revision_containing_nul(self) -> None:
        # NUL bytes should be treated as malformed client input.
        state = await self._build_state()

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_log(
                    GetGitLogRequest(
                        rev="HEAD\x00evil",
                        pageSize=20,
                        offset=0,
                        allRefs=False,
                    ),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Invalid revision" in str(exc.value.detail)

    async def test_log_returns_client_error_for_unknown_revision(self) -> None:
        state = await self._build_state()

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_log(
                    GetGitLogRequest(
                        rev="does-not-exist",
                        pageSize=20,
                        offset=0,
                        allRefs=False,
                    ),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Invalid revision" in str(exc.value.detail)

    async def test_log_returns_empty_history_for_unborn_head(self) -> None:
        _run_git(self._workspace_root, ["checkout", "--orphan", "fresh-history"])
        state = await self._build_state()

        with runtime_context(state) as ctx:
            log = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=20, offset=0, allRefs=False),
                ctx,
            )

        assert log.commits == []
        assert log.hasMore is False
        assert log.nextOffset is None
        assert log.isCapped is False

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
        assert details.isTruncated is False
        assert file_diff.repoRoot
        assert file_diff.commitHash == head
        assert file_diff.path == "tracked.txt"
        assert "diff --git a/tracked.txt b/tracked.txt" in file_diff.diff

    async def test_log_preserves_decorations_with_commas_in_ref_names(self) -> None:
        _run_git(self._workspace_root, ["branch", "feature,comma"])
        _run_git(self._workspace_root, ["tag", "release,1"])
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            log = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=20, offset=0, allRefs=True),
                ctx,
            )

        head_commit = next(
            (commit for commit in log.commits if commit.hash == head), None
        )
        assert head_commit is not None
        assert "feature,comma" in head_commit.decorations
        assert "tag: release,1" in head_commit.decorations

    async def test_log_falls_back_when_decorate_atom_is_unexpanded(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()
        branch = _run_git(
            self._workspace_root, ["rev-parse", "--abbrev-ref", "HEAD"]
        ).strip()
        original_run_git = git_router.run_git

        def fallback_decorations_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            assert cwd.resolve(strict=False) == self._workspace_root.resolve(
                strict=False
            )
            assert timeout_s > 0
            assert max_stdout_bytes > 0
            assert max_stderr_bytes > 0
            if args == ["rev-parse", "--abbrev-ref", "HEAD", "HEAD"]:
                return GitCommandOutput(
                    returncode=0,
                    stdout=f"{branch}\n{head}\n",
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args[:4] == ["rev-parse", "--verify", "--quiet", "HEAD"]:
                return GitCommandOutput(
                    returncode=0,
                    stdout=f"{head}\n",
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "log":
                return GitCommandOutput(
                    returncode=0,
                    stdout=(
                        f"{head}\0\0A\0a@example.com\0"
                        "1700000000\0add tracked\0"
                        "%(decorate:prefix=,suffix=,separator=\x1d)\0\0"
                    ),
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "for-each-ref":
                return GitCommandOutput(
                    returncode=0,
                    stdout=(
                        f"{head}\0\0refs/heads/{branch}\0\0\n"
                        f"{head}\0\0refs/tags/release,1\0\0\n"
                    ),
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            return original_run_git(
                args,
                cwd=cwd,
                timeout_s=timeout_s,
                max_stdout_bytes=max_stdout_bytes,
                max_stderr_bytes=max_stderr_bytes,
            )

        monkeypatch.setattr(git_router, "run_git", fallback_decorations_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            log = route_get_git_log(
                GetGitLogRequest(rev="", pageSize=20, offset=0, allRefs=True),
                ctx,
            )

        head_commit = next(
            (commit for commit in log.commits if commit.hash == head), None
        )
        assert head_commit is not None
        assert f"HEAD -> {branch}" in head_commit.decorations
        assert branch in head_commit.decorations
        assert "tag: release,1" in head_commit.decorations
        assert "%(decorate:prefix=,suffix=,separator=" not in head_commit.decorations
        assert ")" not in head_commit.decorations

    async def test_log_preserves_sanitized_decorations_when_fallback_is_truncated(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()
        branch = _run_git(
            self._workspace_root, ["rev-parse", "--abbrev-ref", "HEAD"]
        ).strip()
        original_run_git = git_router.run_git

        def truncated_fallback_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            assert cwd.resolve(strict=False) == self._workspace_root.resolve(
                strict=False
            )
            assert timeout_s > 0
            assert max_stdout_bytes > 0
            assert max_stderr_bytes > 0
            if args == ["rev-parse", "--abbrev-ref", "HEAD", "HEAD"]:
                return GitCommandOutput(
                    returncode=0,
                    stdout=f"{branch}\n{head}\n",
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "log":
                return GitCommandOutput(
                    returncode=0,
                    stdout=(
                        f"{head}\0\0A\0a@example.com\0"
                        "1700000000\0add tracked\0"
                        "%(decorate:prefix=,suffix=,separator=\x1d)\x1d"
                        "feature/local\0\0"
                    ),
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "for-each-ref":
                return GitCommandOutput(
                    returncode=0,
                    stdout=f"{head}\0\0refs/heads/{branch}\0\0\n",
                    stderr="",
                    stdout_truncated=True,
                    stderr_truncated=False,
                    timed_out=False,
                )
            return original_run_git(
                args,
                cwd=cwd,
                timeout_s=timeout_s,
                max_stdout_bytes=max_stdout_bytes,
                max_stderr_bytes=max_stderr_bytes,
            )

        monkeypatch.setattr(git_router, "run_git", truncated_fallback_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            log = route_get_git_log(
                GetGitLogRequest(rev="", pageSize=20, offset=0, allRefs=True),
                ctx,
            )

        head_commit = next(
            (commit for commit in log.commits if commit.hash == head), None
        )
        assert head_commit is not None
        assert "feature/local" in head_commit.decorations
        assert "%(decorate:prefix=,suffix=,separator=" not in head_commit.decorations
        assert ")" not in head_commit.decorations

    async def test_log_parses_subjects_with_ascii_field_separator_bytes(self) -> None:
        # NUL-safe parsing must not drop commits whose subjects contain older separator bytes.
        special_subject = "subject-with-\x1f-unit-and-\x1e-record"
        (self._workspace_root / "separator-subject.txt").write_text(
            "separator\n", encoding="utf-8"
        )
        _run_git(self._workspace_root, ["add", "separator-subject.txt"])
        _run_git(self._workspace_root, ["commit", "-m", special_subject])

        state = await self._build_state()
        with runtime_context(state) as ctx:
            log = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=20, offset=0, allRefs=False),
                ctx,
            )

        matching_commit = next(
            (commit for commit in log.commits if commit.subject == special_subject),
            None,
        )
        assert matching_commit is not None

    async def test_commit_file_diff_treats_special_characters_as_literal_pathspecs(
        self,
    ) -> None:
        # Commit-file diff should isolate the selected file even with [] in name.
        special_path = "a[1].txt"
        plain_path = "a1.txt"
        (self._workspace_root / special_path).write_text("one\n", encoding="utf-8")
        (self._workspace_root / plain_path).write_text("one\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", special_path, plain_path])
        _run_git(self._workspace_root, ["commit", "-m", "add literal files"])
        (self._workspace_root / special_path).write_text("two\n", encoding="utf-8")
        (self._workspace_root / plain_path).write_text("two\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", special_path, plain_path])
        _run_git(self._workspace_root, ["commit", "-m", "update literal files"])
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            file_diff = route_get_git_commit_file_diff(
                GetGitCommitFileDiffRequest(
                    commitHash=head,
                    path=special_path,
                    oldPath=None,
                ),
                ctx,
            )

        assert f"diff --git a/{special_path} b/{special_path}" in file_diff.diff
        assert f"diff --git a/{plain_path} b/{plain_path}" not in file_diff.diff

    async def test_commit_file_diff_rejects_directory_pathspec(self) -> None:
        # Commit-file diff should reject directory pathspecs.
        nested_dir = self._workspace_root / "dir"
        nested_dir.mkdir()
        (nested_dir / "nested.txt").write_text("one\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "dir/nested.txt"])
        _run_git(self._workspace_root, ["commit", "-m", "add nested"])
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_commit_file_diff(
                    GetGitCommitFileDiffRequest(
                        commitHash=head,
                        path="dir",
                        oldPath=None,
                    ),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Path must point to a file." in str(exc.value.detail)

    async def test_commit_file_diff_allows_historical_file_when_path_is_now_directory(
        self,
    ) -> None:
        # Commit routes should validate path type against the commit, not working tree.
        replacement_path = self._workspace_root / "swap-path"
        replacement_path.write_text("v1\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "swap-path"])
        _run_git(self._workspace_root, ["commit", "-m", "add swap-path file"])
        file_commit = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        replacement_path.unlink()
        replacement_path.mkdir()
        (replacement_path / "nested.txt").write_text("dir now\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "-A"])
        _run_git(self._workspace_root, ["commit", "-m", "replace file with directory"])

        state = await self._build_state()
        with runtime_context(state) as ctx:
            file_diff = route_get_git_commit_file_diff(
                GetGitCommitFileDiffRequest(
                    commitHash=file_commit,
                    path="swap-path",
                    oldPath=None,
                ),
                ctx,
            )

        assert file_diff.commitHash == file_commit
        assert "diff --git a/swap-path b/swap-path" in file_diff.diff

    async def test_commit_file_diff_rejects_whitespace_prefixed_directory_pathspec(
        self,
    ) -> None:
        # Directory checks must preserve exact path bytes for whitespace-prefixed names.
        spaced_dir = self._workspace_root / " dir"
        spaced_dir.mkdir()
        (spaced_dir / "inside.txt").write_text("inside\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", " dir/inside.txt"])
        _run_git(self._workspace_root, ["commit", "-m", "add spaced directory"])
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_commit_file_diff(
                    GetGitCommitFileDiffRequest(
                        commitHash=head,
                        path=" dir",
                        oldPath=None,
                    ),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Path must point to a file." in str(exc.value.detail)

    async def test_commit_file_diff_returns_not_found_for_file_not_in_commit_diff(
        self,
    ) -> None:
        # Empty `git show -- <path>` means the file is not part of the commit diff.
        (self._workspace_root / "alpha.txt").write_text("alpha\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "alpha.txt"])
        _run_git(self._workspace_root, ["commit", "-m", "add alpha"])
        (self._workspace_root / "beta.txt").write_text("beta\n", encoding="utf-8")
        _run_git(self._workspace_root, ["add", "beta.txt"])
        _run_git(self._workspace_root, ["commit", "-m", "add beta"])
        beta_commit = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_commit_file_diff(
                    GetGitCommitFileDiffRequest(
                        commitHash=beta_commit,
                        path="alpha.txt",
                        oldPath=None,
                    ),
                    ctx,
                )

        assert exc.value.status_code == 404
        assert "File is not part of this commit diff." in str(exc.value.detail)

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
        assert details.isTruncated is False

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
        assert details.isTruncated is False

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
        assert "--no-ext-diff" in show_calls[0]
        assert "--no-textconv" in show_calls[0]
        assert "--raw" in show_calls[0]
        assert "--numstat" in show_calls[0]
        assert "-z" in show_calls[0]
        assert details.commitHash == head
        assert len(details.files) == 1
        assert details.files[0].path == "tracked.txt"
        assert details.isTruncated is False

    async def test_commit_details_parses_control_separator_bytes_in_subject_and_body(
        self,
    ) -> None:
        # NUL-safe metadata parsing should preserve commit text containing old separators.
        special_subject = "subject-with-\x1f-unit-and-\x1e-record"
        special_body = "body-line-1\x1fwith-unit\nbody-line-2\x1erecord"
        (self._workspace_root / "separator-body.txt").write_text(
            "separator-body\n", encoding="utf-8"
        )
        _run_git(self._workspace_root, ["add", "separator-body.txt"])
        _run_git(
            self._workspace_root,
            ["commit", "-m", special_subject, "-m", special_body],
        )
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        state = await self._build_state()
        with runtime_context(state) as ctx:
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=head),
                ctx,
            )

        assert details.subject == special_subject
        assert "\x1f" in details.body
        assert "\x1e" in details.body

    async def test_diff_commands_disable_external_diff_and_textconv(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # UI diff commands should not run repo-configured external diff/textconv.
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
            route_get_git_diff(
                GetGitDiffRequest(path="tracked.txt", mode="unstaged"),
                ctx,
            )
            route_get_git_commit_file_diff(
                GetGitCommitFileDiffRequest(
                    commitHash=head,
                    path="tracked.txt",
                    oldPath=None,
                ),
                ctx,
            )

        diff_calls = [
            args for args in captured_args if len(args) > 1 and args[1] == "diff"
        ]
        show_patch_calls = [
            args
            for args in captured_args
            if len(args) > 1 and args[1] == "show" and "--patch" in args
        ]
        assert len(diff_calls) >= 1
        assert len(show_patch_calls) >= 1
        assert "--literal-pathspecs" in diff_calls[0]
        assert "--no-ext-diff" in diff_calls[0]
        assert "--no-textconv" in diff_calls[0]
        assert "--literal-pathspecs" in show_patch_calls[0]
        assert "--no-ext-diff" in show_patch_calls[0]
        assert "--no-textconv" in show_patch_calls[0]

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
            assert cwd.resolve(strict=False) == self._workspace_root.resolve(
                strict=False
            )
            assert timeout_s > 0
            assert max_stdout_bytes > 0
            assert max_stderr_bytes > 0
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
            if "show" in args and "--raw" in args and "--numstat" in args:
                show_payload = (
                    f"{sha256_hash}\0\0A\0a@example.com\0"
                    "1\0A\0a@example.com\0"
                    "1\0subject\0body\0\n"
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
            if "show" in args and "--format=" in args and "--patch" in args:
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
        assert details.isTruncated is False
        assert file_diff.commitHash == sha256_hash

    async def test_commit_details_flags_truncated_output(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()
        original_run_git = git_router.run_git

        def truncated_show_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            if args and args[0] == "show" and "--raw" in args and "--numstat" in args:
                show_payload = (
                    f"{head}\0\0A\0a@example.com\0"
                    "1\0A\0a@example.com\0"
                    "1\0subject\0body\0\n"
                    ":100644 100644 0000000 1111111 M\0tracked.txt\0"
                    "1\t1\ttracked.txt\0"
                )
                return GitCommandOutput(
                    returncode=0,
                    stdout=show_payload,
                    stderr="",
                    stdout_truncated=True,
                    stderr_truncated=False,
                    timed_out=False,
                )
            return original_run_git(
                args,
                cwd=cwd,
                timeout_s=timeout_s,
                max_stdout_bytes=max_stdout_bytes,
                max_stderr_bytes=max_stderr_bytes,
            )

        monkeypatch.setattr(git_router, "run_git", truncated_show_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=head),
                ctx,
            )

        assert details.commitHash == head
        assert details.isTruncated is True
        assert len(details.files) == 1
        assert details.files[0].path == "tracked.txt"

    async def test_commit_details_falls_back_when_truncated_metadata_is_incomplete(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # If truncated show output cuts metadata, fallback metadata path should avoid a 500.
        head = _run_git(self._workspace_root, ["rev-parse", "HEAD"]).strip()

        def fallback_metadata_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            assert cwd.resolve(strict=False) == self._workspace_root.resolve(
                strict=False
            )
            assert timeout_s > 0
            assert max_stdout_bytes > 0
            assert max_stderr_bytes > 0
            if args[:4] == ["rev-parse", "--verify", "--quiet", "--end-of-options"]:
                return GitCommandOutput(
                    returncode=0,
                    stdout=f"{head}\n",
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "show" and "--raw" in args and "--numstat" in args:
                return GitCommandOutput(
                    returncode=0,
                    stdout=f"{head}\0\0A\0a@example.com",
                    stderr="",
                    stdout_truncated=True,
                    stderr_truncated=False,
                    timed_out=False,
                )
            if args and args[0] == "show" and "--no-patch" in args:
                return GitCommandOutput(
                    returncode=0,
                    stdout=(
                        f"{head}\0\0A\0a@example.com\0"
                        "1\0A\0a@example.com\0"
                        "1\0subject\0body\0"
                    ),
                    stderr="",
                    stdout_truncated=False,
                    stderr_truncated=False,
                    timed_out=False,
                )
            raise AssertionError(f"unexpected git command: {args}")

        monkeypatch.setattr(git_router, "run_git", fallback_metadata_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            details = route_get_git_commit_details(
                GetGitCommitDetailsRequest(commitHash=head),
                ctx,
            )

        assert details.commitHash == head
        assert details.subject == "subject"
        assert details.body == "body"
        assert details.files == []
        assert details.isTruncated is True

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

    async def test_log_high_offset_does_not_claim_cap_in_small_repos(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Offsets beyond the cap should only report capped when older history exists.
        monkeypatch.setattr(git_router, "_MAX_LOG_COUNT", 50)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            page = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=10, offset=99, allRefs=False),
                ctx,
            )

        assert page.commits == []
        assert page.hasMore is False
        assert page.nextOffset is None
        assert page.isCapped is False

    async def test_log_high_offset_rejects_invalid_revision(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(git_router, "_MAX_LOG_COUNT", 50)
        state = await self._build_state()

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc:
                route_get_git_log(
                    GetGitLogRequest(
                        rev="does-not-exist",
                        pageSize=10,
                        offset=99,
                        allRefs=False,
                    ),
                    ctx,
                )

        assert exc.value.status_code == 400
        assert "Invalid revision: does-not-exist" in str(exc.value.detail)

    async def test_log_truncated_without_parsed_commits_does_not_loop_pagination(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_run_git(
            args: list[str],
            *,
            cwd: Path,
            timeout_s: float,
            max_stdout_bytes: int,
            max_stderr_bytes: int = 64_000,
        ) -> GitCommandOutput:
            assert cwd.resolve(strict=False) == self._workspace_root.resolve(
                strict=False
            )
            assert timeout_s > 0
            assert max_stdout_bytes > 0
            assert max_stderr_bytes > 0
            if args and args[0] == "log":
                return GitCommandOutput(
                    returncode=0,
                    stdout="partial-record-without-delimiters",
                    stderr="",
                    stdout_truncated=True,
                    stderr_truncated=False,
                    timed_out=False,
                )
            raise AssertionError(f"unexpected git command: {args}")

        monkeypatch.setattr(git_router, "run_git", fake_run_git)
        state = await self._build_state()
        with runtime_context(state) as ctx:
            page = route_get_git_log(
                GetGitLogRequest(rev="HEAD", pageSize=2, offset=1, allRefs=False),
                ctx,
            )

        assert page.commits == []
        assert page.hasMore is False
        assert page.nextOffset is None
