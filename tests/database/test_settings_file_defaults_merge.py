from pathlib import Path

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _create_settings_file(tmp_path: Path) -> SettingsFile:
    dbe = DBE(tmp_path)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager)
    return SettingsFile(dbe, frontend_sender)


def test_load_settings_writes_missing_default_keys(tmp_path: Path) -> None:
    dbe = DBE(tmp_path)
    dbe.write_json(
        dbe.settings,
        {
            "gui": {
                # Intentionally omit wireColor/wireColorDarkMode so we can
                # validate that SettingsFile migrates the on-disk JSON.
                "gridColor": "#afbacf",
                "gridColorDarkMode": "#2b364a",
            }
        },
    )

    _create_settings_file(tmp_path)

    payload = dbe.read_json(dbe.settings)
    gui = payload.get("gui", {})
    assert isinstance(gui, dict)
    assert "wireColor" in gui
    assert "wireColorDarkMode" in gui


def test_load_settings_preserves_existing_values(tmp_path: Path) -> None:
    dbe = DBE(tmp_path)
    dbe.write_json(
        dbe.settings,
        {
            "gui": {
                "gridColor": "#afbacf",
                "gridColorDarkMode": "#2b364a",
                "wireColor": "#123456",
            }
        },
    )

    _create_settings_file(tmp_path)

    payload = dbe.read_json(dbe.settings)
    gui = payload.get("gui", {})
    assert isinstance(gui, dict)
    assert gui.get("wireColor") == "#123456"

