import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from setta.sessions.registry import SessionRegistry
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.utils.constants import C


def test_create_and_load_session() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        sessions_root = Path(temp_dir) / "sessions"
        workspace = Path(temp_dir) / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        created = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=12345,
        )
        sessions = registry.load_sessions(prune_stale=False)

        assert len(sessions) == 1
        loaded = sessions[0]
        assert loaded.id == created.id
        assert Path(loaded.workspacePathCanonical) == workspace.resolve()
        assert loaded.host == "127.0.0.1"
        assert loaded.port == 61234
        assert loaded.pid == 12345
        assert Path(loaded.secretPath).parent == sessions_root / created.id

        metadata_path = sessions_root / created.id / "session.json"
        secret_path = sessions_root / created.id / "secret"
        assert metadata_path.exists()
        assert secret_path.exists()

        secret_bytes = registry.load_secret(loaded)
        assert len(secret_bytes) == C.SESSION_SECRET_BYTES


def test_create_session_persists_connect_info_path_fields() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        sessions_root = Path(temp_dir) / "sessions"
        workspace = Path(temp_dir) / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)
        setta_files_root = str((workspace / "setta_files").resolve())
        runtime_root = str((workspace / "setta_files" / "runtime").resolve())
        setta_home = str((Path(temp_dir) / ".setta-development").resolve())

        created = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=12345,
            setta_files_location="local",
            setta_files_root=setta_files_root,
            runtime_root=runtime_root,
            setta_home=setta_home,
            profile="dev",
        )
        loaded = registry.load_session(created.id, prune_stale=False)

        assert loaded is not None
        assert loaded.settaFilesLocation == "local"
        assert loaded.settaFilesRoot == setta_files_root
        assert loaded.runtimeRoot == runtime_root
        assert loaded.settaHome == setta_home
        assert loaded.profile == "dev"


def test_load_sessions_skips_missing_workspace_path_canonical(
    tmp_path: Path,
) -> None:
    sessions_root = tmp_path / "sessions"
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_id = "abc123"
    session_dir = sessions_root / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    secret_path = session_dir / "secret"
    secret_path.write_bytes(b"secret")

    metadata_path = session_dir / "session.json"
    metadata_path.write_text(
        json.dumps(
            {
                "id": session_id,
                "workspacePath": str(workspace),
                "host": "127.0.0.1",
                "port": 61234,
                "pid": 12345,
                "secretPath": str(secret_path),
            }
        ),
        encoding="utf-8",
    )

    registry = SessionRegistry(sessions_root=sessions_root)
    sessions = registry.load_sessions(prune_stale=False)
    assert len(sessions) == 0


def test_load_sessions_prunes_missing_workspace_path_canonical(tmp_path: Path) -> None:
    sessions_root = tmp_path / "sessions"
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_id = "abc123"
    session_dir = sessions_root / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    secret_path = session_dir / "secret"
    secret_path.write_bytes(b"secret")

    metadata_path = session_dir / "session.json"
    metadata_path.write_text(
        json.dumps(
            {
                "id": session_id,
                "workspacePath": str(workspace),
                "host": "127.0.0.1",
                "port": 61234,
                "pid": 12345,
                "secretPath": str(secret_path),
            }
        ),
        encoding="utf-8",
    )
    # Pruning ignores files that were just written to avoid deleting in-flight writes.
    old = time.time() - 10.0
    os.utime(metadata_path, (old, old))

    registry = SessionRegistry(sessions_root=sessions_root)
    sessions = registry.load_sessions(prune_stale=True)
    assert sessions == []
    assert not session_dir.exists()
    invalid_root = sessions_root / "invalid"
    assert invalid_root.exists()
    quarantined = [
        entry
        for entry in invalid_root.iterdir()
        if entry.is_dir() and entry.name.startswith(f"{session_id}-")
    ]
    assert len(quarantined) == 1
    assert (quarantined[0] / "session.json").exists()


