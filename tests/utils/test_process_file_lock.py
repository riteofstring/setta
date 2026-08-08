from pathlib import Path

import pytest

from setta.utils.process_file_lock import (
    ProcessFileLockError,
    acquire_process_file_lock,
)


def test_acquire_process_file_lock_maps_parent_creation_failures(
    tmp_path: Path,
) -> None:
    lock_parent = tmp_path / "lock-parent-as-file"
    lock_parent.write_text("not-a-directory", encoding="utf-8")
    lock_path = lock_parent / "store.lock"

    # The parent path cannot be created as a directory, so lock setup must surface
    # a typed lock error instead of leaking a raw filesystem exception.
    with pytest.raises(ProcessFileLockError, match="Failed acquiring file lock"):
        with acquire_process_file_lock(lock_path, timeout_seconds=0.1):
            pass


def test_acquire_process_file_lock_does_not_remap_body_oserror(tmp_path: Path) -> None:
    lock_path = tmp_path / "store.lock"

    # OSErrors from the protected body should keep their original error domain.
    with pytest.raises(OSError, match="body-io-error"):
        with acquire_process_file_lock(lock_path, timeout_seconds=0.1):
            raise OSError("body-io-error")
