import json
import os
import signal
import socket
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import pytest

from setta.launch import LaunchError
from setta.launcher_metadata import LauncherMetadataError
from setta.routers.launch import LaunchRequest, route_launch
from setta.ssh_common import RemoteSessionSummary
from setta.ssh_connect import RemoteConnectResult
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.utils.paths import (
    build_files_root_from_base,
    clear_setta_paths_cache,
    resolve_setta_paths,
)
from tests.utils.setta_paths import temporary_setta_paths


class TestLaunchRoutes:
    def test_launch_local_profile_preserves_omitted_setta_files_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] is None

    def test_launch_local_without_profile_defaults_to_auto_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] == "auto"

    def test_launch_local_profile_without_setta_home_uses_runtime_and_lookup_homes(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            captured["profile_lookup_home"] = kwargs.get("profile_lookup_home")
            raise LaunchError("Captured", "intentional capture")

        class _Paths:
            setta_home = Path("/tmp/runtime/.setta-development")
            profile_lookup_home = Path("/tmp/lookup/.setta")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr("setta.routers.launch.get_setta_paths", lambda: _Paths())

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == str(_Paths.setta_home)
        assert captured["profile_lookup_home"] == str(_Paths.profile_lookup_home)

    def test_launch_local_without_profile_uses_runtime_setta_home_default(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            raise LaunchError("Captured", "intentional capture")

        class _Paths:
            setta_home = Path("/tmp/runtime/.setta-development")
            profile_lookup_home = Path("/tmp/lookup/.setta")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr("setta.routers.launch.get_setta_paths", lambda: _Paths())

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == str(_Paths.setta_home)

    def test_launch_local_without_profile_hides_profile_env_during_paths_lookup(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            raise LaunchError("Captured", "intentional capture")

        class _Paths:
            setta_home = Path("/tmp/runtime/.setta-development")
            profile_lookup_home = Path("/tmp/lookup/.setta")

        def fake_get_setta_paths() -> _Paths:
            captured["profile_env_seen"] = os.environ.get("SETTA_PROFILE")
            return _Paths()

        monkeypatch.setenv("SETTA_PROFILE", "missing-profile")
        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr("setta.routers.launch.get_setta_paths", fake_get_setta_paths)

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == str(_Paths.setta_home)
        assert captured["profile_env_seen"] is None
        assert os.environ.get("SETTA_PROFILE") == "missing-profile"

    def test_launch_local_whitespace_profile_is_treated_as_omitted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            captured["profile"] = kwargs.get("profile")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="   ",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] == "auto"
        assert captured["profile"] is None

    def test_launch_local_normalizes_optional_path_arguments(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            captured["setta_files_root"] = kwargs.get("setta_files_root")
            captured["runtime_root"] = kwargs.get("runtime_root")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr(
            "setta.routers.launch.get_setta_paths",
            lambda: type(
                "_Paths",
                (),
                {
                    "setta_home": Path("/tmp/runtime/.setta-development"),
                    "profile_lookup_home": Path("/tmp/lookup/.setta"),
                },
            )(),
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
                settaHome="   ",
                settaFilesRoot="\t",
                runtimeRoot="\n",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == "/tmp/runtime/.setta-development"
        assert captured["setta_files_root"] is None
        assert captured["runtime_root"] is None

    def test_launch_local_explicit_root_preserves_omitted_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                settaFilesRoot="/tmp/workspace/setta_files_dev",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] is None

    def test_launch_local_profile_with_auto_keeps_explicit_auto_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
                settaFilesLocation="auto",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] == "auto"

    def test_launch_local_explicit_root_with_auto_keeps_explicit_auto_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                settaFilesRoot="/tmp/workspace/setta_files_dev",
                settaFilesLocation="auto",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] is None

    def test_launch_local_explicit_root_with_auto_surfaces_workspace_validation(
        self,
    ) -> None:
        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                settaFilesRoot="/tmp/workspace/setta_files_dev",
                settaFilesLocation="auto",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "InvalidWorkspace"
        assert "Workspace root does not exist" in response.error.message

    def test_launch_local_disables_all_env_overrides(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["allow_env_files_overrides"] = kwargs.get(
                "allow_env_files_overrides"
            )
            captured["allow_env_non_files_overrides"] = kwargs.get(
                "allow_env_non_files_overrides"
            )
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["allow_env_files_overrides"] is False
        assert captured["allow_env_non_files_overrides"] is False

    def test_launch_local_updates_launcher_last_used_workspace(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}
        workspace_root = Path("/tmp/workspace").resolve(strict=False)
        setta_home = Path("/tmp/.setta").resolve(strict=False)
        setta_files_root = (workspace_root / "setta_files").resolve(strict=False)
        runtime_root = (setta_files_root / "runtime").resolve(strict=False)

        result = SimpleNamespace(
            session=SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            registry=SimpleNamespace(load_secret=lambda _session: b"secret"),
            paths=SimpleNamespace(
                workspace_root=workspace_root,
                setta_files_location="local",
                setta_files_root=setta_files_root,
                runtime_root=runtime_root,
                setta_home=setta_home,
                profile_name=None,
            ),
            started_new=False,
        )

        monkeypatch.setattr("setta.routers.launch.launch_workspace_session", lambda **_k: result)
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **kwargs: captured.update(kwargs) or True,
        )
        monkeypatch.setattr("setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok")
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )

        response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))

        assert response.ok is True
        assert captured["setta_home"] == setta_home
        assert captured["workspace_root"] == workspace_root

    def test_launch_local_ignores_launcher_metadata_update_errors(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        workspace_root = Path("/tmp/workspace").resolve(strict=False)
        setta_home = Path("/tmp/.setta").resolve(strict=False)
        setta_files_root = (workspace_root / "setta_files").resolve(strict=False)
        runtime_root = (setta_files_root / "runtime").resolve(strict=False)

        result = SimpleNamespace(
            session=SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            registry=SimpleNamespace(load_secret=lambda _session: b"secret"),
            paths=SimpleNamespace(
                workspace_root=workspace_root,
                setta_files_location="local",
                setta_files_root=setta_files_root,
                runtime_root=runtime_root,
                setta_home=setta_home,
                profile_name=None,
            ),
            started_new=False,
        )

        monkeypatch.setattr("setta.routers.launch.launch_workspace_session", lambda **_k: result)
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **_kwargs: (_ for _ in ()).throw(
                LauncherMetadataError("invalid launcher metadata")
            ),
        )
        monkeypatch.setattr("setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok")
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )

        response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))

        assert response.ok is True

    def test_launch_ssh_profile_preserves_omitted_setta_files_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_connect_remote_workspace_session(**kwargs) -> RemoteConnectResult:
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="local",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile="dev",
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/requested/workspace",
                sshTarget="user@host",
                profile="dev",
            )
        )

        assert response.ok is True
        assert captured["setta_files_location"] is None

    def test_launch_ssh_whitespace_profile_is_treated_as_omitted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_connect_remote_workspace_session(**kwargs) -> RemoteConnectResult:
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            captured["profile"] = kwargs.get("profile")
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="local",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile=None,
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/requested/workspace",
                sshTarget="user@host",
                profile="   ",
            )
        )

        assert response.ok is True
        assert captured["setta_files_location"] == "auto"
        assert captured["profile"] is None

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

    def test_launch_returns_structured_error_for_invalid_setta_home(self) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            invalid_setta_home = tmp_path / "custom-home"

            response = route_launch(
                LaunchRequest(
                    workspaceRoot=str(workspace_root),
                    settaHome=str(invalid_setta_home),
                )
            )
            assert response.ok is False
            assert response.error is not None
            assert response.error.code == "InvalidSettaHome"
            assert "must end with one of" in response.error.message

    def test_launch_returns_structured_error_for_runtime_root_matching_workspace(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            response = route_launch(
                LaunchRequest(
                    workspaceRoot=str(workspace_root),
                    runtimeRoot=str(workspace_root),
                )
            )
            assert response.ok is False
            assert response.error is not None
            assert response.error.code == "InvalidRuntimeRoot"
            assert "Runtime root cannot be the workspace root" in response.error.message

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

    def test_launch_over_ssh_returns_resolved_remote_paths(self, monkeypatch) -> None:
        def fake_connect_remote_workspace_session(**_kwargs) -> RemoteConnectResult:
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="global",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile="dev",
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/requested/workspace",
                sshTarget="user@host",
            )
        )

        assert response.ok is True
        assert response.settaFilesLocation == "global"
        assert response.settaFilesRoot == "/remote/state"
        assert response.runtimeRoot == "/remote/runtime"
        assert response.settaHome == "/remote/home/.setta"
        assert response.profile == "dev"
        assert response.remoteCmdResolved == "setta"

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

    def test_launch_profile_does_not_inherit_server_files_root_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)
            env_state_root = tmp_path / "env_state" / "setta_files_dev"
            env_sessions_root = env_state_root / "runtime" / "sessions"
            env_sessions_root.mkdir(parents=True, exist_ok=True)
            local_sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"
            local_sessions_root.mkdir(parents=True, exist_ok=True)

            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
            profiles_dir = setta_home / "profiles"
            profiles_dir.mkdir(parents=True, exist_ok=True)
            (profiles_dir / "dev.json").write_text(
                json.dumps(
                    {
                        "name": "dev",
                        "workspaceRoot": str(workspace_root),
                    },
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )
            clear_setta_paths_cache()

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            monkeypatch.setenv("SETTA_FILES_ROOT", str(env_state_root))

            local_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            env_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                local_socket.bind(("127.0.0.1", 0))
                local_socket.listen(1)
                local_port = local_socket.getsockname()[1]
                env_socket.bind(("127.0.0.1", 0))
                env_socket.listen(1)
                env_port = env_socket.getsockname()[1]
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")

            local_registry = SessionRegistry(sessions_root=local_sessions_root)
            local_session = local_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=local_port,
                pid=os.getpid(),
            )

            env_registry = SessionRegistry(sessions_root=env_sessions_root)
            env_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=env_port,
                pid=os.getpid(),
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        profile="dev",
                    )
                )
            finally:
                local_socket.close()
                env_socket.close()

            assert response.ok is True
            assert response.sessionId == local_session.id
            assert response.settaFilesLocation == "local"
            assert response.settaFilesRoot == str(
                (workspace_root / "setta_files").resolve(strict=False)
            )

    def test_launch_profile_uses_profile_setta_home_for_runtime_roots(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            lookup_home = tmp_path / "lookup" / ".setta"
            runtime_home = tmp_path / "runtime" / ".setta-development"
            profiles_dir = lookup_home / "profiles"
            profiles_dir.mkdir(parents=True, exist_ok=True)
            (profiles_dir / "dev.json").write_text(
                json.dumps(
                    {
                        "name": "dev",
                        "workspaceRoot": str(workspace_root),
                        "settaHome": str(runtime_home),
                        "settaFilesLocation": "global",
                    },
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )

            class _Paths:
                setta_home = runtime_home.resolve(strict=False)
                profile_lookup_home = lookup_home.resolve(strict=False)

            monkeypatch.setattr("setta.routers.launch.get_setta_paths", lambda: _Paths())
            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            global_base = (runtime_home / "setta_files").resolve(strict=False)
            global_root = build_files_root_from_base(global_base, workspace_root).resolve(
                strict=False
            )
            sessions_root = global_root / "runtime" / "sessions"
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
                        profile="dev",
                    )
                )
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.settaHome == str(runtime_home.resolve(strict=False))
            assert response.settaFilesLocation == "global"
            assert response.settaFilesRoot == str(global_root)

    def test_launch_does_not_inherit_server_runtime_root_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)

            local_runtime_root = workspace_root / "setta_files" / "runtime"
            local_sessions_root = local_runtime_root / "sessions"
            local_sessions_root.mkdir(parents=True, exist_ok=True)

            env_runtime_root = tmp_path / "env_runtime_root"
            env_sessions_root = env_runtime_root / "sessions"
            env_sessions_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            monkeypatch.setenv("SETTA_RUNTIME_ROOT", str(env_runtime_root))

            local_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            env_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                local_socket.bind(("127.0.0.1", 0))
                local_socket.listen(1)
                local_port = local_socket.getsockname()[1]
                env_socket.bind(("127.0.0.1", 0))
                env_socket.listen(1)
                env_port = env_socket.getsockname()[1]
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")

            local_registry = SessionRegistry(sessions_root=local_sessions_root)
            local_session = local_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=local_port,
                pid=os.getpid(),
            )

            env_registry = SessionRegistry(sessions_root=env_sessions_root)
            env_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=env_port,
                pid=os.getpid(),
            )

            try:
                response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))
            finally:
                local_socket.close()
                env_socket.close()

            assert response.ok is True
            assert response.sessionId == local_session.id
            assert response.runtimeRoot == str(local_runtime_root.resolve(strict=False))

    def test_launch_does_not_inherit_server_profile_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)
            sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"
            sessions_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            monkeypatch.setenv("SETTA_PROFILE", "missing-profile")

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
                response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.profile is None

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
            explicit_root = tmp_path / "explicit_state" / "setta_files_dev"
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
