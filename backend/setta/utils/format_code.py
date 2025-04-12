import subprocess


def ruff_format(code_str):
    # Formatter example
    return subprocess.check_output(
        ["ruff", "format", "-"], input=code_str, encoding="utf-8"
    )
