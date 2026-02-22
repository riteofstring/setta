from pathlib import Path

from setta.launcher_artifacts import LauncherArtifactContext
from setta.launcher_artifacts.linux import install_linux_artifacts
from setta.launcher_artifacts.macos import install_macos_artifacts
from setta.launcher_artifacts.windows import install_windows_artifacts


def test_install_macos_artifacts_writes_bundle_files(tmp_path: Path) -> None:
    app_path = tmp_path / "Applications" / "Setta.app"
    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        channel="manual",
        existing_managed_artifacts={},
        options={"app_path": str(app_path)},
    )

    artifacts = install_macos_artifacts(context=context)

    launcher_script_path = app_path / "Contents" / "MacOS" / "setta-launcher"
    info_plist_path = app_path / "Contents" / "Info.plist"

    assert artifacts == {"macosApp": str(app_path.resolve(strict=False))}
    assert launcher_script_path.exists()
    assert info_plist_path.exists()

    launcher_script = launcher_script_path.read_text(encoding="utf-8")
    info_plist = info_plist_path.read_text(encoding="utf-8")

    assert "launcher repair" in launcher_script
    assert "/tmp/python" in launcher_script
    assert "CFBundleExecutable" in info_plist


def test_install_macos_artifacts_copies_optional_icon(tmp_path: Path) -> None:
    app_path = tmp_path / "Applications" / "Setta.app"
    icon_path = tmp_path / "Setta.icns"
    icon_path.write_text("icon", encoding="utf-8")

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        channel="manual",
        existing_managed_artifacts={},
        options={"app_path": str(app_path), "icon_path": str(icon_path)},
    )

    install_macos_artifacts(context=context)

    copied_icon = app_path / "Contents" / "Resources" / "Setta.icns"
    info_plist = (app_path / "Contents" / "Info.plist").read_text(encoding="utf-8")

    assert copied_icon.exists()
    assert "CFBundleIconFile" in info_plist
    assert "Setta.icns" in info_plist


def test_install_linux_artifacts_writes_wrapper_entry_and_shortcut(
    tmp_path: Path,
    monkeypatch,
) -> None:
    applications_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"
    desktop_shortcut_path = tmp_path / "Desktop" / "setta.desktop"
    icon_path = tmp_path / "setta.png"
    icon_path.write_text("png", encoding="utf-8")

    monkeypatch.setattr(
        "setta.launcher_artifacts.linux._refresh_desktop_database",
        lambda _applications_dir: None,
    )

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        channel="linux-script",
        existing_managed_artifacts={},
        options={
            "applications_dir": str(applications_dir),
            "desktop_entry_name": "setta.desktop",
            "wrapper_path": str(wrapper_path),
            "desktop_shortcut": "true",
            "desktop_shortcut_path": str(desktop_shortcut_path),
            "app_name": "Setta Test",
            "icon_path": str(icon_path),
        },
    )

    artifacts = install_linux_artifacts(context=context)

    desktop_entry_path = applications_dir / "setta.desktop"
    assert artifacts == {
        "linuxDesktopEntry": str(desktop_entry_path),
        "linuxWrapper": str(wrapper_path),
        "linuxDesktopShortcut": str(desktop_shortcut_path),
    }
    assert desktop_entry_path.exists()
    assert wrapper_path.exists()
    assert desktop_shortcut_path.exists()

    wrapper_script = wrapper_path.read_text(encoding="utf-8")
    desktop_entry = desktop_entry_path.read_text(encoding="utf-8")

    assert "launcher repair" in wrapper_script
    assert "linux-script" in wrapper_script
    assert "Name=Setta Test" in desktop_entry
    assert f"Icon={icon_path.resolve(strict=False)}" in desktop_entry


def test_install_linux_artifacts_removes_existing_shortcut_when_disabled(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setattr(
        "setta.launcher_artifacts.linux._refresh_desktop_database",
        lambda _applications_dir: None,
    )

    applications_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"
    desktop_shortcut_path = tmp_path / "Desktop" / "setta.desktop"
    desktop_shortcut_path.parent.mkdir(parents=True, exist_ok=True)
    desktop_shortcut_path.write_text("shortcut", encoding="utf-8")

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        channel="linux-script",
        existing_managed_artifacts={
            "linuxDesktopShortcut": str(desktop_shortcut_path),
        },
        options={
            "applications_dir": str(applications_dir),
            "desktop_entry_name": "setta.desktop",
            "wrapper_path": str(wrapper_path),
            "desktop_shortcut": "false",
        },
    )

    artifacts = install_linux_artifacts(context=context)

    assert "linuxDesktopShortcut" not in artifacts
    assert not desktop_shortcut_path.exists()


def test_install_windows_artifacts_writes_wrapper_and_shortcuts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setenv("APPDATA", str(tmp_path / "AppData"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "UserProfile"))

    wrapper_path = tmp_path / "wrapper" / "setta-launcher.cmd"
    start_menu_shortcut_path = tmp_path / "start-menu" / "Setta Test.lnk"
    desktop_shortcut_path = tmp_path / "desktop" / "Setta Test.lnk"

    created_shortcuts: list[tuple[Path, Path]] = []

    def fake_create_windows_shortcut(*, shortcut_path: Path, target_path: Path) -> None:
        created_shortcuts.append((shortcut_path, target_path))
        shortcut_path.parent.mkdir(parents=True, exist_ok=True)
        shortcut_path.write_text("shortcut", encoding="utf-8")

    monkeypatch.setattr(
        "setta.launcher_artifacts.windows._create_windows_shortcut",
        fake_create_windows_shortcut,
    )

    context = LauncherArtifactContext(
        target_command=["C:\\Python\\python.exe", "-m", "setta"],
        channel="windows-script",
        existing_managed_artifacts={},
        options={
            "app_name": "Setta Test",
            "wrapper_path": str(wrapper_path),
            "start_menu_shortcut_path": str(start_menu_shortcut_path),
            "desktop_shortcut": "true",
            "desktop_shortcut_path": str(desktop_shortcut_path),
        },
    )

    artifacts = install_windows_artifacts(context=context)

    assert artifacts == {
        "windowsWrapper": str(wrapper_path),
        "windowsStartMenuShortcut": str(start_menu_shortcut_path),
        "windowsDesktopShortcut": str(desktop_shortcut_path),
    }
    assert wrapper_path.exists()
    wrapper_script = wrapper_path.read_text(encoding="utf-8")
    assert "launcher" in wrapper_script
    assert "Setta could not start" in wrapper_script

    assert created_shortcuts == [
        (start_menu_shortcut_path, wrapper_path),
        (desktop_shortcut_path, wrapper_path),
    ]
