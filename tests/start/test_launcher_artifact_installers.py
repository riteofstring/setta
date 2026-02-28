import plistlib
from pathlib import Path

import pytest

from setta.launcher_artifacts import LauncherArtifactContext
from setta.launcher_artifacts.common import LauncherArtifactError
from setta.launcher_artifacts.linux import install_linux_artifacts
from setta.launcher_artifacts.macos import install_macos_artifacts
from setta.launcher_artifacts.windows import install_windows_artifacts


def test_install_macos_artifacts_writes_bundle_files(tmp_path: Path) -> None:
    app_path = tmp_path / "Applications" / "Setta.app"
    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
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
    assert "--setta-home" in launcher_script
    assert "/tmp/setta-home" in launcher_script
    assert "CFBundleExecutable" in info_plist
    assert "CFBundleIconFile" in info_plist
    assert "Setta.icns" in info_plist
    assert (app_path / "Contents" / "Resources" / "Setta.icns").exists()


def test_install_macos_artifacts_copies_optional_icon(tmp_path: Path) -> None:
    app_path = tmp_path / "Applications" / "Setta.app"
    icon_path = tmp_path / "CustomSetta.icns"
    icon_path.write_text("icon", encoding="utf-8")

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="manual",
        existing_managed_artifacts={},
        options={"app_path": str(app_path), "icon_path": str(icon_path)},
    )

    install_macos_artifacts(context=context)

    copied_icon = app_path / "Contents" / "Resources" / "CustomSetta.icns"
    info_plist = (app_path / "Contents" / "Info.plist").read_text(encoding="utf-8")

    assert copied_icon.exists()
    assert copied_icon.read_text(encoding="utf-8") == "icon"
    assert "CFBundleIconFile" in info_plist
    assert "CustomSetta.icns" in info_plist


def test_install_macos_artifacts_writes_parseable_plist_for_xml_icon_names(
    tmp_path: Path,
) -> None:
    app_path = tmp_path / "Applications" / "Setta.app"
    icon_path = tmp_path / "bad&name.icns"
    icon_path.write_text("icon", encoding="utf-8")

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="manual",
        existing_managed_artifacts={},
        options={"app_path": str(app_path), "icon_path": str(icon_path)},
    )

    install_macos_artifacts(context=context)

    info_plist_path = app_path / "Contents" / "Info.plist"
    parsed_plist = plistlib.loads(info_plist_path.read_bytes())
    assert parsed_plist["CFBundleIconFile"] == "bad&name.icns"


def test_install_macos_artifacts_rejects_control_characters_in_icon_name(
    tmp_path: Path,
) -> None:
    app_path = tmp_path / "Applications" / "Setta.app"
    icon_path = tmp_path / "bad\nname.icns"
    icon_path.write_text("icon", encoding="utf-8")

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="manual",
        existing_managed_artifacts={},
        options={"app_path": str(app_path), "icon_path": str(icon_path)},
    )

    with pytest.raises(LauncherArtifactError) as excinfo:
        install_macos_artifacts(context=context)

    assert "icon_path" in str(excinfo.value)


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
        setta_home="/tmp/setta-home",
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
    assert "--setta-home" in wrapper_script
    assert "/tmp/setta-home" in wrapper_script
    assert "Name=Setta Test" in desktop_entry
    icon_lines = [
        line for line in desktop_entry.splitlines() if line.startswith("Icon=")
    ]
    assert icon_lines == [f"Icon={icon_path.resolve(strict=False)}"]


