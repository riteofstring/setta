import asyncio

from setta.database.utils import create_new_id


async def runCode(p, lsp_writers, code_state, terminals):
    projectConfigId = p["projectConfig"]["id"]
    terminal_id = terminals.get_free_terminal(projectConfigId)

    new_terminal_created = False
    if not terminal_id:
        terminal_id = create_new_id()
        terminals.new_terminal(projectConfigId, terminal_id, True)
        new_terminal_created = True

    asyncio.create_task(terminals.run_command_in_terminal(terminal_id, command))

    return terminal_id, new_terminal_created
