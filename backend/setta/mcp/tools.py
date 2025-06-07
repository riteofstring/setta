import importlib.metadata

from setta.mcp.server import mcp_server
from setta.types.ai import ID



@mcp_server.tool(
    description="Returns the available packages and their version numbersin the current python environment."
)
def getInstalledPythonPackages():
    installed_packages = importlib.metadata.distributions()
    output = ""
    for p in installed_packages:
        output += f"{p.metadata['Name']}={p.version}\n"
    return output


@mcp_server.tool(description="Returns the history of outputs of a terminal")
def getTerminalOutput(sectionId: ID):
    """
    Args:
        sectionId: The id of the terminal.
    """
    return mcp_server.terminals.get_terminal_history(sectionId)


@mcp_server.tool(description="Returns the current state of the generated python code.")
async def getGenPythonCode(projectConfigId: ID):
    """
    Args:
        projectConfigId: The id of the project.
    """
    return await mcp_server.project_manager.get_gen_python_code(projectConfigId)  # type: ignore


@mcp_server.tool(description="Sets the selectedItem (i.e. the callable) of a section.")
async def setSelectedItem(
    projectConfigId: ID, sectionId: ID, selectedItemName: str, refetchParams: bool
):
    """
    Args:
        projectConfigId: The id of the project.
        sectionId: The id of the section we're setting the selectedItem of.
        selectedItemName: The selected item name, for example "math.sqrt"
    """
    await mcp_server.project_manager.set_selected_item(
        projectConfigId, sectionId, selectedItemName, refetchParams
    )

    # TODO: return callable info and its children info
    return "success"