def test_install_linux_artifacts_does_not_delete_existing_shortcut_when_disabled(
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
        setta_home="/tmp/setta-home",
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
    assert desktop_shortcut_path.exists()


def test_install_linux_artifacts_escapes_exec_argument_for_spaced_wrapper_path(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "setta.launcher_artifacts.linux._refresh_desktop_database",
        lambda _applications_dir: None,
    )
    applications_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher bin" / "setta launcher%test"

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="linux-script",
        existing_managed_artifacts={},
        options={
            "applications_dir": str(applications_dir),
            "desktop_entry_name": "setta.desktop",
            "wrapper_path": str(wrapper_path),
        },
    )

    install_linux_artifacts(context=context)
    desktop_entry_path = applications_dir / "setta.desktop"
    desktop_entry = desktop_entry_path.read_text(encoding="utf-8")

    resolved_wrapper = str(wrapper_path.resolve(strict=False))
    escaped_wrapper = resolved_wrapper.replace("\\", "\\\\")
    escaped_wrapper = escaped_wrapper.replace('"', '\\"')
    escaped_wrapper = escaped_wrapper.replace("$", "\\$")
    escaped_wrapper = escaped_wrapper.replace("`", "\\`")
    escaped_wrapper = escaped_wrapper.replace("%", "%%")
    assert f'Exec="{escaped_wrapper}" %F' in desktop_entry


@pytest.mark.parametrize(
    "app_name",
    [
        "Setta\nInjected",
        "Setta\rInjected",
        "Setta\x1fInjected",
    ],
)
def test_install_linux_artifacts_rejects_control_characters_in_app_name(
    tmp_path: Path,
    monkeypatch,
    app_name: str,
) -> None:
    monkeypatch.setattr(
        "setta.launcher_artifacts.linux._refresh_desktop_database",
        lambda _applications_dir: None,
    )
    applications_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="linux-script",
        existing_managed_artifacts={},
        options={
            "applications_dir": str(applications_dir),
            "desktop_entry_name": "setta.desktop",
            "wrapper_path": str(wrapper_path),
            "app_name": app_name,
        },
    )

    with pytest.raises(LauncherArtifactError) as excinfo:
        install_linux_artifacts(context=context)

    assert "app_name" in str(excinfo.value)
    assert not wrapper_path.exists()


def test_install_linux_artifacts_rejects_control_characters_in_icon_path(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "setta.launcher_artifacts.linux._refresh_desktop_database",
        lambda _applications_dir: None,
    )
    applications_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"
    icon_path = tmp_path / "bad\nXDG-OPEN=1.png"
    icon_path.write_text("png", encoding="utf-8")

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="linux-script",
        existing_managed_artifacts={},
        options={
            "applications_dir": str(applications_dir),
            "desktop_entry_name": "setta.desktop",
            "wrapper_path": str(wrapper_path),
            "icon_path": str(icon_path),
        },
    )

    with pytest.raises(LauncherArtifactError) as excinfo:
        install_linux_artifacts(context=context)

    assert "icon_path" in str(excinfo.value)
    assert not wrapper_path.exists()


