import os
import subprocess
import sys
from pathlib import Path

_GO_BINARY_OVERRIDE_ENV = "SETTA_GO_CLI_BIN"
_SOURCE_CHECKOUT_COMMAND = ["scripts/go.sh", "run", "./cmd/setta"]


def main(argv: list[str] | None = None) -> None:
    effective_argv = list(sys.argv[1:] if argv is None else argv)
    raise SystemExit(run_go_dispatch(effective_argv))


def run_go_dispatch(argv: list[str]) -> int:
    try:
        command, command_cwd = resolve_go_cli_command()
    except OSError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    try:
        completed = subprocess.run([*command, *argv], check=False, cwd=command_cwd)
    except OSError as exc:
        print(f"Failed to execute Go Setta command: {exc}", file=sys.stderr)
        return 1
    return completed.returncode


def resolve_go_cli_command() -> tuple[list[str], Path | None]:
    override = os.environ.get(_GO_BINARY_OVERRIDE_ENV, "").strip()
    if override:
        binary = validate_executable_path(
            Path(override),
            f"{_GO_BINARY_OVERRIDE_ENV} points to a missing or invalid executable",
        )
        return [str(binary)], None

    package_root = Path(__file__).resolve(strict=False).parent
    source_checkout_root = resolve_source_checkout_root(package_root)
    if source_checkout_root is not None:
        go_wrapper = validate_executable_path(
            source_checkout_root / "scripts" / "go.sh",
            "Source checkout Go wrapper is missing or invalid",
        )
        command = [str(go_wrapper), *_SOURCE_CHECKOUT_COMMAND[1:]]
        return command, source_checkout_root

    binary_name = "setta.exe" if os.name == "nt" else "setta"
    candidate = package_root / "go_bin" / binary_name
    if candidate.exists():
        binary = validate_executable_path(
            candidate,
            "Packaged Go Setta binary was not found. Rebuild the distribution with build.sh or install an official packaged release.",
        )
        return [str(binary)], None

    raise FileNotFoundError(
        "Packaged Go Setta binary was not found. Rebuild the distribution with build.sh or install an official packaged release.",
    )


def resolve_source_checkout_root(package_root: Path) -> Path | None:
    for candidate in package_root.parents:
        if source_checkout_root(candidate):
            return candidate
    return None


def source_checkout_root(root: Path) -> bool:
    required = (
        root / "go.mod",
        root / "scripts" / "go.sh",
        root / "cmd" / "setta" / "main.go",
    )
    return all(path.exists() and path.is_file() for path in required)


def validate_executable_path(path: Path, missing_message: str) -> Path:
    resolved = path.expanduser().resolve(strict=False)
    if not resolved.exists() or not resolved.is_file():
        raise FileNotFoundError(f"{missing_message}: {resolved}")
    if os.name != "nt" and os.access(resolved, os.X_OK) is False:
        raise PermissionError(f"Packaged Go Setta binary is not executable: {resolved}")
    return resolved
