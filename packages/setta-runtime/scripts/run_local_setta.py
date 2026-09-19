from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BUILD_SCRIPT = ROOT / "packages" / "setta-runtime" / "scripts" / "build_setta_wheel.py"
LOCAL_ENVIRONMENT = ROOT / "build" / "setta-wheel" / "local-environment"
LOCAL_BUILD_STATE = ROOT / "build" / "setta-wheel" / "local-build.json"
LOCAL_BUILD_STATE_FORMAT = 1
REALTIME_BUILD_INPUTS = (
    ROOT / ".code-polishy.lock.json",
    ROOT / ".node-version",
    ROOT / "LICENSE",
    ROOT / "README.md",
    ROOT / "package.json",
    ROOT / "pnpm-lock.yaml",
    ROOT / "pnpm-workspace.yaml",
    ROOT / "pyproject.toml",
    ROOT / "uv.lock",
    ROOT / "uv.toml",
    ROOT / "scripts" / "check-package-boundary.mjs",
    ROOT / "scripts" / "compile-katex-styles.mjs",
    ROOT / "packages" / "workspace" / "package.json",
    ROOT / "packages" / "workspace" / "src",
    ROOT / "packages" / "workspace" / "tailwind-preset.mjs",
    ROOT / "packages" / "workspace" / "tailwind.config.js",
    ROOT / "packages" / "workspace" / "tsconfig.build.json",
    ROOT / "packages" / "workspace" / "tsconfig.json",
    ROOT / "packages" / "workspace" / "vite.config.ts",
    ROOT / "apps" / "realtime" / "backend",
    ROOT / "apps" / "realtime" / "index.html",
    ROOT / "apps" / "realtime" / "package.json",
    ROOT / "apps" / "realtime" / "scripts",
    ROOT / "apps" / "realtime" / "src",
    ROOT / "apps" / "realtime" / "tsconfig.json",
    ROOT / "apps" / "realtime" / "vite.config.ts",
    ROOT / "packages" / "setta-runtime" / "licenses",
    ROOT / "packages" / "setta-runtime" / "platform_contract.py",
    ROOT / "packages" / "setta-runtime" / "scripts",
    ROOT / "packages" / "setta-runtime" / "setta_build_backend.py",
    ROOT / "packages" / "setta-runtime" / "src",
)
BUILD_INPUT_IGNORED_DIRECTORIES = {".ruff_cache", "__pycache__"}
BUILD_INPUT_IGNORED_SUFFIXES = {".pyc"}


class LocalRunError(RuntimeError):
    pass


@dataclass(frozen=True)
class ReusableAppAssets:
    native_server: Path
    web_root: Path


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
    fingerprint = _realtime_build_fingerprint() if arguments[0] == "realtime" else None
    if fingerprint is not None:
        cached = _cached_realtime_executable(fingerprint)
        if cached is not None:
            sys.stdout.write("run_local_setta: reusing unchanged local build\n")
            return _run_foreground([str(cached), *arguments], ROOT)
    uv = _required_command("uv")
    pnpm = _required_command("pnpm")
    go = _pinned_go()
    _run([pnpm, "install", "--frozen-lockfile"], ROOT)
    reusable = _realtime_reusable_assets() if arguments[0] == "realtime" else None
    if reusable is not None:
        _build_realtime_frontend(pnpm, go)
    with tempfile.TemporaryDirectory(prefix="setta-local-wheel-") as wheel_directory:
        wheel = _build_current_wheel(go, Path(wheel_directory), reusable)
        setta = _install_current_wheel(uv, wheel)
    if fingerprint is not None:
        _record_realtime_build(fingerprint)
    return _run_foreground([str(setta), *arguments], ROOT)


def _realtime_build_fingerprint() -> str:
    digest = hashlib.sha256()
    digest.update(
        f"{platform.system()}\0{platform.machine()}\0{sys.implementation.cache_tag}\0".encode()
    )
    for path in _build_input_files(REALTIME_BUILD_INPUTS):
        try:
            relative = path.relative_to(ROOT).as_posix()
            payload = path.read_bytes()
        except OSError as error:
            raise LocalRunError(f"cannot read local build input: {path}") from error
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(payload)
        digest.update(b"\0")
    return digest.hexdigest()


