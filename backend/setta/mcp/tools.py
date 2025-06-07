import importlib.metadata

from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_setup import setta_tool
from setta.mcp.utils import replace_ids_with_uuids
from setta.types.ai import ID


@setta_tool
def getInstalledPythonPackages():
    """
    Returns the available packages and their version numbersin the current python environment.
    """
    installed_packages = importlib.metadata.distributions()
    output = ""
    for p in installed_packages:
        output += f"{p.metadata['Name']}={p.version}\n"
    return output


@setta_tool
def getTerminalOutput(mcp_server: SettaFastMCP, sectionId: ID):
    """
    Returns the history of outputs of a terminal
    Args:
        sectionId: The id of the terminal.
    """
    convertedId = replace_ids_with_uuids(
        sectionId, mcp_server.websocket_msg_handler.id_to_uuid
    )
    return mcp_server.terminals.get_terminal_history(convertedId)


@setta_tool
async def getGenPythonCode(mcp_server: SettaFastMCP, projectConfigId: ID):
    """
    Returns the current state of the generated python code.
    Args:
        projectConfigId: The id of the project.
    """
    convertedId = replace_ids_with_uuids(
        projectConfigId, mcp_server.websocket_msg_handler.id_to_uuid
    )
    return await mcp_server.project_manager.get_gen_python_code(convertedId)  # type: ignore


@setta_tool
async def setSelectedItem(
    mcp_server: SettaFastMCP,
    projectConfigId: ID,
    sectionId: ID,
    selectedItemName: str,
    refetchParams: bool,
):
    """
    Sets the selectedItem (i.e. the callable) of a section.
    Args:
        projectConfigId: The id of the project.
        sectionId: The id of the section we're setting the selectedItem of.
        selectedItemName: The selected item name, for example "math.sqrt"
    """
    convertedProjectConfigId = replace_ids_with_uuids(
        projectConfigId, mcp_server.websocket_msg_handler.id_to_uuid
    )
    convertedSectionId = replace_ids_with_uuids(
        sectionId, mcp_server.websocket_msg_handler.id_to_uuid
    )

    await mcp_server.project_manager.set_selected_item(
        convertedProjectConfigId, convertedSectionId, selectedItemName, refetchParams
    )

    # TODO: return callable info and its children info
    return "success"
