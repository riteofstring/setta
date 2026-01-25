import os
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.utils import create_new_id
from setta.server_state import cleanup_share_run_output


class TestShareRunCleanup:
    def test_cleanup_removes_expired_runs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            runs_root = Path(tmpdir) / f"share-runs-{create_new_id()}"
            session_keep = create_new_id()
            session_prune = create_new_id()

            old_run = runs_root / session_prune / "old"
            keep_old_run = runs_root / session_keep / "old"
            keep_new_run = runs_root / session_keep / "new"

            old_run.mkdir(parents=True, exist_ok=True)
            keep_old_run.mkdir(parents=True, exist_ok=True)
            keep_new_run.mkdir(parents=True, exist_ok=True)

            (old_run / "log.txt").write_text("old", encoding="utf-8")
            (keep_old_run / "log.txt").write_text("old", encoding="utf-8")
            (keep_new_run / "log.txt").write_text("new", encoding="utf-8")

            now = time.time()
            old_time = now - 3600
            os.utime(old_run, (old_time, old_time))
            os.utime(keep_old_run, (old_time, old_time))
            os.utime(keep_new_run, (now, now))

            removed = cleanup_share_run_output(runs_root, ttl_seconds=60)

            assert removed == 2
            assert not old_run.exists()
            assert not (runs_root / session_prune).exists()
            assert keep_new_run.exists()
