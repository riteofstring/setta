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
