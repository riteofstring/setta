import os
import subprocess
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_install_macos_launcher_script_creates_app_bundle(tmp_path: Path) -> None:
    script_path = _repo_root() / "scripts" / "install_macos_launcher.sh"
    app_path = tmp_path / "Applications" / "Setta.app"
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

    env = os.environ.copy()
    env["HOME"] = str(tmp_path / "home")
    env["SETTA_STUB_ARGS_FILE"] = str(args_capture_path)

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

    launcher_binary = app_path / "Contents" / "MacOS" / "setta-launcher"
    info_plist = app_path / "Contents" / "Info.plist"
    assert launcher_binary.exists()
    assert info_plist.exists()

    launcher_content = launcher_binary.read_text(encoding="utf-8")
    assert str(target_python) in launcher_content
    assert "--workspace" in launcher_content
    assert "run_launcher()" in launcher_content
    assert "Setta Launch Failed" in launcher_content
    assert "install_macos_launcher.sh" in launcher_content
    assert "eval" in launcher_content

    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher install --json" in captured
    assert (
        f"--managed-artifact macosApp={app_path.resolve(strict=False)}" in captured
    )
    assert "--open-mode chrome-app" in captured


def test_install_macos_launcher_script_supports_optional_icns_icon(
    tmp_path: Path,
) -> None:
    script_path = _repo_root() / "scripts" / "install_macos_launcher.sh"
    app_path = tmp_path / "Applications" / "Setta.app"
    args_capture_path = tmp_path / "setta-args.txt"
    icon_path = tmp_path / "Setta.icns"
    icon_path.write_text("icon", encoding="utf-8")

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

    installed_icon = app_path / "Contents" / "Resources" / "Setta.icns"
    assert installed_icon.exists()
    assert installed_icon.read_text(encoding="utf-8") == "icon"

    info_plist = (app_path / "Contents" / "Info.plist").read_text(encoding="utf-8")
    assert "<key>CFBundleIconFile</key>" in info_plist
    assert "<string>Setta.icns</string>" in info_plist


def test_uninstall_macos_launcher_script_removes_app_bundle(tmp_path: Path) -> None:
    script_path = _repo_root() / "scripts" / "uninstall_macos_launcher.sh"
    app_path = tmp_path / "Applications" / "Setta.app"
    app_path.mkdir(parents=True, exist_ok=True)
    (app_path / "placeholder").write_text("x", encoding="utf-8")
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
        ],
        cwd=_repo_root(),
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert not app_path.exists()
    captured = args_capture_path.read_text(encoding="utf-8")
    assert "launcher uninstall --json" in captured
