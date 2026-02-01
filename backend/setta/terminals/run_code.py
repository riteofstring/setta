from setta.database.utils import create_new_id
from setta.logging.tasks import spawn_background_task
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import RunCodeRequest
from setta.terminals.terminals import Terminals, build_terminal_id
from setta.types.id import ID
from setta.websockets.msg_handlers.cli_sender import WMHCLISender


async def run_code(
    x: RunCodeRequest,
    project_manager: BaseProjectManager,
    terminals: Terminals,
    websocket_msg_handler: WMHCLISender,
    share_session_id: str | None = None,
):
    command = await project_manager.create_run_command(x)
    return await run_command(
        command,
        x.projectConfigId,
        x.sectionId,
        x.cliId,
        project_manager,
        terminals,
        websocket_msg_handler,
        share_session_id=share_session_id,
    )


async def run_command(
    command: str,
    projectConfigId: ID,
    sectionId: ID | None,
    cliId: str | None,
    project_manager: BaseProjectManager | None,
    terminals: Terminals,
    websocket_msg_handler: WMHCLISender,
    share_session_id: str | None = None,
):
    terminal_id = None

    if cliId:
        await websocket_msg_handler.send_command(command, cliId)
    else:
        terminal_id = terminals.get_free_terminal(
            projectConfigId,
            share_session_id=share_session_id,
        )

        if not terminal_id:
            raw_terminal_id = create_new_id()
            terminal_id = build_terminal_id(raw_terminal_id, share_session_id)
            terminals.new_terminal(
                projectConfigId,
                terminal_id,
                share_session_id=share_session_id,
            )
            if project_manager is not None:
                await project_manager.create_temporary_terminal(
                    projectConfigId, raw_terminal_id
                )

        spawn_background_task(
            terminals.run_command_in_terminal(terminal_id, command),
            label="terminal-run-command",
            project_config_id=str(projectConfigId),
            extra_values={
                "terminal_id": str(terminal_id),
                "section_id": str(sectionId) if sectionId else None,
            },
        )

    return terminal_id
