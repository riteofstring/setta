import importlib.metadata

from setta.mcp.server import mcp_server


@mcp_server.tool(
    description="Returns the available packages and their version numbersin the current python environment."
)
def getInstalledPythonPackages():
    installed_packages = importlib.metadata.distributions()
    return str([(p.metadata["Name"], p.version) for p in installed_packages])
