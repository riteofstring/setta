import os
import subprocess
import sys
from pathlib import Path

_GO_OWNED_COMMANDS = frozenset(
    {
        "version",
        "launch",
        "share",
        "launcher",
        "status",
        "auth",
        "tools",
        "api",
        "stop",
        "connect",
        "c",
    }
)
_GO_GLOBAL_OPTIONS_WITH_VALUES = frozenset(
    {
        "-w",
        "--workspace",
        "--host",
        "--port",
        "--profile",
        "--profile-lookup-home",
        "--setta-home",
        "--setta-files-root",
        "--setta-files-location",
        "--runtime-root",
        "--log-level",
    }
)
_GO_GLOBAL_FLAG_OPTIONS = frozenset({"--no-open", "--reload"})
_GO_BINARY_OVERRIDE_ENV = "SETTA_GO_CLI_BIN"


def main(argv: list[str] | None = None) -> None:
    effective_argv = list(sys.argv[1:] if argv is None else argv)
    if resolve_go_dispatch_command(effective_argv) is not None:
        raise SystemExit(run_go_dispatch(effective_argv))

    from setta.start import cli

    cli.main(args=effective_argv, prog_name="setta", standalone_mode=True)


def resolve_go_dispatch_command(argv: list[str]) -> str | None:
    index = 0
    while index < len(argv):
        token = argv[index]
        if token == "--":
            return None
        if token in {"-h", "--help"}:
            return None
        if not token.startswith("-"):
            if token in _GO_OWNED_COMMANDS:
                return token
            return None

        option_name = token.split("=", 1)[0]
        if option_name in _GO_GLOBAL_OPTIONS_WITH_VALUES:
            if "=" in token:
                index += 1
                continue
            if index + 1 >= len(argv):
                return ""
            index += 2
            continue
        if option_name in _GO_GLOBAL_FLAG_OPTIONS:
            index += 1
            continue
        return None

    return ""


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
