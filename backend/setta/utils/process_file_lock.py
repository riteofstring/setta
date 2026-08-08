from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from filelock import FileLock, Timeout


class ProcessFileLockError(RuntimeError):
    pass


class ProcessFileLockTimeoutError(ProcessFileLockError):
    pass


@contextmanager
def acquire_process_file_lock(
    lock_path: Path,
    *,
    timeout_seconds: float,
) -> Iterator[None]:
    try:
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock = FileLock(str(lock_path))
    except OSError as exc:
        raise ProcessFileLockError(
            f"Failed acquiring file lock: {lock_path}: {exc}"
        ) from exc
    try:
        lock.acquire(timeout=timeout_seconds)
    except Timeout as exc:
        raise ProcessFileLockTimeoutError(
            f"Timed out acquiring file lock: {lock_path}"
        ) from exc
    except OSError as exc:
        raise ProcessFileLockError(
            f"Failed acquiring file lock: {lock_path}: {exc}"
        ) from exc
    body_exception: BaseException | None = None
    try:
        yield
    except BaseException as exc:
        body_exception = exc
        raise
    finally:
        try:
            lock.release()
        except OSError as exc:
            if body_exception is None:
                raise ProcessFileLockError(
                    f"Failed releasing file lock: {lock_path}: {exc}"
                ) from exc
