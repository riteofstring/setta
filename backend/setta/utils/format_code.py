import subprocess


def ruff_format(code_str):
    # Formatter example
    code_str = subprocess.check_output(
        ["ruff", "check", "--select", "I", "--fix", "-"],
        input=code_str,
        encoding="utf-8",
    )
    code_str = subprocess.check_output(
        ["ruff", "check", "--fix", "-"],
        input=code_str,
        encoding="utf-8",
    )
    return subprocess.check_output(
        ["ruff", "format", "-"], input=code_str, encoding="utf-8"
    )
