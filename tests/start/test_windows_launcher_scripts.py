from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_install_windows_launcher_script_contains_shortcut_and_wrapper_wiring() -> None:
    script_path = _repo_root() / "scripts" / "install_windows_launcher.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert "launcher" in script_content
    assert "install" in script_content
    assert "--json" in script_content
    assert "windowsWrapper=" in script_content
    assert "windowsStartMenuShortcut=" in script_content
    assert "setta-launcher.cmd" in script_content
    assert "CreateShortcut" in script_content
    assert ".lnk" in script_content


def test_uninstall_windows_launcher_script_contains_uninstall_and_artifact_removal() -> None:
    script_path = _repo_root() / "scripts" / "uninstall_windows_launcher.ps1"
    script_content = script_path.read_text(encoding="utf-8")

    assert "launcher" in script_content
    assert "uninstall" in script_content
    assert "--json" in script_content
    assert "Remove-Item" in script_content
    assert "setta-launcher.cmd" in script_content
    assert ".lnk" in script_content