def test_load_sessions_skips_invalid_metadata(tmp_path: Path) -> None:
    sessions_root = tmp_path / "sessions"
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    bad_session_id = "bad1"
    bad_session_dir = sessions_root / bad_session_id
    bad_session_dir.mkdir(parents=True, exist_ok=True)
    (bad_session_dir / "secret").write_bytes(b"secret")
    (bad_session_dir / "session.json").write_text("{not json", encoding="utf-8")

    good_session_id = "good1"
    good_session_dir = sessions_root / good_session_id
    good_session_dir.mkdir(parents=True, exist_ok=True)
    good_secret_path = good_session_dir / "secret"
    good_secret_path.write_bytes(b"secret")
    (good_session_dir / "session.json").write_text(
        json.dumps(
            {
                "id": good_session_id,
                "workspacePath": str(workspace),
                "workspacePathCanonical": str(workspace.resolve()),
                "host": "127.0.0.1",
                "port": 61234,
                "pid": 12345,
                "secretPath": str(good_secret_path),
                "serverMode": "ide",
            }
        ),
        encoding="utf-8",
    )

    registry = SessionRegistry(sessions_root=sessions_root)
    sessions = registry.load_sessions(prune_stale=False)
    assert [session.id for session in sessions] == [good_session_id]
    assert bad_session_dir.exists()


def test_load_sessions_skips_relative_secret_paths(tmp_path: Path) -> None:
    sessions_root = tmp_path / "sessions"
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_id = "rel1"
    session_dir = sessions_root / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "secret").write_bytes(b"secret")

    (session_dir / "session.json").write_text(
        json.dumps(
            {
                "id": session_id,
                "workspacePath": str(workspace),
                "workspacePathCanonical": str(workspace.resolve()),
                "host": "127.0.0.1",
                "port": 61234,
                "pid": 12345,
                # Session metadata should always store absolute secret paths.
                "secretPath": "secret",
                "serverMode": "ide",
            }
        ),
        encoding="utf-8",
    )

    registry = SessionRegistry(sessions_root=sessions_root)
    sessions = registry.load_sessions(prune_stale=False)
    assert sessions == []
    assert session_dir.exists()


def test_find_sessions_by_workspace_resolves_paths() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=12345,
        )

        alt_path = workspace / "." / Path("..") / workspace.name
        matches = registry.find_sessions_by_workspace(alt_path, prune_stale=False)
        assert len(matches) == 1
        assert Path(matches[0].workspacePathCanonical) == workspace.resolve()


def test_load_session_prunes_missing_server_mode(tmp_path: Path) -> None:
    sessions_root = tmp_path / "sessions"
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    session_id = "missing-mode"
    session_dir = sessions_root / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    secret_path = session_dir / "secret"
    secret_path.write_bytes(b"secret")
    metadata_path = session_dir / "session.json"
    metadata_path.write_text(
        json.dumps(
            {
                "id": session_id,
                "workspacePath": str(workspace),
                "workspacePathCanonical": str(workspace.resolve()),
                "host": "127.0.0.1",
                "port": 61234,
                "pid": 12345,
                "secretPath": str(secret_path),
            }
        ),
        encoding="utf-8",
    )
    old = time.time() - 10.0
    os.utime(metadata_path, (old, old))

    registry = SessionRegistry(sessions_root=sessions_root)
    loaded = registry.load_session(session_id, prune_stale=True)

    assert loaded is None
    assert not session_dir.exists()
    invalid_root = sessions_root / "invalid"
    assert invalid_root.exists()
    quarantined = [
        entry
        for entry in invalid_root.iterdir()
        if entry.is_dir() and entry.name.startswith(f"{session_id}-")
    ]
    assert len(quarantined) == 1
    assert (quarantined[0] / "session.json").exists()


