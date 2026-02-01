import logging

from setta.database.utils import create_new_id
from setta.logging.tasks import spawn_background_task
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import RunCodeRequest
from setta.terminals.terminals import Terminals, build_terminal_id
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.id import ID
from setta.types.section_impls import CodeSectionImpl
from setta.websockets.msg_handlers.cli_sender import WMHCLISender

logger = logging.getLogger(__name__)


async def run_code(
    x: RunCodeRequest,
    project_manager: BaseProjectManager,
    terminals: Terminals,
    websocket_msg_handler: WMHCLISender,
    share_session_id: str | None = None,
):
    logger.info(
        "run_code request project=%s section=%s terminal=%s cli=%s share_session=%s",
        x.projectConfigId,
        x.sectionId,
        x.terminalSectionId,
        x.cliId,
        share_session_id,
    )
    terminal_section_id = x.terminalSectionId
    resolved_section_id = x.sectionId
    project_state = None
    if terminal_section_id is None:
        project_state = project_manager.get_single_config_state(x.projectConfigId)
        if resolved_section_id is None:
            resolved_section_id = project_state.projectConfig.entryCodeBlockId
        if resolved_section_id is not None:
            section_impl = get_curr_effective_section_impl(
                project_state, resolved_section_id
            )
            if isinstance(section_impl, CodeSectionImpl):
                logger.info(
                    "run_code ensuring attached terminal project=%s section=%s",
                    x.projectConfigId,
                    resolved_section_id,
                )
                terminal_section_id = (
                    await project_manager.ensure_code_section_attached_terminal_for_run(
                        x.projectConfigId, resolved_section_id
                    )
                )
                logger.info(
                    "run_code ensured attached terminal project=%s section=%s terminal=%s",
                    x.projectConfigId,
                    resolved_section_id,
                    terminal_section_id,
                )
    command = await project_manager.create_run_command(x)
    return await run_command(
        command,
        x.projectConfigId,
        x.sectionId,
        terminal_section_id,
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
    terminalSectionId: ID | None,
    cliId: str | None,
    project_manager: BaseProjectManager | None,
    terminals: Terminals,
    websocket_msg_handler: WMHCLISender,
    share_session_id: str | None = None,
):
    terminal_id = None

    if cliId:
        logger.info(
            "run_command using cli output project=%s section=%s cli=%s",
            projectConfigId,
            sectionId,
            cliId,
        )
        await websocket_msg_handler.send_command(command, cliId)
    else:
        if terminalSectionId:
            terminal_id = build_terminal_id(terminalSectionId, share_session_id)
            if terminal_id not in terminals.PTY_PIDS:
                logger.info(
                    "run_command creating attached terminal project=%s section=%s terminal=%s share_session=%s",
                    projectConfigId,
                    sectionId,
                    terminalSectionId,
                    share_session_id,
                )
                terminals.new_terminal(
                    projectConfigId,
                    terminal_id,
                    share_session_id=share_session_id,
                )
            else:
                logger.info(
                    "run_command reusing attached terminal project=%s section=%s terminal=%s share_session=%s",
                    projectConfigId,
                    sectionId,
                    terminalSectionId,
                    share_session_id,
                )
        else:
            terminal_id = terminals.get_free_terminal(
                projectConfigId,
                share_session_id=share_session_id,
            )

            if not terminal_id:
                logger.info(
                    "run_command allocating temporary terminal project=%s section=%s share_session=%s",
                    projectConfigId,
                    sectionId,
                    share_session_id,
                )
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
            else:
                logger.info(
                    "run_command using free terminal project=%s section=%s terminal=%s share_session=%s",
                    projectConfigId,
                    sectionId,
                    terminal_id,
                    share_session_id,
                )

        logger.info(
            "run_command dispatch project=%s section=%s terminal=%s share_session=%s",
            projectConfigId,
            sectionId,
            terminal_id,
            share_session_id,
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
