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
    "linuxDesktopEntry": "/tmp/setta.desktop",
    "linuxWrapper": "/tmp/setta-launcher"
  }}
}}
JSON
""",
        encoding="utf-8",
    )
    path.chmod(0o755)


def test_install_linux_launcher_script_delegates_to_launcher_setup(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "install_linux_launcher.sh"
    apps_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"
    desktop_shortcut_path = tmp_path / "Desktop" / "Setta.desktop"
    args_capture_path = tmp_path / "setta-args.txt"

    setta_stub = tmp_path / "bin" / "setta"
    _write_setta_stub(path=setta_stub, args_capture_path=args_capture_path)

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--setta-bin",
            str(setta_stub),
            "--applications-dir",
            str(apps_dir),
            "--desktop-entry-name",
            "setta-test.desktop",
            "--wrapper-path",
            str(wrapper_path),
            "--desktop-shortcut",
            "--desktop-shortcut-path",
            str(desktop_shortcut_path),
            "--app-name",
            "Setta Test",
            "--open-mode",
            "chrome-app",
        ],
        cwd=_repo_root(),
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr

    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher setup --json" in captured
    assert "--channel linux-script" in captured
    assert "--open-mode chrome-app" in captured
    assert (
        "--artifact-option "
        f"applications_dir={apps_dir.resolve(strict=False)}" in captured
    )
    assert "--artifact-option desktop_entry_name=setta-test.desktop" in captured
    assert (
        "--artifact-option "
        f"wrapper_path={wrapper_path.resolve(strict=False)}" in captured
    )
    assert "--artifact-option app_name=Setta Test" in captured
    assert "--artifact-option desktop_shortcut=true" in captured
    assert (
        "--artifact-option "
        f"desktop_shortcut_path={desktop_shortcut_path.resolve(strict=False)}"
        in captured
    )


def test_uninstall_linux_launcher_script_delegates_to_launcher_remove(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "uninstall_linux_launcher.sh"
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

    marker_file = tmp_path / "should-stay.txt"
    marker_file.write_text("still here", encoding="utf-8")

    result = subprocess.run(
        [
            "bash",
            str(script_path),
            "--setta-bin",
            str(setta_stub),
        ],
        cwd=_repo_root(),
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher remove --json" in captured
    # Thin wrapper: local files are not removed directly by the script.
    assert marker_file.exists()
