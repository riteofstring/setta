import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_install_linux_launcher_script_creates_desktop_entry_and_wrapper(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "install_linux_launcher.sh"
    apps_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"
    desktop_shortcut_path = tmp_path / "Desktop" / "Setta.desktop"
    args_capture_path = tmp_path / "setta-args.txt"

    setta_stub = tmp_path / "bin" / "setta"
    setta_stub.parent.mkdir(parents=True, exist_ok=True)
    target_python = tmp_path / "tool-python"
    target_python.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
    target_python.chmod(0o755)
    setta_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{args_capture_path}"
cat <<'JSON'
{{"ok":true,"targetCommand":["{target_python}","-m","setta"]}}
JSON
""",
        encoding="utf-8",
    )
    setta_stub.chmod(0o755)

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

    desktop_entry_path = apps_dir / "setta-test.desktop"
    assert wrapper_path.exists()
    assert desktop_entry_path.exists()
    assert desktop_shortcut_path.exists()

    wrapper_content = wrapper_path.read_text(encoding="utf-8")
    assert str(target_python) in wrapper_content
    assert "launcher --workspace" in wrapper_content
    assert "exec" in wrapper_content

    desktop_entry_content = desktop_entry_path.read_text(encoding="utf-8")
    assert "Name=Setta Test" in desktop_entry_content
    assert f"Exec={wrapper_path}" in desktop_entry_content

    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher install --json" in captured
    assert (
        f"--managed-artifact linuxDesktopEntry={desktop_entry_path.resolve(strict=False)}"
        in captured
    )
    assert (
        f"--managed-artifact linuxWrapper={wrapper_path.resolve(strict=False)}"
        in captured
    )
    assert (
        "--managed-artifact "
        f"linuxDesktopShortcut={desktop_shortcut_path.resolve(strict=False)}" in captured
    )
    assert "--open-mode chrome-app" in captured


def test_uninstall_linux_launcher_script_removes_artifacts(tmp_path: Path) -> None:
    script_path = _repo_root() / "scripts" / "uninstall_linux_launcher.sh"
    apps_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"
    desktop_shortcut_path = tmp_path / "Desktop" / "Setta.desktop"
    desktop_entry_path = apps_dir / "setta-test.desktop"
    desktop_entry_path.parent.mkdir(parents=True, exist_ok=True)
    desktop_entry_path.write_text("placeholder", encoding="utf-8")
    wrapper_path.parent.mkdir(parents=True, exist_ok=True)
    wrapper_path.write_text("placeholder", encoding="utf-8")
    desktop_shortcut_path.parent.mkdir(parents=True, exist_ok=True)
    desktop_shortcut_path.write_text("placeholder", encoding="utf-8")
    args_capture_path = tmp_path / "setta-args.txt"

    setta_stub = tmp_path / "bin" / "setta"
    setta_stub.parent.mkdir(parents=True, exist_ok=True)
    setta_stub.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "{args_capture_path}"
cat <<'JSON'
{{"ok":true,"removedPaths":[],"missingPaths":[]}}
JSON
""",
        encoding="utf-8",
    )
    setta_stub.chmod(0o755)

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
            "--desktop-shortcut-path",
            str(desktop_shortcut_path),
        ],
        cwd=_repo_root(),
        env=os.environ.copy(),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert not desktop_entry_path.exists()
    assert not wrapper_path.exists()
    assert not desktop_shortcut_path.exists()

    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher uninstall --json" in captured
