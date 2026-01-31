import sys
import time
from types import SimpleNamespace

import pytest

from setta.database.db_objs import DBE
from setta.run_manager import DetachedRunManager, DetachedRunSpec
from setta.types.id import ID
from setta.project_state.project_manager_types import RunStatus, RunStatusResponse


@pytest.fixture
def run_env(tmp_path):
    dbe = DBE(tmp_path)
    manager = DetachedRunManager(dbe)
    return SimpleNamespace(root=tmp_path, dbe=dbe, manager=manager)


def test_start_run_persists_status_and_logs(run_env) -> None:
    command = f'"{sys.executable}" -c "print(\'detached\')"'
    snapshot_path = run_env.root / "snapshots" / "run"
    spec = DetachedRunSpec(
        command=command,
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={"kind": "test"},
    )
    response = run_env.manager.start_run(spec)
    assert response.status == RunStatus.running
    assert response.projectConfigId == ID("config")
    assert response.entrySectionId == ID("section")

    status = response
    start_time = time.time()
    while status.status == RunStatus.running and time.time() - start_time < 5:
        time.sleep(0.05)
        status = run_env.manager.get_status(response.runId)

    assert status.status != RunStatus.running
    assert status.exitCode == 0
    assert status.tags["kind"] == "test"

    run_dir = run_env.root / "runs" / response.runId
    assert (run_dir / "meta.json").exists()
    assert (run_dir / "stdout.log").exists()


def test_start_run_invalid_command_marks_failed(run_env) -> None:
    runs_root = run_env.root / "runs"
    before = {path.name for path in runs_root.iterdir()}
    snapshot_path = run_env.root / "snapshots" / "run"
    spec = DetachedRunSpec(
        command="bad\0cmd",
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={},
    )
    with pytest.raises(ValueError):
        run_env.manager.start_run(spec)
    after = {path.name for path in runs_root.iterdir()}
    new_dirs = list(after - before)
    assert len(new_dirs) == 1
    meta_path = runs_root / new_dirs[0] / "meta.json"
    data = run_env.dbe.read_json(meta_path)
    meta = RunStatusResponse(**data)
    assert meta.status == RunStatus.failed
    assert meta.exitCode == -1
    assert meta.pid is None
    assert meta.startedAtMs is None
    assert meta.exitedAtMs is not None


def test_snapshot_path_points_to_file(run_env) -> None:
    snapshot_path = run_env.root / "snapshots" / "run.py"
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text("print('detached')\n")
    command = f'"{sys.executable}" "{snapshot_path}"'
    spec = DetachedRunSpec(
        command=command,
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={},
    )
    response = run_env.manager.start_run(spec)
    status = response
    start_time = time.time()
    while status.status == RunStatus.running and time.time() - start_time < 5:
        time.sleep(0.05)
        status = run_env.manager.get_status(response.runId)
    assert status.exitCode == 0
    assert status.snapshotPath == str(snapshot_path)


def test_get_status_untracked_run_marks_lost(run_env) -> None:
    command = f'"{sys.executable}" -c "import time; time.sleep(1.0)"'
    snapshot_path = run_env.root / "snapshots" / "run"
    spec = DetachedRunSpec(
        command=command,
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={},
    )
    response = run_env.manager.start_run(spec)
    with run_env.manager._lock:
        proc = run_env.manager._processes.pop(response.runId, None)
    assert proc is not None
    status = run_env.manager.get_status(response.runId)
    assert status.status == RunStatus.lost
    deadline = time.time() + 2
    while proc.poll() is None and time.time() < deadline:
        time.sleep(0.05)
    if proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=2)


def test_cancel_run_marks_canceled(run_env) -> None:
    command = f'"{sys.executable}" -c "import time; time.sleep(10)"'
    snapshot_path = run_env.root / "snapshots" / "run"
    spec = DetachedRunSpec(
        command=command,
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={},
    )
    response = run_env.manager.start_run(spec)
    run_env.manager.cancel_run(response.runId)

    status = run_env.manager.get_status(response.runId)
    deadline = time.time() + 5
    while status.exitCode is None and time.time() < deadline:
        time.sleep(0.05)
        status = run_env.manager.get_status(response.runId)
    assert status.status == RunStatus.canceled


def test_cancel_after_exit_keeps_exited_status(run_env) -> None:
    command = f'"{sys.executable}" -c "import time; time.sleep(0.05)"'
    snapshot_path = run_env.root / "snapshots" / "run"
    spec = DetachedRunSpec(
        command=command,
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={},
    )
    response = run_env.manager.start_run(spec)
    with run_env.manager._lock:
        proc = run_env.manager._processes.get(response.runId)
        assert proc is not None
        exit_code = proc.wait(timeout=5)
    status = run_env.manager.cancel_run(response.runId)
    assert status.status == RunStatus.exited
    assert status.exitCode == exit_code


def test_canceled_run_records_exit_code(run_env) -> None:
    command = f'"{sys.executable}" -c "import time; time.sleep(5)"'
    snapshot_path = run_env.root / "snapshots" / "run"
    spec = DetachedRunSpec(
        command=command,
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={},
    )
    response = run_env.manager.start_run(spec)
    run_env.manager.cancel_run(response.runId)
    status = run_env.manager.get_status(response.runId)
    deadline = time.time() + 5
    while status.exitCode is None and time.time() < deadline:
        time.sleep(0.05)
        status = run_env.manager.get_status(response.runId)
    assert status.status == RunStatus.canceled
    assert status.exitCode is not None


def test_cancel_untracked_run_marks_lost(run_env) -> None:
    command = f'"{sys.executable}" -c "import time; time.sleep(1.0)"'
    snapshot_path = run_env.root / "snapshots" / "run"
    spec = DetachedRunSpec(
        command=command,
        snapshot_path=snapshot_path,
        project_config_id=ID("config"),
        entry_section_id=ID("section"),
        tags={},
    )
    response = run_env.manager.start_run(spec)
    with run_env.manager._lock:
        proc = run_env.manager._processes.pop(response.runId, None)
    assert proc is not None
    status = run_env.manager.cancel_run(response.runId)
    assert status.status == RunStatus.lost
    deadline = time.time() + 2
    while proc.poll() is None and time.time() < deadline:
        time.sleep(0.05)
    if proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=2)
