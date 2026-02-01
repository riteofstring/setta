import re
import subprocess


def ruff_format(code_str):
    code_str = subprocess.check_output(
        ["ruff", "check", "--quiet", "--select", "I", "--fix", "-"],
        input=code_str,
        encoding="utf-8",
    )
    code_str = subprocess.check_output(
        ["ruff", "check", "--quiet", "--fix", "-"],
        input=code_str,
        encoding="utf-8",
    )
    return subprocess.check_output(
        ["ruff", "format", "--quiet", "-"], input=code_str, encoding="utf-8"
    )


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def _strip_ansi(text: str) -> str:
    return ANSI_ESCAPE_RE.sub("", text)


def _run_ruff(args: list[str], code_str: str) -> tuple[str, str | None]:
    result = subprocess.run(
        args,
        input=code_str,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        error = result.stderr.strip() or result.stdout.strip()
        if error:
            error = _strip_ansi(error)
        if not error:
            error = f"Ruff failed with exit code {result.returncode}."
        return code_str, error
    return result.stdout or code_str, None


def ruff_format_with_error(
    code_str: str, *, include_lint: bool = True
) -> tuple[str | None, str | None]:
    code_str, error = _run_ruff(
        ["ruff", "check", "--quiet", "--select", "I", "--fix", "-"], code_str
    )
    if error:
        return None, error
    if include_lint:
        code_str, error = _run_ruff(
            ["ruff", "check", "--quiet", "--fix", "-"], code_str
        )
        if error:
            return None, error
    code_str, error = _run_ruff(["ruff", "format", "--quiet", "-"], code_str)
    if error:
        return None, error
    return code_str, None
