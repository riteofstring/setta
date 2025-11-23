import importlib.metadata

from setta.mcp.tool_setup import setta_tool
from setta.server_state import SettaFastAPIState
from setta.types.ai import ID


@setta_tool
def getInstalledPythonPackages():
    """
    Returns the available packages and their version numbers in the current python environment.
    """
    installed_packages = importlib.metadata.distributions()
    output = ""
    for p in installed_packages:
        output += f"{p.metadata['Name']}={p.version}\n"
    return output


@setta_tool
def getTerminalOutput(setta_state: SettaFastAPIState, sectionId: ID):
    """
    Returns the history of outputs of a terminal.
    Args:
        sectionId: The id of the terminal.
    """
    return setta_state.terminals.get_terminal_history(sectionId)
