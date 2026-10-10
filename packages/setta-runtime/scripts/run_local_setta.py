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
LOCAL_ENVIRONMENTS = ROOT / "build" / "setta-wheel" / "local-environments"
LOCAL_BUILD_STATE = ROOT / "build" / "setta-wheel" / "local-build.json"
PACKAGED_APP_IDS = ("experiment-lens", "python-canvas", "realtime", "review")
APPLICATION_BUILD_INPUTS = tuple(
    ROOT / "apps" / app_id / relative
    for app_id in PACKAGED_APP_IDS
    for relative in (
        "backend",
        "index.html",
        "package.json",
        "src",
        "tsconfig.json",
        "vite.config.ts",
    )
) + tuple(
    ROOT / "apps" / app_id / "scripts"
    for app_id in ("experiment-lens", "realtime", "review")
)
LOCAL_BUILD_INPUTS = (
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
    ROOT / "packages" / "local-backend",
    *APPLICATION_BUILD_INPUTS,
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


def main(arguments: Sequence[str] | None = None) -> int:
    forwarded = tuple(sys.argv[1:] if arguments is None else arguments)
    if not forwarded:
        sys.stderr.write("Usage: run_local_setta.py APP [ARG ...]\n")
        return 2
    try:
        return run(forwarded)
    except (LocalRunError, OSError) as error:
        sys.stderr.write(f"run_local_setta: {error}\n")
        return 1


def run(arguments: Sequence[str]) -> int:
    return _run_foreground([str(prepare()), *arguments], ROOT)


def prepare() -> Path:
    inputs = _local_build_state()
    cached = _cached_local_executable(inputs)
    if cached is not None:
        sys.stdout.write("run_local_setta: reusing unchanged local build\n")
        return cached
    uv = _required_command("uv")
    go = _pinned_go()
    with tempfile.TemporaryDirectory(prefix="setta-local-wheel-") as wheel_directory:
        wheel = _build_current_wheel(go, Path(wheel_directory))
        setta = _install_current_wheel(uv, wheel)
    _record_local_build(inputs, setta)
    return setta


def _local_build_state() -> dict[str, object]:
    files: list[list[str | int]] = []
    for path in _build_input_files(LOCAL_BUILD_INPUTS):
        try:
            info = path.stat()
        except OSError as error:
            raise LocalRunError(f"cannot inspect local build input: {path}") from error
        files.append(
            [
                path.relative_to(ROOT).as_posix(),
                info.st_mtime_ns,
                info.st_ctime_ns,
                info.st_size,
            ]
        )
    return {
        "platform": [
            platform.system(),
            platform.machine(),
            sys.implementation.cache_tag,
        ],
        "files": files,
    }


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


def _cached_local_executable(inputs: dict[str, object]) -> Path | None:
    try:
        document = json.loads(LOCAL_BUILD_STATE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(document, dict) or document.get("inputs") != inputs:
        return None
    executable = document.get("executable")
    if not isinstance(executable, str):
        return None
    setta = Path(executable)
    if not setta.is_file() or not all(
        _installed_app_assets_valid(app_id, setta.parent.parent)
        for app_id in PACKAGED_APP_IDS
    ):
        return None
    return setta


def _record_local_build(inputs: dict[str, object], executable: Path) -> None:
    try:
        LOCAL_BUILD_STATE.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".local-build-", dir=LOCAL_BUILD_STATE.parent
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(
                    {"inputs": inputs, "executable": str(executable)},
                    stream,
                    sort_keys=True,
                )
                stream.write("\n")
            os.replace(temporary, LOCAL_BUILD_STATE)
        finally:
            temporary.unlink(missing_ok=True)
    except OSError:
        sys.stderr.write(
            "run_local_setta: build cache could not be saved; "
            "the next launch will rebuild\n"
        )


def _build_current_wheel(
    go: Path,
    wheel_directory: Path,
) -> Path:
    command = [
        sys.executable,
        str(BUILD_SCRIPT),
        "--go",
        str(go),
        "--wheel-dir",
        str(wheel_directory),
    ]
    if platform.system() == "Linux":
        architecture = {"x86_64": "x86_64", "aarch64": "aarch64", "arm64": "aarch64"}[
            platform.machine().lower()
        ]
        command.extend(("--wheel-platform-tag", f"linux_{architecture}"))
    _run(command, ROOT)
    wheels = tuple(wheel_directory.glob("*.whl"))
    if len(wheels) != 1 or not wheels[0].is_file():
        raise LocalRunError("the local build did not produce exactly one wheel")
    return wheels[0]


def _installed_app_assets_valid(app_id: str, environment: Path) -> bool:
    python, _ = _environment_executables(environment)
    if not python.is_file():
        return False
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
        return False
    return native_server.is_file() and web_root.is_dir()


def _install_current_wheel(uv: str, wheel: Path) -> Path:
    LOCAL_ENVIRONMENTS.mkdir(parents=True, exist_ok=True)
    environment = Path(tempfile.mkdtemp(prefix="build-", dir=LOCAL_ENVIRONMENTS))
    python, setta = _environment_executables(environment)
    _run([uv, "venv", "--python", sys.executable, str(environment)], ROOT)
    _run(
        [
            uv,
            "pip",
            "install",
            "--python",
            str(python),
            "--no-cache",
            "--only-binary",
            ":all:",
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
