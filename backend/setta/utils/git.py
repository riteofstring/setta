import os
import selectors
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GitCommandOutput:
    returncode: int
    stdout: str
    stderr: str
    stdout_truncated: bool
    stderr_truncated: bool
    timed_out: bool


def is_git_available() -> bool:
    return shutil.which("git") is not None


def get_workspace_repo_root(workspace_root: Path) -> Path | None:
    if not is_git_available():
        return None
    result = _run_git(
        ["-C", str(workspace_root), "rev-parse", "--show-toplevel"],
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
    if not is_git_available():
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
        cwd=cwd,
        timeout_s=timeout_s,
        max_stdout_bytes=max_stdout_bytes,
        max_stderr_bytes=max_stderr_bytes,
    )


def _run_git(
    args: list[str],
    *,
    cwd: Path,
    timeout_s: float,
    max_stdout_bytes: int,
    max_stderr_bytes: int,
) -> GitCommandOutput:
    cmd = [
        "git",
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

    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ, data="stdout")
    selector.register(proc.stderr, selectors.EVENT_READ, data="stderr")

    stdout_chunks: list[bytes] = []
    stderr_chunks: list[bytes] = []
    stdout_size = 0
    stderr_size = 0
    stdout_truncated = False
    stderr_truncated = False
    timed_out = False

    deadline = time.monotonic() + timeout_s

    while selector.get_map():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            timed_out = True
            proc.terminate()
            break

        events = selector.select(timeout=min(0.25, remaining))
        if not events:
            continue

        for key, _mask in events:
            stream = key.fileobj
            which = key.data
            if hasattr(stream, "read1"):
                chunk = stream.read1(8192)  # type: ignore[attr-defined]
            else:
                chunk = stream.read(8192)
            if not chunk:
                selector.unregister(stream)
                try:
                    stream.close()
                except Exception:
                    pass
                continue

            if which == "stdout":
                if stdout_truncated:
                    continue
                remaining_bytes = max_stdout_bytes - stdout_size
                if remaining_bytes <= 0:
                    stdout_truncated = True
                    proc.terminate()
                    continue
                if len(chunk) > remaining_bytes:
                    stdout_chunks.append(chunk[:remaining_bytes])
                    stdout_size += remaining_bytes
                    stdout_truncated = True
                    proc.terminate()
                    continue
                stdout_chunks.append(chunk)
                stdout_size += len(chunk)
            else:
                if stderr_truncated:
                    continue
                remaining_bytes = max_stderr_bytes - stderr_size
                if remaining_bytes <= 0:
                    stderr_truncated = True
                    proc.terminate()
                    continue
                if len(chunk) > remaining_bytes:
                    stderr_chunks.append(chunk[:remaining_bytes])
                    stderr_size += remaining_bytes
                    stderr_truncated = True
                    proc.terminate()
                    continue
                stderr_chunks.append(chunk)
                stderr_size += len(chunk)

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
