import importlib.metadata

from setta.mcp.server import SettaFastMCP
from setta.mcp.tool_setup import setta_tool
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
def getTerminalOutput(setta_mcp_server: SettaFastMCP, sectionId: ID):
    """
    Returns the history of outputs of a terminal
    Args:
        sectionId: The id of the terminal.
    """
    return setta_mcp_server.terminals.get_terminal_history(sectionId)


@setta_tool
async def getGenPythonCode(setta_mcp_server: SettaFastMCP, projectConfigId: ID):
    """
    Returns the current state of the generated python code.
    Args:
        projectConfigId: The id of the project.
    """
    return await setta_mcp_server.project_manager.get_gen_python_code(projectConfigId)


@setta_tool
async def setSelectedItem(
    setta_mcp_server: SettaFastMCP,
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
    await setta_mcp_server.project_manager.set_selected_item(
        projectConfigId, sectionId, selectedItemName, refetchParams
    )

    # TODO: return callable info and its children info
    return "success"
