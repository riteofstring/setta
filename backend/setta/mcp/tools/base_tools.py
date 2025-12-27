import importlib.metadata

from pydantic import BaseModel, RootModel

from mcp.server.fastmcp.server import Context
from setta.mcp.tool_setup import setta_init_tool, setta_tool
from setta.types.id import ID


class ProjectConfigNamesAndIdsEntry(BaseModel):
    name: str
    id: ID


class ProjectConfigNamesAndIdsList(RootModel[list[ProjectConfigNamesAndIdsEntry]]):
    pass


class InstalledPythonPackageList(RootModel[list[str]]):
    pass


@setta_tool
def getInstalledPythonPackages():
    """
    Returns the available packages and their version numbers in the current python environment.
    """
    packages: list[str] = []
    for distribution in importlib.metadata.distributions():
        name = distribution.metadata["Name"]
        version = distribution.version
        packages.append(f"{name}={version}")
    packages.sort(key=lambda entry: entry.lower())
    return InstalledPythonPackageList(root=packages)


@setta_tool
def getTerminalOutput(sectionId: ID, ctx: Context):
    """
    Returns the history of outputs of a terminal.
    Args:
        sectionId: The id of the terminal.
    """
    return ctx.fastmcp.state.terminals.get_terminal_history(sectionId)


@setta_init_tool
def getProjectConfigNamesAndIds(ctx: Context):
    """
    Return metadata for every known project config so external agents can pick one.
    """
    _, metadata = ctx.fastmcp.state.project_manager_switcher.main.get_all_project_metadata()
    entries = [ProjectConfigNamesAndIdsEntry(name=m.name, id=m.id) for m in metadata]
    return ProjectConfigNamesAndIdsList(root=entries)
