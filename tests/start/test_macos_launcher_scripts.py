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
