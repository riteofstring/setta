import os
import subprocess
import sys
from pathlib import Path

_GO_BINARY_OVERRIDE_ENV = "SETTA_GO_CLI_BIN"


def main(argv: list[str] | None = None) -> None:
    effective_argv = list(sys.argv[1:] if argv is None else argv)
    raise SystemExit(run_go_dispatch(effective_argv))


def run_go_dispatch(argv: list[str]) -> int:
    try:
        go_binary = resolve_go_cli_binary()
    except OSError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    try:
        completed = subprocess.run([str(go_binary), *argv], check=False)
    except OSError as exc:
        print(f"Failed to execute packaged Go Setta binary: {exc}", file=sys.stderr)
        return 1
    return completed.returncode


def resolve_go_cli_binary() -> Path:
    override = os.environ.get(_GO_BINARY_OVERRIDE_ENV, "").strip()
    if override:
        return validate_go_binary_path(
            Path(override),
            f"{_GO_BINARY_OVERRIDE_ENV} points to a missing or invalid executable",
        )

    package_root = Path(__file__).resolve(strict=False).parent
    binary_name = "setta.exe" if os.name == "nt" else "setta"
    candidate = package_root / "go_bin" / binary_name
    return validate_go_binary_path(
        candidate,
        "Packaged Go Setta binary was not found. Rebuild the distribution with build.sh or install an official packaged release.",
    )


def validate_go_binary_path(path: Path, missing_message: str) -> Path:
    resolved = path.expanduser().resolve(strict=False)
    if not resolved.exists() or not resolved.is_file():
        raise FileNotFoundError(f"{missing_message}: {resolved}")
    if os.name != "nt" and os.access(resolved, os.X_OK) is False:
        raise PermissionError(f"Packaged Go Setta binary is not executable: {resolved}")
    return resolved