def test_install_linux_artifacts_rejects_path_like_desktop_entry_name(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "setta.launcher_artifacts.linux._refresh_desktop_database",
        lambda _applications_dir: None,
    )
    applications_dir = tmp_path / "applications"
    wrapper_path = tmp_path / "launcher" / "setta-launcher"

    context = LauncherArtifactContext(
        target_command=["/tmp/python", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="linux-script",
        existing_managed_artifacts={},
        options={
            "applications_dir": str(applications_dir),
            "desktop_entry_name": "../setta.desktop",
            "wrapper_path": str(wrapper_path),
        },
    )

    with pytest.raises(LauncherArtifactError) as excinfo:
        install_linux_artifacts(context=context)

    assert "desktop_entry_name" in str(excinfo.value)
    assert not wrapper_path.exists()


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
        setta_home="/tmp/setta-home",
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
    assert '--setta-home "/tmp/setta-home"' in wrapper_script
    assert "Setta could not start" in wrapper_script

    assert created_shortcuts == [
        (start_menu_shortcut_path, wrapper_path),
        (desktop_shortcut_path, wrapper_path),
    ]


def test_install_windows_artifacts_quotes_workspace_forwarding(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setenv("APPDATA", str(tmp_path / "AppData"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "UserProfile"))

    wrapper_path = tmp_path / "wrapper" / "setta-launcher.cmd"
    start_menu_shortcut_path = tmp_path / "start-menu" / "Setta Test.lnk"

    def fake_create_windows_shortcut(*, shortcut_path: Path, target_path: Path) -> None:
        assert target_path == wrapper_path
        shortcut_path.parent.mkdir(parents=True, exist_ok=True)
        shortcut_path.write_text("shortcut", encoding="utf-8")

    monkeypatch.setattr(
        "setta.launcher_artifacts.windows._create_windows_shortcut",
        fake_create_windows_shortcut,
    )

    context = LauncherArtifactContext(
        target_command=["C:\\Python\\python.exe", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="windows-script",
        existing_managed_artifacts={},
        options={
            "app_name": "Setta Test",
            "wrapper_path": str(wrapper_path),
            "start_menu_shortcut_path": str(start_menu_shortcut_path),
        },
    )

    install_windows_artifacts(context=context)

    wrapper_script = wrapper_path.read_text(encoding="utf-8")
    assert '--setta-home "/tmp/setta-home"' in wrapper_script
    assert 'launcher --workspace "%~1"' in wrapper_script
    assert "launcher --workspace %1" not in wrapper_script


def test_install_windows_artifacts_rejects_path_like_app_name(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setenv("APPDATA", str(tmp_path / "AppData"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "UserProfile"))
    wrapper_path = tmp_path / "wrapper" / "setta-launcher.cmd"

    called_shortcut_creation = False

    def fail_if_shortcut_created(*, shortcut_path: Path, target_path: Path) -> None:
        nonlocal called_shortcut_creation
        assert shortcut_path is not None
        assert target_path is not None
        called_shortcut_creation = True

    monkeypatch.setattr(
        "setta.launcher_artifacts.windows._create_windows_shortcut",
        fail_if_shortcut_created,
    )

    context = LauncherArtifactContext(
        target_command=["C:\\Python\\python.exe", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="windows-script",
        existing_managed_artifacts={},
        options={
            "app_name": "..\\Setta Test",
            "wrapper_path": str(wrapper_path),
        },
    )

    with pytest.raises(LauncherArtifactError) as excinfo:
        install_windows_artifacts(context=context)

    assert "app_name" in str(excinfo.value)
    assert called_shortcut_creation is False
    assert not wrapper_path.exists()


def test_install_windows_artifacts_keeps_existing_desktop_shortcut_when_disabled(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setenv("APPDATA", str(tmp_path / "AppData"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "UserProfile"))

    wrapper_path = tmp_path / "wrapper" / "setta-launcher.cmd"
    start_menu_shortcut_path = tmp_path / "start-menu" / "Setta Test.lnk"
    existing_desktop_shortcut = tmp_path / "desktop" / "Setta Test.lnk"
    existing_desktop_shortcut.parent.mkdir(parents=True, exist_ok=True)
    existing_desktop_shortcut.write_text("shortcut", encoding="utf-8")

    def fake_create_windows_shortcut(*, shortcut_path: Path, target_path: Path) -> None:
        assert target_path == wrapper_path
        shortcut_path.parent.mkdir(parents=True, exist_ok=True)
        shortcut_path.write_text("shortcut", encoding="utf-8")

    monkeypatch.setattr(
        "setta.launcher_artifacts.windows._create_windows_shortcut",
        fake_create_windows_shortcut,
    )

    context = LauncherArtifactContext(
        target_command=["C:\\Python\\python.exe", "-m", "setta"],
        setta_home="/tmp/setta-home",
        channel="windows-script",
        existing_managed_artifacts={
            "windowsDesktopShortcut": str(existing_desktop_shortcut),
        },
        options={
            "app_name": "Setta Test",
            "wrapper_path": str(wrapper_path),
            "start_menu_shortcut_path": str(start_menu_shortcut_path),
            "desktop_shortcut": "false",
        },
    )

    artifacts = install_windows_artifacts(context=context)

    assert "windowsDesktopShortcut" not in artifacts
    assert existing_desktop_shortcut.exists()
