import os
import signal
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import RunStatus, RunStatusResponse
from setta.types.id import ID


@dataclass(frozen=True)
class DetachedRunSpec:
    command: str
    snapshot_path: Path
    project_config_id: ID
    entry_section_id: ID | None
    tags: dict[str, str]


def _now_ms() -> int:
    return int(time.time() * 1000)


def _is_pid_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except OSError:
        return False
    return True


class DetachedRunManager:
    def __init__(self, dbe: DBE) -> None:
        self._dbe = dbe
        self._runs_root = self._dbe.runtime_root / "runs"
        self._runs_root.mkdir(parents=True, exist_ok=True)
        self._processes: dict[str, subprocess.Popen] = {}
        self._lock = threading.Lock()

    def start_run(self, spec: DetachedRunSpec) -> RunStatusResponse:
        run_id = str(create_new_id())
        run_dir = self._runs_root / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = run_dir / "stdout.log"
        meta = RunStatusResponse(
            runId=run_id,
            status=RunStatus.queued,
            createdAtMs=_now_ms(),
            startedAtMs=None,
            exitedAtMs=None,
            exitCode=None,
            pid=None,
            command=spec.command,
            snapshotPath=str(spec.snapshot_path),
            projectConfigId=spec.project_config_id,
            entrySectionId=spec.entry_section_id,
            tags=dict(spec.tags),
        )
        self._write_meta(meta)
        stdout_handle = open(stdout_path, "ab")
        popen_kwargs: dict[str, object] = {
            "stdout": stdout_handle,
            "stderr": stdout_handle,
            "stdin": subprocess.DEVNULL,
            "shell": True,
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_kwargs["start_new_session"] = True
        proc = subprocess.Popen(spec.command, **popen_kwargs)
        stdout_handle.close()
        meta = meta.model_copy(
            update={
                "status": RunStatus.running,
                "startedAtMs": _now_ms(),
                "pid": proc.pid,
            }
        )
        self._write_meta(meta)
        with self._lock:
            self._processes[run_id] = proc
        watcher = threading.Thread(
            target=self._watch_process,
            args=(run_id, proc),
            daemon=True,
        )
        watcher.start()
        return meta

    def get_status(self, run_id: str) -> RunStatusResponse:
        meta = self._load_meta(run_id)
        if meta.status != RunStatus.running or meta.pid is None:
            return meta
        with self._lock:
            proc = self._processes.get(run_id)
        if proc is not None:
            exit_code = proc.poll()
            if exit_code is None:
                return meta
            return self._finalize_run(meta, exit_code)
        if not _is_pid_running(meta.pid):
            meta = meta.model_copy(
                update={
                    "status": RunStatus.exited,
                    "exitedAtMs": _now_ms(),
                }
            )
            self._write_meta(meta)
        return meta

    def cancel_run(self, run_id: str) -> RunStatusResponse:
        meta = self._load_meta(run_id)
        if meta.status in (RunStatus.exited, RunStatus.failed, RunStatus.canceled):
            return meta
        pid = meta.pid
        if pid is None:
            raise KeyError(f"Run {run_id} has no pid")
        with self._lock:
            proc = self._processes.get(run_id)
        if proc is not None:
            if os.name == "nt":
                proc.terminate()
            else:
                os.killpg(proc.pid, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)
        meta = meta.model_copy(
            update={
                "status": RunStatus.canceled,
                "exitedAtMs": _now_ms(),
            }
        )
        self._write_meta(meta)
        return meta

    def _watch_process(self, run_id: str, proc: subprocess.Popen) -> None:
        exit_code = proc.wait()
        with self._lock:
            self._processes.pop(run_id, None)
        meta = self._load_meta(run_id)
        if meta.status == RunStatus.canceled:
            meta = meta.model_copy(
                update={
                    "exitCode": exit_code,
                    "exitedAtMs": _now_ms(),
                }
            )
            self._write_meta(meta)
            return
        self._finalize_run(meta, exit_code)

    def _finalize_run(
        self,
        meta: RunStatusResponse,
        exit_code: int,
    ) -> RunStatusResponse:
        status = RunStatus.exited if exit_code == 0 else RunStatus.failed
        meta = meta.model_copy(
            update={
                "status": status,
                "exitCode": exit_code,
                "exitedAtMs": _now_ms(),
            }
        )
        self._write_meta(meta)
        return meta

    def _run_dir(self, run_id: str) -> Path:
        return self._runs_root / run_id

    def _meta_path(self, run_id: str) -> Path:
        return self._run_dir(run_id) / "meta.json"

    def _load_meta(self, run_id: str) -> RunStatusResponse:
        meta_path = self._meta_path(run_id)
        if not meta_path.exists():
            raise KeyError(f"Unknown run id: {run_id}")
        data = self._dbe.read_json(meta_path)
        return RunStatusResponse(**data)

    def _write_meta(self, meta: RunStatusResponse) -> None:
        meta_path = self._meta_path(meta.runId)
        self._dbe.write_json(meta_path, meta.model_dump())
