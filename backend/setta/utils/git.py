import os
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO, Callable


@dataclass(frozen=True)
class GitCommandOutput:
    returncode: int
    stdout: str
    stderr: str
    stdout_truncated: bool
    stderr_truncated: bool
    timed_out: bool


def is_git_available() -> bool:
    return _get_git_binary_path() is not None


@lru_cache(maxsize=1)
def _get_git_binary_path() -> str | None:
    return shutil.which("git")


def get_workspace_repo_root(workspace_root: Path) -> Path | None:
    git_binary = _get_git_binary_path()
    if git_binary is None:
        return None
    result = _run_git(
        ["-C", str(workspace_root), "rev-parse", "--show-toplevel"],
        git_binary=git_binary,
        cwd=workspace_root,
        timeout_s=1.5,
        max_stdout_bytes=4096,
        max_stderr_bytes=4096,
    )
    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if not raw:
        return None
    return Path(raw).resolve(strict=False)


def run_git(
    args: list[str],
    *,
    cwd: Path,
    timeout_s: float,
    max_stdout_bytes: int,
    max_stderr_bytes: int = 64_000,
) -> GitCommandOutput:
    git_binary = _get_git_binary_path()
    if git_binary is None:
        return GitCommandOutput(
            returncode=127,
            stdout="",
            stderr="git not found",
            stdout_truncated=False,
            stderr_truncated=False,
            timed_out=False,
        )
    return _run_git(
        args,
        git_binary=git_binary,
        cwd=cwd,
        timeout_s=timeout_s,
        max_stdout_bytes=max_stdout_bytes,
        max_stderr_bytes=max_stderr_bytes,
    )


def _run_git(
    args: list[str],
    *,
    git_binary: str,
    cwd: Path,
    timeout_s: float,
    max_stdout_bytes: int,
    max_stderr_bytes: int,
) -> GitCommandOutput:
    cmd = [
        git_binary,
        "-c",
        "color.ui=false",
        "-c",
        "core.quotePath=false",
        "--no-pager",
        *args,
    ]
    env = dict(os.environ)
    env["GIT_PAGER"] = "cat"

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdout is not None
    assert proc.stderr is not None

    stdout_chunks: list[bytes] = []
    stderr_chunks: list[bytes] = []
    stdout_truncated = False
    stderr_truncated = False
    timed_out = False

    terminate_lock = threading.Lock()
    terminate_requested = False

    def terminate_proc() -> None:
        nonlocal terminate_requested
        with terminate_lock:
            if terminate_requested:
                return
            terminate_requested = True
        if proc.poll() is None:
            proc.terminate()

    def read_stream(
        stream: BinaryIO,
        *,
        max_bytes: int,
        chunks: list[bytes],
        set_truncated: Callable[[], None],
    ) -> None:
        size = 0
        try:
            while True:
                chunk = stream.read(8192)
                if not chunk:
                    break
                remaining_bytes = max_bytes - size
                if remaining_bytes <= 0:
                    set_truncated()
                    terminate_proc()
                    continue
                if len(chunk) > remaining_bytes:
                    chunks.append(chunk[:remaining_bytes])
                    size += remaining_bytes
                    set_truncated()
                    terminate_proc()
                    continue
                chunks.append(chunk)
                size += len(chunk)
        except (OSError, ValueError):
            # The process can close pipes while reader threads are draining.
            pass
        finally:
            try:
                stream.close()
            except OSError:
                pass

    def set_stdout_truncated() -> None:
        nonlocal stdout_truncated
        stdout_truncated = True

    def set_stderr_truncated() -> None:
        nonlocal stderr_truncated
        stderr_truncated = True

    stdout_thread = threading.Thread(
        target=read_stream,
        args=(proc.stdout,),
        kwargs={
            "max_bytes": max_stdout_bytes,
            "chunks": stdout_chunks,
            "set_truncated": set_stdout_truncated,
        },
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=read_stream,
        args=(proc.stderr,),
        kwargs={
            "max_bytes": max_stderr_bytes,
            "chunks": stderr_chunks,
            "set_truncated": set_stderr_truncated,
        },
        daemon=True,
    )
    stdout_thread.start()
    stderr_thread.start()

    try:
        proc.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        timed_out = True
        terminate_proc()

    # Give the process a brief chance to exit cleanly after terminate.
    wait_deadline = time.monotonic() + 0.75
    while proc.poll() is None and time.monotonic() < wait_deadline:
        time.sleep(0.02)
    if proc.poll() is None:
        proc.kill()
        try:
            proc.wait(timeout=1.0)
        except subprocess.TimeoutExpired:
            # Extremely unlikely after kill, but avoid raising in the router path.
            timed_out = True

    join_deadline = time.monotonic() + 0.75
    for thread in (stdout_thread, stderr_thread):
        remaining = join_deadline - time.monotonic()
        if remaining <= 0:
            break
        thread.join(timeout=remaining)

    stdout = b"".join(stdout_chunks).decode("utf-8", errors="replace")
    stderr = b"".join(stderr_chunks).decode("utf-8", errors="replace")
    return GitCommandOutput(
        returncode=proc.returncode or 0,
        stdout=stdout,
        stderr=stderr,
        stdout_truncated=stdout_truncated,
        stderr_truncated=stderr_truncated,
        timed_out=timed_out,
    )
