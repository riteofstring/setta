import subprocess
import sys
import tempfile
from pathlib import Path

from setta.api.listener import SettaListener
from setta.sessions.registry import SessionRegistry
from setta.types.generated import go_shared_constants
from setta.types.id import ID
from setta.utils.constants import C


def _start_sleeping_setta_process(root: Path) -> subprocess.Popen[bytes]:
    script_path = root / "setta"
    script_path.write_text("import time\n\ntime.sleep(60)\n", encoding="utf-8")
    return subprocess.Popen(
        [sys.executable, str(script_path)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def test_autoconnect_requires_env_opt_in(monkeypatch) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir()
        sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"

        process = _start_sleeping_setta_process(root)
        try:
            registry = SessionRegistry(sessions_root=sessions_root)
            registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            monkeypatch.delenv("SETTA_LISTENER_AUTOCONNECT", raising=False)
            monkeypatch.setattr(C, "HOST", go_shared_constants.DEFAULT_HOST)
            monkeypatch.setattr(C, "PORT", go_shared_constants.DEFAULT_PORT)
            monkeypatch.setattr(
                C, "RUNTIME_SESSIONS_FOLDER", Path("setta_files/runtime/sessions")
            )
            monkeypatch.chdir(workspace_root)

            listener = SettaListener(project_config_id=ID("proj-1"))
            listener._maybe_autoconnect_to_latest_local_session()

            assert listener._auto_session_metadata is None
            assert listener._host == go_shared_constants.DEFAULT_HOST
            assert listener._port == go_shared_constants.DEFAULT_PORT
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_autoconnect_skips_when_explicit_host_port_provided(monkeypatch) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir()
        sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"

        process = _start_sleeping_setta_process(root)
        try:
            registry = SessionRegistry(sessions_root=sessions_root)
            registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            monkeypatch.setenv("SETTA_LISTENER_AUTOCONNECT", "1")
            monkeypatch.setattr(C, "HOST", "example.com")
            monkeypatch.setattr(C, "PORT", 9001)
            monkeypatch.setattr(
                C, "RUNTIME_SESSIONS_FOLDER", Path("setta_files/runtime/sessions")
            )
            monkeypatch.chdir(workspace_root)

            listener = SettaListener(
                project_config_id=ID("proj-1"),
                host="example.net",
                port=9123,
            )
            listener._maybe_autoconnect_to_latest_local_session()

            assert listener._auto_session_metadata is None
            assert listener._host == "example.net"
            assert listener._port == 9123
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_autoconnect_can_be_disabled(monkeypatch) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir()
        sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"

        process = _start_sleeping_setta_process(root)
        try:
            registry = SessionRegistry(sessions_root=sessions_root)
            registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            monkeypatch.setenv("SETTA_LISTENER_AUTOCONNECT", "0")
            monkeypatch.setattr(C, "HOST", go_shared_constants.DEFAULT_HOST)
            monkeypatch.setattr(C, "PORT", go_shared_constants.DEFAULT_PORT)
            monkeypatch.setattr(
                C, "RUNTIME_SESSIONS_FOLDER", Path("setta_files/runtime/sessions")
            )
            monkeypatch.chdir(workspace_root)

            listener = SettaListener(project_config_id=ID("proj-1"))
            listener._maybe_autoconnect_to_latest_local_session()

            assert listener._auto_session_metadata is None
            assert listener._host == go_shared_constants.DEFAULT_HOST
            assert listener._port == go_shared_constants.DEFAULT_PORT
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_autoconnect_can_be_forced(monkeypatch) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir()
        sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"

        process = _start_sleeping_setta_process(root)
        try:
            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            monkeypatch.setenv("SETTA_LISTENER_AUTOCONNECT", "1")
            monkeypatch.setattr(C, "HOST", "example.com")
            monkeypatch.setattr(C, "PORT", 9001)
            monkeypatch.setattr(
                C, "RUNTIME_SESSIONS_FOLDER", Path("setta_files/runtime/sessions")
            )
            monkeypatch.chdir(workspace_root)

            listener = SettaListener(project_config_id=ID("proj-1"))
            listener._maybe_autoconnect_to_latest_local_session()

            assert listener._auto_session_metadata is not None
            assert listener._auto_session_metadata.id == session.id
            assert listener._host == session.host
            assert listener._port == session.port
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_autoconnect_skips_when_explicit_auth_headers_provided(monkeypatch) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        workspace_root = root / "workspace"
        workspace_root.mkdir()
        sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"

        process = _start_sleeping_setta_process(root)
        try:
            registry = SessionRegistry(sessions_root=sessions_root)
            registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            monkeypatch.setenv("SETTA_LISTENER_AUTOCONNECT", "1")
            monkeypatch.setattr(C, "HOST", go_shared_constants.DEFAULT_HOST)
            monkeypatch.setattr(C, "PORT", go_shared_constants.DEFAULT_PORT)
            monkeypatch.setattr(
                C, "RUNTIME_SESSIONS_FOLDER", Path("setta_files/runtime/sessions")
            )
            monkeypatch.chdir(workspace_root)

            listener = SettaListener(
                project_config_id=ID("proj-1"),
                auth_headers={"Cookie": "explicit=value"},
            )
            listener._maybe_autoconnect_to_latest_local_session()

            assert listener._auto_session_metadata is None
            assert listener._host == go_shared_constants.DEFAULT_HOST
            assert listener._port == go_shared_constants.DEFAULT_PORT
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()
