import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_setta_stub(*, path: Path, args_capture_path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{args_capture_path}"
cat <<'JSON'
{{
  "ok": true,
  "metadataPath": "/tmp/launcher-install.json",
  "targetCommand": ["/tmp/tool-python", "-m", "setta"],
  "managedArtifacts": {{
    "macosApp": "/tmp/Setta.app"
  }}
}}
JSON
""",
        encoding="utf-8",
    )
    path.chmod(0o755)


def _write_failing_python_stubs(*, bin_dir: Path, calls_path: Path) -> None:
    bin_dir.mkdir(parents=True, exist_ok=True)
    for name in ("python", "python3"):
        stub_path = bin_dir / name
        stub_path.write_text(
            f"""#!/usr/bin/env bash
set -euo pipefail
echo "{name}" >> "{calls_path}"
exit 97
""",
            encoding="utf-8",
        )
        stub_path.chmod(0o755)


def test_macos_launcher_scripts_do_not_embed_python_parsers() -> None:
    install_script = (
        _repo_root() / "scripts" / "install_macos_launcher.sh"
    ).read_text(encoding="utf-8")
    uninstall_script = (
        _repo_root() / "scripts" / "uninstall_macos_launcher.sh"
    ).read_text(encoding="utf-8")

    assert "python3 -" not in install_script
    assert "python3 -" not in uninstall_script
    assert "python -" not in install_script
    assert "python -" not in uninstall_script


def test_install_macos_launcher_script_delegates_to_launcher_setup(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "install_macos_launcher.sh"
    app_path = tmp_path / "Applications" / "Setta.app"
    args_capture_path = tmp_path / "setta-args.txt"

    setta_stub = tmp_path / "bin" / "setta"
    _write_setta_stub(path=setta_stub, args_capture_path=args_capture_path)

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--setta-bin",
            str(setta_stub),
            "--app-path",
            str(app_path),
            "--open-mode",
            "chrome-app",
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher setup --json" in captured
    assert "--channel macos-script" in captured
    assert "--install-source installer-managed" in captured
    assert "--open-mode chrome-app" in captured
    assert (
        "--artifact-option "
        f"app_path={app_path.resolve(strict=False)}" in captured
    )


def test_install_macos_launcher_script_supports_optional_icns_icon(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "install_macos_launcher.sh"
    app_path = tmp_path / "Applications" / "Setta.app"
    args_capture_path = tmp_path / "setta-args.txt"
    icon_path = tmp_path / "Setta.icns"
    icon_path.write_text("icon", encoding="utf-8")

    setta_stub = tmp_path / "bin" / "setta"
    _write_setta_stub(path=setta_stub, args_capture_path=args_capture_path)

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--setta-bin",
            str(setta_stub),
            "--app-path",
            str(app_path),
            "--icon-path",
            str(icon_path),
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    captured = args_capture_path.read_text(encoding="utf-8")
    assert (
        "--artifact-option "
        f"icon_path={icon_path.resolve(strict=False)}" in captured
    )


def test_uninstall_macos_launcher_script_delegates_to_launcher_remove(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "uninstall_macos_launcher.sh"
    args_capture_path = tmp_path / "setta-args.txt"

    setta_stub = tmp_path / "bin" / "setta"
    setta_stub.parent.mkdir(parents=True, exist_ok=True)
    setta_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{args_capture_path}"
cat <<'JSON'
{{"ok":true,"metadataRemoved":true,"removedPaths":[],"missingPaths":[]}}
JSON
""",
        encoding="utf-8",
    )
    setta_stub.chmod(0o755)

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--setta-bin",
            str(setta_stub),
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher remove --json" in captured


def test_macos_launcher_scripts_ignore_python_binaries_on_path(tmp_path: Path) -> None:
    install_script = _repo_root() / "scripts" / "install_macos_launcher.sh"
    uninstall_script = _repo_root() / "scripts" / "uninstall_macos_launcher.sh"

    args_capture_path = tmp_path / "setta-args.txt"
    python_calls_path = tmp_path / "python-calls.txt"
    setta_stub = tmp_path / "bin" / "setta"
    _write_setta_stub(path=setta_stub, args_capture_path=args_capture_path)
    _write_failing_python_stubs(bin_dir=tmp_path / "fake-bin", calls_path=python_calls_path)

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")
    env["PATH"] = f"{tmp_path / 'fake-bin'}:{env.get('PATH', '')}"

    install_result = subprocess.run(
        [
            "bash",
            str(install_script),
            "--setta-bin",
            str(setta_stub),
            "--app-path",
            str(tmp_path / "Applications" / "Setta.app"),
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert install_result.returncode == 0, install_result.stderr

    uninstall_result = subprocess.run(
        [
            "bash",
            str(uninstall_script),
            "--setta-bin",
            str(setta_stub),
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert uninstall_result.returncode == 0, uninstall_result.stderr
    assert not python_calls_path.exists()