def test_find_sessions_by_workspace_and_mode_filters_server_mode() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=12345,
            server_mode="ide",
        )
        launcher_session = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61235,
            pid=12346,
            server_mode="launcher",
        )

        matches = registry.find_sessions_by_workspace_and_mode(
            workspace,
            server_mode="launcher",
            prune_stale=False,
        )
        assert len(matches) == 1
        assert matches[0].id == launcher_session.id
        assert matches[0].serverMode == "launcher"


def test_delete_session_removes_metadata() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        sessions_root = Path(temp_dir) / "sessions"
        workspace = Path(temp_dir) / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        created = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=12345,
        )
        session_dir = sessions_root / created.id
        assert session_dir.exists()

        registry.delete_session(created.id)
        assert not session_dir.exists()


def test_delete_session_removes_extra_files() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        sessions_root = Path(temp_dir) / "sessions"
        workspace = Path(temp_dir) / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        created = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=12345,
        )
        session_dir = sessions_root / created.id
        extra_file = session_dir / "extra.txt"
        extra_file.write_text("extra", encoding="utf-8")

        registry.delete_session(created.id)

        assert not session_dir.exists()


def test_is_session_process_setta_detects_console_script_name() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        script_path = root / "setta"
        script_path.write_text("import time\n\ntime.sleep(60)\n", encoding="utf-8")

        process = subprocess.Popen(
            [sys.executable, str(script_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            assert registry.is_session_process_setta(session)
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_is_session_process_setta_detects_script_py_name() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        script_path = root / "setta-script.py"
        script_path.write_text("import time\n\ntime.sleep(60)\n", encoding="utf-8")

        process = subprocess.Popen(
            [sys.executable, str(script_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61235,
                pid=process.pid,
            )

            assert registry.is_session_process_setta(session)
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_load_sessions_tracks_suspicious_when_enabled() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        sessions_root = Path(temp_dir) / "sessions"
        workspace = Path(temp_dir) / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        process = subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import time; time.sleep(60)",
                "setta.server:app",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            registry.load_sessions(prune_stale=False, track_suspicious=False)
            assert registry.suspicious_session_ids() == set()

            registry.load_sessions(prune_stale=False, track_suspicious=True)
            assert registry.suspicious_session_ids() == {session.id}
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_load_sessions_prunes_non_setta_process() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        process = subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import time; time.sleep(60)",
                "unit-test",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )
            sessions = registry.load_sessions(prune_stale=True)

            assert sessions == []
            assert not (sessions_root / session.id).exists()
            assert process.poll() is None
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_load_session_prunes_non_setta_process() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        process = subprocess.Popen(
            [
                sys.executable,
                "-c",
                "import time; time.sleep(60)",
                "unit-test",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            session = registry.create_session(
                workspace_path=workspace,
                host="127.0.0.1",
                port=61234,
                pid=process.pid,
            )

            loaded = registry.load_session(session.id, prune_stale=True)

            assert loaded is None
            assert not (sessions_root / session.id).exists()
            assert process.poll() is None
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()


def test_load_sessions_prunes_current_pid_without_in_process_flag(
    monkeypatch,
) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        monkeypatch.delenv(IN_PROCESS_ENV_VAR, raising=False)

        session = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=os.getpid(),
        )
        is_setta_process = registry.is_session_process_setta(session)

        sessions = registry.load_sessions(prune_stale=True)

        if is_setta_process:
            assert len(sessions) == 1
            assert sessions[0].id == session.id
            assert (sessions_root / session.id).exists()
        else:
            assert sessions == []
            assert not (sessions_root / session.id).exists()


def test_load_sessions_keeps_current_pid_with_in_process_flag(
    monkeypatch,
) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        sessions_root = root / "sessions"
        workspace = root / "workspace"
        workspace.mkdir()
        registry = SessionRegistry(sessions_root=sessions_root)

        monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

        session = registry.create_session(
            workspace_path=workspace,
            host="127.0.0.1",
            port=61234,
            pid=os.getpid(),
        )

        sessions = registry.load_sessions(prune_stale=True)

        assert len(sessions) == 1
        assert sessions[0].id == session.id
