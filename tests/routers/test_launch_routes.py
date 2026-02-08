import os
import signal
import socket
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.routers.launch import LaunchRequest, route_launch
from setta.sessions.registry import SessionRegistry
from setta.utils.paths import build_files_root_from_base, resolve_setta_paths
from tests.utils.setta_paths import temporary_setta_paths


class TestLaunchRoutes:
    def test_launch_rejects_files_root_conflicts(self) -> None:
        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                filesRoot="/tmp/setta_files",
                filesRootBase="/tmp/state_base",
            )
        )
        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "FilesRootConflict"

    def test_launch_over_ssh_returns_bootstrap_url(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        ssh_stub_dir = repo_root / "scripts" / "test"
        assert (ssh_stub_dir / "ssh").exists()

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            paths = resolve_setta_paths(workspace_root=workspace_root)
            sessions_root = paths.runtime_sessions_root
            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=paths.workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )

            pid_file = tmp_path / "ssh_tunnel_pid.txt"
            old_path = os.environ.get("PATH", "")

            try:
                os.environ["PATH"] = f"{ssh_stub_dir.as_posix()}:{old_path}"
                os.environ["SETTA_SSH_BIN"] = (ssh_stub_dir / "ssh").as_posix()
                os.environ["SETTA_SSH_STUB_PID_FILE"] = pid_file.as_posix()
                os.environ["SETTA_SSH_STUB_DISABLE_FORWARD"] = "1"
                os.environ["SETTA_SESSION_ID"] = session.id
                os.environ["SETTA_SESSIONS_ROOT"] = sessions_root.as_posix()

                with temporary_setta_paths(
                    workspace_root=paths.workspace_root,
                    setta_files_root=paths.setta_files_root,
                    runtime_root=paths.runtime_root,
                ):
                    response = route_launch(
                        LaunchRequest(
                            workspaceRoot="/remote/workspace",
                            sshTarget="user@host",
                            localPort=61000,
                        )
                    )
                assert response.ok is True
                assert response.bootstrapUrlFragment is not None
                assert "/__setta__/bootstrap#token=" in response.bootstrapUrlFragment
                assert response.sessionId == session.id
                assert response.filesRoot == str(paths.setta_files_root)
            finally:
                if pid_file.exists():
                    pid_str = pid_file.read_text(encoding="utf-8").strip()
                    if pid_str:
                        pid = int(pid_str)
                        try:
                            os.kill(pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                        else:
                            try:
                                os.waitpid(pid, 0)
                            except ChildProcessError:
                                pass
                os.environ.pop("SETTA_SSH_STUB_PID_FILE", None)
                os.environ.pop("SETTA_SSH_STUB_DISABLE_FORWARD", None)
                os.environ.pop("SETTA_SSH_BIN", None)
                os.environ.pop("SETTA_SESSION_ID", None)
                os.environ.pop("SETTA_SESSIONS_ROOT", None)
                os.environ["PATH"] = old_path

    def test_launch_over_ssh_reuses_existing_tunnel(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        ssh_stub_dir = repo_root / "scripts" / "test"
        assert (ssh_stub_dir / "ssh").exists()

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            paths = resolve_setta_paths(workspace_root=workspace_root)
            sessions_root = paths.runtime_sessions_root
            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=paths.workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )

            pid_file = tmp_path / "ssh_tunnel_pid.txt"
            old_path = os.environ.get("PATH", "")

            try:
                os.environ["PATH"] = f"{ssh_stub_dir.as_posix()}:{old_path}"
                os.environ["SETTA_SSH_BIN"] = (ssh_stub_dir / "ssh").as_posix()
                os.environ["SETTA_SSH_STUB_PID_FILE"] = pid_file.as_posix()
                os.environ["SETTA_SSH_STUB_DISABLE_FORWARD"] = "1"
                os.environ["SETTA_SESSION_ID"] = session.id
                os.environ["SETTA_SESSIONS_ROOT"] = sessions_root.as_posix()

                request = LaunchRequest(
                    workspaceRoot="/remote/workspace",
                    sshTarget="user@host",
                    localPort=61000,
                )

                with temporary_setta_paths(
                    workspace_root=paths.workspace_root,
                    setta_files_root=paths.setta_files_root,
                    runtime_root=paths.runtime_root,
                ):
                    response1 = route_launch(request)
                    assert response1.ok is True
                    pid1 = int(pid_file.read_text(encoding="utf-8").strip())
                    assert pid1 > 0

                    response2 = route_launch(request)
                    assert response2.ok is True
                    pid2 = int(pid_file.read_text(encoding="utf-8").strip())
                    assert pid1 == pid2
                    assert response2.filesRoot == str(paths.setta_files_root)
            finally:
                if pid_file.exists():
                    pid_str = pid_file.read_text(encoding="utf-8").strip()
                    if pid_str:
                        pid = int(pid_str)
                        try:
                            os.kill(pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                        else:
                            try:
                                os.waitpid(pid, 0)
                            except ChildProcessError:
                                pass
                os.environ.pop("SETTA_SSH_STUB_PID_FILE", None)
                os.environ.pop("SETTA_SSH_STUB_DISABLE_FORWARD", None)
                os.environ.pop("SETTA_SSH_BIN", None)
                os.environ.pop("SETTA_SESSION_ID", None)
                os.environ.pop("SETTA_SESSIONS_ROOT", None)
                os.environ["PATH"] = old_path

    def test_launch_local_defaults_files_root_to_workspace_setta_files(
        self, monkeypatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            server_workspace_root = tmp_path / "server_workspace"
            server_workspace_root.mkdir(parents=True, exist_ok=True)
            server_files_root = tmp_path / "server_setta_files"
            server_files_root.mkdir(parents=True, exist_ok=True)

            # The launch implementation prunes sessions whose pid isn't a Setta
            # process, so mark the current pid as "in process backend".
            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            # Simulate the dev backend's own roots living elsewhere.
            monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(server_workspace_root))
            monkeypatch.setenv("SETTA_FILES_ROOT", str(server_files_root))
            monkeypatch.delenv("SETTA_FILES_ROOT_BASE", raising=False)
            monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)

            # If route_launch incorrectly inherits SETTA_FILES_ROOT, it will look for
            # sessions here.
            server_paths = resolve_setta_paths(
                workspace_root=workspace_root, files_root=server_files_root
            )
            server_registry = SessionRegistry(
                sessions_root=server_paths.runtime_sessions_root
            )
            server_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )

            # The correct default should instead live under workspace_root/setta_files.
            expected_files_root = (workspace_root / "setta_files").resolve(
                strict=False
            )
            expected_paths = resolve_setta_paths(
                workspace_root=workspace_root, files_root=expected_files_root
            )
            expected_registry = SessionRegistry(
                sessions_root=expected_paths.runtime_sessions_root
            )
            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]
            expected_session = expected_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
            )

            try:
                response = route_launch(
                    LaunchRequest(workspaceRoot=str(workspace_root))
                )
            finally:
                server_socket.close()
            assert response.ok is True
            assert response.filesRoot == str(expected_files_root)
            assert response.sessionId == expected_session.id

    def test_launch_local_files_root_base_overrides_server_files_root_env(
        self, monkeypatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            server_workspace_root = tmp_path / "server_workspace"
            server_workspace_root.mkdir(parents=True, exist_ok=True)
            server_files_root = tmp_path / "server_setta_files"
            server_files_root.mkdir(parents=True, exist_ok=True)

            files_root_base = tmp_path / "files_root_base"
            files_root_base.mkdir(parents=True, exist_ok=True)

            # The launch implementation prunes sessions whose pid isn't a Setta
            # process, so mark the current pid as "in process backend".
            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            # Simulate the dev backend's own roots living elsewhere.
            monkeypatch.setenv("SETTA_WORKSPACE_ROOT", str(server_workspace_root))
            monkeypatch.setenv("SETTA_FILES_ROOT", str(server_files_root))
            monkeypatch.delenv("SETTA_FILES_ROOT_BASE", raising=False)
            monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)

            # If route_launch incorrectly inherits SETTA_FILES_ROOT, it will look for
            # sessions here.
            server_paths = resolve_setta_paths(
                workspace_root=workspace_root, files_root=server_files_root
            )
            server_registry = SessionRegistry(
                sessions_root=server_paths.runtime_sessions_root
            )
            server_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )

            expected_files_root = build_files_root_from_base(
                files_root_base.resolve(strict=False),
                workspace_root.resolve(strict=False),
            ).resolve(strict=False)
            expected_paths = resolve_setta_paths(
                workspace_root=workspace_root, files_root=expected_files_root
            )
            expected_registry = SessionRegistry(
                sessions_root=expected_paths.runtime_sessions_root
            )
            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]
            expected_session = expected_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        filesRootBase=str(files_root_base),
                    )
                )
            finally:
                server_socket.close()
            assert response.ok is True
            assert response.filesRoot == str(expected_files_root)
            assert response.sessionId == expected_session.id
