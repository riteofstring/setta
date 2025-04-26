import importlib.metadata

from setta.mcp.frontend_tools import ID
from setta.mcp.server import mcp_server
from setta.mcp.utils import replace_ids_with_uuids


@mcp_server.tool(
    description="Returns the available packages and their version numbersin the current python environment."
)
def getInstalledPythonPackages():
    installed_packages = importlib.metadata.distributions()
    return str([(p.metadata["Name"], p.version) for p in installed_packages])


@mcp_server.tool(description="Returns the history of outputs of a terminal")
def getTerminalOutput(sectionId: ID):
    """
    Args:
        sectionId: The id of the terminal.
    """
    sectionId = replace_ids_with_uuids(sectionId, mcp_server.setta_websocket.id_to_uuid)
    return mcp_server.setta_terminals.get_terminal_history(sectionId)
