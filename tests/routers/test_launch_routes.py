import os
import signal
import socket
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.routers.launch import LaunchRequest, route_launch
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.utils.paths import build_files_root_from_base, resolve_setta_paths
from tests.utils.setta_paths import temporary_setta_paths


class TestLaunchRoutes:
    def test_launch_returns_structured_error_for_value_error(self) -> None:
        response = route_launch(LaunchRequest(workspaceRoot="bad\u0000path"))
        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "BadRequest"

    def test_launch_returns_structured_error_for_invalid_runtime_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            runtime_root_file = tmp_path / "runtime-root-file"
            runtime_root_file.write_text("not a directory", encoding="utf-8")

            response = route_launch(
                LaunchRequest(
                    workspaceRoot=str(workspace_root),
                    runtimeRoot=str(runtime_root_file),
                )
            )
            assert response.ok is False
            assert response.error is not None
            assert response.error.code == "InvalidRuntimeRoot"
            assert "runtime root is not a directory" in response.error.message

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
                    runtime_root=paths.runtime_root,
                    setta_files_location="local",
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
                assert response.settaFilesLocation == "local"
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
                    runtime_root=paths.runtime_root,
                    setta_files_location="local",
                ):
                    response1 = route_launch(request)
                    assert response1.ok is True
                    pid1 = int(pid_file.read_text(encoding="utf-8").strip())
                    assert pid1 > 0

                    response2 = route_launch(request)
                    assert response2.ok is True
                    pid2 = int(pid_file.read_text(encoding="utf-8").strip())
                    assert pid1 == pid2
                    assert response2.settaFilesLocation == "local"
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

    def test_launch_local_does_not_inherit_server_files_location_env(self, monkeypatch) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
            global_base = (setta_home / "setta_files").resolve(strict=False)
            global_root = build_files_root_from_base(global_base, workspace_root).resolve(
                strict=False
            )

            local_sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"
            local_sessions_root.mkdir(parents=True, exist_ok=True)
            global_sessions_root = global_root / "runtime" / "sessions"
            global_sessions_root.mkdir(parents=True, exist_ok=True)

            server_socket_local = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server_socket_global = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket_local.bind(("127.0.0.1", 0))
                server_socket_local.listen(1)
                local_port = server_socket_local.getsockname()[1]
                server_socket_global.bind(("127.0.0.1", 0))
                server_socket_global.listen(1)
                global_port = server_socket_global.getsockname()[1]
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")

            local_registry = SessionRegistry(sessions_root=local_sessions_root)
            local_session = local_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=local_port,
                pid=os.getpid(),
            )

            global_registry = SessionRegistry(sessions_root=global_sessions_root)
            global_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=global_port,
                pid=os.getpid(),
            )

            # Simulate the running server process having a global override.
            monkeypatch.setenv("SETTA_FILES_LOCATION", "global")

            try:
                response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))
            finally:
                server_socket_local.close()
                server_socket_global.close()

            assert response.ok is True
            assert response.sessionId == local_session.id
            assert response.settaFilesLocation == "local"

    def test_launch_local_always_wins_even_when_global_requested(self, monkeypatch) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"
            sessions_root.mkdir(parents=True, exist_ok=True)

            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        settaFilesLocation="global",
                    )
                )
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.settaFilesLocation == "local"

    def test_launch_local_with_explicit_setta_files_root(self, monkeypatch) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)
            explicit_root = tmp_path / "explicit_state"
            sessions_root = explicit_root / "runtime" / "sessions"
            sessions_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        settaFilesRoot=str(explicit_root),
                    )
                )
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.settaFilesLocation is None
            assert response.settaFilesRoot == str(explicit_root.resolve(strict=False))
