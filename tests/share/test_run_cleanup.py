import os
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.utils import create_new_id
from setta.share.run_cleanup import cleanup_share_run_output


class ShareRunCleanupTests(unittest.TestCase):
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

            self.assertEqual(2, removed)
            self.assertFalse(old_run.exists())
            self.assertFalse((runs_root / session_prune).exists())
            self.assertTrue(keep_new_run.exists())


if __name__ == "__main__":
    unittest.main()
