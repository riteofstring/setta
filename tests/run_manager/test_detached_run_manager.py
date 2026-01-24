import sys
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.run_manager import DetachedRunManager, DetachedRunSpec
from setta.types.id import ID
from setta.project_state.project_manager_types import RunStatus, RunStatusResponse


class DetachedRunManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = TemporaryDirectory()
        self.root = Path(self._tmpdir.name)
        self.dbe = DBE(self.root)
        self.manager = DetachedRunManager(self.dbe)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def test_start_run_persists_status_and_logs(self) -> None:
        command = f'"{sys.executable}" -c "print(\'detached\')"'
        snapshot_path = self.root / "snapshots" / "run"
        spec = DetachedRunSpec(
            command=command,
            snapshot_path=snapshot_path,
            project_config_id=ID("config"),
            entry_section_id=ID("section"),
            tags={"kind": "test"},
        )
        response = self.manager.start_run(spec)
        self.assertEqual(response.status, RunStatus.running)
        self.assertEqual(response.projectConfigId, ID("config"))
        self.assertEqual(response.entrySectionId, ID("section"))

        status = response
        start_time = time.time()
        while status.status == RunStatus.running and time.time() - start_time < 5:
            time.sleep(0.05)
            status = self.manager.get_status(response.runId)

        self.assertNotEqual(status.status, RunStatus.running)
        self.assertEqual(status.exitCode, 0)
        self.assertEqual(status.tags["kind"], "test")

        run_dir = self.root / "runs" / response.runId
        self.assertTrue((run_dir / "meta.json").exists())
        self.assertTrue((run_dir / "stdout.log").exists())

    def test_start_run_invalid_command_marks_failed(self) -> None:
        runs_root = self.root / "runs"
        before = {path.name for path in runs_root.iterdir()}
        snapshot_path = self.root / "snapshots" / "run"
        spec = DetachedRunSpec(
            command="bad\0cmd",
            snapshot_path=snapshot_path,
            project_config_id=ID("config"),
            entry_section_id=ID("section"),
            tags={},
        )
        with self.assertRaises(ValueError):
            self.manager.start_run(spec)
        after = {path.name for path in runs_root.iterdir()}
        new_dirs = list(after - before)
        self.assertEqual(len(new_dirs), 1)
        meta_path = runs_root / new_dirs[0] / "meta.json"
        data = self.dbe.read_json(meta_path)
        meta = RunStatusResponse(**data)
        self.assertEqual(meta.status, RunStatus.failed)
        self.assertEqual(meta.exitCode, -1)
        self.assertIsNone(meta.pid)
        self.assertIsNone(meta.startedAtMs)
        self.assertIsNotNone(meta.exitedAtMs)

    def test_snapshot_path_points_to_file(self) -> None:
        snapshot_path = self.root / "snapshots" / "run.py"
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
        response = self.manager.start_run(spec)
        status = response
        start_time = time.time()
        while status.status == RunStatus.running and time.time() - start_time < 5:
            time.sleep(0.05)
            status = self.manager.get_status(response.runId)
        self.assertEqual(status.exitCode, 0)
        self.assertEqual(status.snapshotPath, str(snapshot_path))

    def test_get_status_untracked_run_marks_lost(self) -> None:
        command = f'"{sys.executable}" -c "import time; time.sleep(1.0)"'
        snapshot_path = self.root / "snapshots" / "run"
        spec = DetachedRunSpec(
            command=command,
            snapshot_path=snapshot_path,
            project_config_id=ID("config"),
            entry_section_id=ID("section"),
            tags={},
        )
        response = self.manager.start_run(spec)
        with self.manager._lock:
            proc = self.manager._processes.pop(response.runId, None)
        if proc is None:
            self.fail("Expected running process to be tracked")
        status = self.manager.get_status(response.runId)
        self.assertEqual(status.status, RunStatus.lost)
        deadline = time.time() + 2
        while proc.poll() is None and time.time() < deadline:
            time.sleep(0.05)
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=2)

    def test_cancel_run_marks_canceled(self) -> None:
        command = f'"{sys.executable}" -c "import time; time.sleep(10)"'
        snapshot_path = self.root / "snapshots" / "run"
        spec = DetachedRunSpec(
            command=command,
            snapshot_path=snapshot_path,
            project_config_id=ID("config"),
            entry_section_id=ID("section"),
            tags={},
        )
        response = self.manager.start_run(spec)
        self.manager.cancel_run(response.runId)

        status = self.manager.get_status(response.runId)
        deadline = time.time() + 5
        while status.exitCode is None and time.time() < deadline:
            time.sleep(0.05)
            status = self.manager.get_status(response.runId)
        self.assertEqual(status.status, RunStatus.canceled)

    def test_cancel_after_exit_keeps_exited_status(self) -> None:
        command = f'"{sys.executable}" -c "import time; time.sleep(0.05)"'
        snapshot_path = self.root / "snapshots" / "run"
        spec = DetachedRunSpec(
            command=command,
            snapshot_path=snapshot_path,
            project_config_id=ID("config"),
            entry_section_id=ID("section"),
            tags={},
        )
        response = self.manager.start_run(spec)
        with self.manager._lock:
            proc = self.manager._processes.get(response.runId)
            if proc is None:
                self.fail("Expected running process to be tracked")
            exit_code = proc.wait(timeout=5)
        status = self.manager.cancel_run(response.runId)
        self.assertEqual(status.status, RunStatus.exited)
        self.assertEqual(status.exitCode, exit_code)

    def test_canceled_run_records_exit_code(self) -> None:
        command = f'"{sys.executable}" -c "import time; time.sleep(5)"'
        snapshot_path = self.root / "snapshots" / "run"
        spec = DetachedRunSpec(
            command=command,
            snapshot_path=snapshot_path,
            project_config_id=ID("config"),
            entry_section_id=ID("section"),
            tags={},
        )
        response = self.manager.start_run(spec)
        self.manager.cancel_run(response.runId)
        status = self.manager.get_status(response.runId)
        deadline = time.time() + 5
        while status.exitCode is None and time.time() < deadline:
            time.sleep(0.05)
            status = self.manager.get_status(response.runId)
        self.assertEqual(status.status, RunStatus.canceled)
        self.assertIsNotNone(status.exitCode)

    def test_cancel_untracked_run_marks_lost(self) -> None:
        command = f'"{sys.executable}" -c "import time; time.sleep(1.0)"'
        snapshot_path = self.root / "snapshots" / "run"
        spec = DetachedRunSpec(
            command=command,
            snapshot_path=snapshot_path,
            project_config_id=ID("config"),
            entry_section_id=ID("section"),
            tags={},
        )
        response = self.manager.start_run(spec)
        with self.manager._lock:
            proc = self.manager._processes.pop(response.runId, None)
        if proc is None:
            self.fail("Expected running process to be tracked")
        status = self.manager.cancel_run(response.runId)
        self.assertEqual(status.status, RunStatus.lost)
        deadline = time.time() + 2
        while proc.poll() is None and time.time() < deadline:
            time.sleep(0.05)
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=2)
