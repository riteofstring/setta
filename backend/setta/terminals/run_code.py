import asyncio

from setta.database.utils import create_new_id
from setta.project_state.base_project_manager import BaseProjectManager
from setta.terminals.terminals import Terminals
from setta.websockets.msg_handlers.cli_sender import WMHCLISender


async def run_code(
    projectConfigId: str,
    sectionId: str | None,
    cliId: str | None,
    project_manager: BaseProjectManager,
    terminals: Terminals,
    websocket_msg_handler: WMHCLISender,
):
    terminal_id = None

    command = await project_manager.create_run_command(projectConfigId, sectionId)
    if cliId:
        await websocket_msg_handler.send_command(command, cliId)
    else:
        terminal_id = terminals.get_free_terminal(projectConfigId)

        if not terminal_id:
            terminal_id = create_new_id()
            terminals.new_terminal(projectConfigId, terminal_id)
            await project_manager.create_temporary_terminal(
                projectConfigId, terminal_id
            )

        asyncio.create_task(terminals.run_command_in_terminal(terminal_id, command))

    return terminal_id