def _build_input_files(inputs: Sequence[Path]) -> tuple[Path, ...]:
    files: list[Path] = []
    for path in inputs:
        if path.is_file() and not path.is_symlink():
            files.append(path)
            continue
        if not path.is_dir() or path.is_symlink():
            raise LocalRunError(f"local build input is missing or invalid: {path}")
        for candidate in path.rglob("*"):
            if any(
                part in BUILD_INPUT_IGNORED_DIRECTORIES
                for part in candidate.relative_to(path).parts
            ):
                continue
            if (
                candidate.is_file()
                and not candidate.is_symlink()
                and candidate.suffix not in BUILD_INPUT_IGNORED_SUFFIXES
            ):
                files.append(candidate)
    return tuple(sorted(files, key=lambda candidate: candidate.as_posix()))


def _cached_realtime_executable(fingerprint: str) -> Path | None:
    try:
        document = json.loads(LOCAL_BUILD_STATE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if document != {
        "fingerprint": fingerprint,
        "format": LOCAL_BUILD_STATE_FORMAT,
    }:
        return None
    _, setta = _environment_executables(LOCAL_ENVIRONMENT)
    if not setta.is_file() or _reusable_app_assets("realtime") is None:
        return None
    return setta


def _record_realtime_build(fingerprint: str) -> None:
    document = {
        "fingerprint": fingerprint,
        "format": LOCAL_BUILD_STATE_FORMAT,
    }
    try:
        LOCAL_BUILD_STATE.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".local-build-", dir=LOCAL_BUILD_STATE.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(document, stream, sort_keys=True)
                stream.write("\n")
            os.replace(temporary, LOCAL_BUILD_STATE)
        finally:
            temporary.unlink(missing_ok=True)
    except OSError as error:
        raise LocalRunError("cannot record the local Setta build") from error


def _build_current_wheel(
    go: Path,
    wheel_directory: Path,
    reusable: Mapping[str, ReusableAppAssets] | None = None,
) -> Path:
    command = [
        sys.executable,
        str(BUILD_SCRIPT),
        "--go",
        str(go),
        "--wheel-dir",
        str(wheel_directory),
    ]
    if reusable is not None:
        command.append("--skip-frontend-build")
        for app_id in sorted(reusable):
            assets = reusable[app_id]
            command.extend(
                [
                    "--native-server",
                    f"{app_id}={assets.native_server}",
                    "--web-root",
                    f"{app_id}={assets.web_root}",
                ]
            )
    _run(command, ROOT)
    wheels = tuple(wheel_directory.glob("*.whl"))
    if len(wheels) != 1 or not wheels[0].is_file():
        raise LocalRunError("the local build did not produce exactly one wheel")
    return wheels[0]


def _build_realtime_frontend(pnpm: str, go: Path) -> None:
    environment = os.environ.copy()
    inherited_path = environment.get("PATH")
    path_entries = [str(go.parent)]
    if inherited_path:
        path_entries.append(inherited_path)
    environment["PATH"] = os.pathsep.join(path_entries)
    _run(
        [pnpm, "--filter", "@setta/realtime", "run", "build"],
        ROOT,
        environment=environment,
    )


def _realtime_reusable_assets() -> dict[str, ReusableAppAssets] | None:
    reusable: dict[str, ReusableAppAssets] = {}
    for app_id in ("python-canvas", "review"):
        assets = _reusable_app_assets(app_id)
        if assets is None:
            return None
        reusable[app_id] = assets
    return reusable


def _reusable_app_assets(app_id: str) -> ReusableAppAssets | None:
    python, _ = _environment_executables(LOCAL_ENVIRONMENT)
    if not python.is_file():
        return None
    source = (
        "import json, sys; "
        "from setta.runtime import PackagedRuntime; "
        "app = PackagedRuntime().app(sys.argv[1]); "
        "print(json.dumps({'nativeServer': str(app.native_server), "
        "'webRoot': str(app.web_root)}))"
    )
    try:
        completed = subprocess.run(
            [str(python), "-c", source, app_id],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        document = json.loads(completed.stdout)
        native_server = Path(document["nativeServer"])
        web_root = Path(document["webRoot"])
    except (
        OSError,
        KeyError,
        TypeError,
        json.JSONDecodeError,
        subprocess.CalledProcessError,
    ):
        return None
    if not native_server.is_file() or not web_root.is_dir():
        return None
    return ReusableAppAssets(native_server=native_server, web_root=web_root)


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


def _run(
    command: list[str],
    cwd: Path,
    *,
    environment: dict[str, str] | None = None,
) -> None:
    try:
        subprocess.run(command, cwd=cwd, check=True, env=environment)
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
