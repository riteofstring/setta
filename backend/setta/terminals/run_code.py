from setta.database.utils import create_new_id
from setta.logging.tasks import spawn_background_task
from setta.project_state.base_project_manager import BaseProjectManager
from setta.terminals.terminals import Terminals
from setta.types.id import ID


async def run_code(
    projectConfigId: ID,
    sectionId: ID | None,
    project_manager: BaseProjectManager,
    terminals: Terminals,
):
    terminal_id = None

    command = await project_manager.create_run_command(projectConfigId, sectionId)
    terminal_id = terminals.get_free_terminal(projectConfigId)

    if not terminal_id:
        terminal_id = create_new_id()
        terminals.new_terminal(projectConfigId, terminal_id)
        await project_manager.create_temporary_terminal(projectConfigId, terminal_id)

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
