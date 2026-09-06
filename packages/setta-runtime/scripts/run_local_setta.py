from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BUILD_SCRIPT = ROOT / "packages" / "setta-runtime" / "scripts" / "build_setta_wheel.py"
LOCAL_ENVIRONMENT = ROOT / "build" / "setta-wheel" / "local-environment"


class LocalRunError(RuntimeError):
    pass


def main(arguments: Sequence[str] | None = None) -> int:
    forwarded = tuple(sys.argv[1:] if arguments is None else arguments)
    if not forwarded:
        sys.stderr.write("Usage: run_local_setta.py APP [ARG ...]\n")
        return 2
    try:
        return run(forwarded)
    except LocalRunError as error:
        sys.stderr.write(f"run_local_setta: {error}\n")
        return 1


def run(arguments: Sequence[str]) -> int:
    uv = _required_command("uv")
    pnpm = _required_command("pnpm")
    go = _pinned_go()
    _run([pnpm, "install", "--frozen-lockfile"], ROOT)
    with tempfile.TemporaryDirectory(prefix="setta-local-wheel-") as wheel_directory:
        wheel = _build_current_wheel(go, Path(wheel_directory))
        setta = _install_current_wheel(uv, wheel)
    return _run_foreground([str(setta), *arguments], ROOT)


def _build_current_wheel(go: Path, wheel_directory: Path) -> Path:
    _run(
        [
            sys.executable,
            str(BUILD_SCRIPT),
            "--go",
            str(go),
            "--wheel-dir",
            str(wheel_directory),
        ],
        ROOT,
    )
    wheels = tuple(wheel_directory.glob("*.whl"))
    if len(wheels) != 1 or not wheels[0].is_file():
        raise LocalRunError("the local build did not produce exactly one wheel")
    return wheels[0]


def _install_current_wheel(uv: str, wheel: Path) -> Path:
    python, setta = _environment_executables(LOCAL_ENVIRONMENT)
    if not python.is_file():
        _run(
            [uv, "venv", "--python", sys.executable, str(LOCAL_ENVIRONMENT)],
            ROOT,
        )
    _run(
        [
            uv,
            "pip",
            "install",
            "--python",
            str(python),
            "--reinstall-package",
            "setta",
            "--no-cache",
            str(wheel),
        ],
        ROOT,
    )
    if not setta.is_file():
        raise LocalRunError("the local Setta executable is missing after installation")
    return setta


def _environment_executables(root: Path) -> tuple[Path, Path]:
    if os.name == "nt":
        scripts = root / "Scripts"
        return scripts / "python.exe", scripts / "setta.exe"
    binaries = root / "bin"
    return binaries / "python", binaries / "setta"


def _pinned_go() -> Path:
    try:
        lock = json.loads(
            (ROOT / ".code-polishy.lock.json").read_text(encoding="utf-8")
        )
        version = lock["codePolishyVersion"]
        digest = lock["releaseDigest"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise LocalRunError("the Code Polishy lock is invalid") from error
    system = {"Darwin": "darwin", "Linux": "linux", "Windows": "windows"}.get(
        platform.system()
    )
    machine = {
        "arm64": "arm64",
        "aarch64": "arm64",
        "x86_64": "amd64",
        "amd64": "amd64",
    }.get(platform.machine().lower())
    if system is None or machine is None:
        raise LocalRunError("the locked Go toolchain does not support this machine")
    executable = "go.exe" if system == "windows" else "go"
    for prefix in _code_polishy_prefixes():
        candidate = (
            prefix
            / "releases"
            / f"{version}-{digest}"
            / ".tools"
            / "go"
            / f"{system}-{machine}"
            / "go"
            / "bin"
            / executable
        )
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise LocalRunError("the locked Code Polishy Go toolchain is not installed")


def _code_polishy_prefixes() -> tuple[Path, ...]:
    prefixes: list[Path] = []
    launcher = shutil.which("code-polishy")
    if launcher is not None:
        prefixes.append(Path(launcher).resolve().parent.parent)
    prefixes.append(Path.home() / ".local" / "share" / "code-polishy")
    return tuple(dict.fromkeys(prefixes))


def _required_command(name: str) -> str:
    command = shutil.which(name)
    if command is None:
        raise LocalRunError(f"{name} is required")
    return command


def _run(command: list[str], cwd: Path) -> None:
    try:
        subprocess.run(command, cwd=cwd, check=True)
    except OSError as error:
        raise LocalRunError(f"cannot execute {command[0]}") from error
    except subprocess.CalledProcessError as error:
        raise LocalRunError(f"command failed: {command[0]}") from error


def _run_foreground(command: list[str], cwd: Path) -> int:
    try:
        return subprocess.run(command, cwd=cwd, check=False).returncode
    except KeyboardInterrupt:
        return 0
    except OSError as error:
        raise LocalRunError(f"cannot execute {command[0]}") from error


if __name__ == "__main__":
    raise SystemExit(main())
