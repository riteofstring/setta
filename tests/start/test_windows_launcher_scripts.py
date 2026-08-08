from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_install_windows_launcher_script_is_thin_delegate() -> None:
    script_path = _repo_root() / "scripts" / "install_windows_launcher.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert "launcher" in script_content
    assert "setup" in script_content
    assert "--json" in script_content
    assert "--artifact-option" in script_content
    assert "--install-source" in script_content
    assert "app_name=" in script_content
    assert "desktop_shortcut=true" in script_content
    assert "desktop_shortcut=false" in script_content
    assert "wrapper_path=" in script_content
    assert "CreateShortcut" not in script_content
    assert "MessageBox" not in script_content


def test_uninstall_windows_launcher_script_is_thin_delegate() -> None:
    script_path = _repo_root() / "scripts" / "uninstall_windows_launcher.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert "launcher" in script_content
    assert "remove" in script_content
    assert "--json" in script_content
    assert "Remove-Item" not in script_content
    assert ".lnk" not in script_content
