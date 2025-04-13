import importlib.metadata

from setta.mcp.server import mcp_server


@mcp_server.tool(
    description="Get installed python packages in current python environment"
)
def getInstalledPythonPackages() -> str:
    """
    Returns:
        The available packages and their version numbers.
    """
    installed_packages = importlib.metadata.distributions()
    output = "Packages:\n"
    for p in installed_packages:
        output += f"{p.metadata['Name']}=={p.version}\n"
    return output
