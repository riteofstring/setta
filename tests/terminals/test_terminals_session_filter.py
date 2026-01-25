from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.database.settings_file import SettingsFile
from setta.terminals.terminals import build_terminal_id
from setta.terminals.terminals import Terminals
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


@pytest.mark.asyncio
async def test_get_existing_terminals_filters_by_session() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        settings_file = SettingsFile(dbe, frontend_sender)
        terminals = Terminals(frontend_sender, settings_file)
        project_config_id = create_new_id()
        session_a = "session-a"
        session_b = "session-b"
        section_id = create_new_id()
        terminal_id_a = build_terminal_id(section_id, session_a)
        terminal_id_b = build_terminal_id(section_id, session_b)

        terminals.new_terminal(
            project_config_id,
            terminal_id_a,
            share_session_id=session_a,
        )
        terminals.new_terminal(
            project_config_id,
            terminal_id_b,
            share_session_id=session_b,
        )

        try:
            existing_a = terminals.get_existing_terminals(
                project_config_id,
                share_session_id=session_a,
            )
            existing_b = terminals.get_existing_terminals(
                project_config_id,
                share_session_id=session_b,
            )

            assert [terminal_id_a] == existing_a
            assert [terminal_id_b] == existing_b
        finally:
            await terminals.delete_terminals([terminal_id_a, terminal_id_b])
