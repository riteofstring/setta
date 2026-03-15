import re
import subprocess

_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def ruff_format(code: str, *, include_lint: bool = False) -> str:
    formatted = _run_ruff(["check", "--quiet", "--select", "I", "--fix", "-"], code)
    if include_lint:
        formatted = _run_ruff(["check", "--quiet", "--fix", "-"], formatted)
    return _run_ruff(["format", "--quiet", "-"], formatted)


def _run_ruff(args: list[str], code: str) -> str:
    try:
        completed = subprocess.run(
            ["ruff", *args],
            check=False,
            input=code,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Ruff executable was not found on PATH.") from exc

    if completed.returncode != 0:
        stderr = _strip_ansi(completed.stderr).strip()
        stdout = _strip_ansi(completed.stdout).strip()
        if stderr:
            raise RuntimeError(stderr)
        if stdout:
            raise RuntimeError(stdout)
        raise RuntimeError(f"Ruff failed with exit code {completed.returncode}.")

    if completed.stdout:
        return completed.stdout
    return code


def _strip_ansi(text: str) -> str:
    return _ANSI_ESCAPE_RE.sub("", text)
