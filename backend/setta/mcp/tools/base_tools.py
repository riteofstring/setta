import importlib.metadata

from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.mcp.tool_setup import setta_init_tool, setta_tool
from setta.terminals.terminals import build_terminal_id
from setta.types.id import ID


class ProjectConfigNamesAndIdsEntry(BaseModel):
    name: str
    id: ID


class ProjectConfigNamesAndIdsList(BaseModel):
    projectConfigs: list[ProjectConfigNamesAndIdsEntry]


class InstalledPythonPackageList(BaseModel):
    packages: list[str]


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
    return InstalledPythonPackageList(packages=packages)


@setta_tool
def getTerminalOutput(sectionId: ID, ctx: Context):
    """
    Returns the history of outputs of a terminal.
    Args:
        sectionId: The id of the terminal.
    """
    terminal_id = build_terminal_id(sectionId, None)
    return ctx.fastmcp.state.terminals.get_terminal_history(terminal_id)


@setta_init_tool
def getProjectConfigNamesAndIds(ctx: Context):
    """
    Return metadata for every known project config so external agents can pick one.
    """
    manager = ctx.fastmcp.state.project_manager_switcher.main
    _, metadata = manager.get_all_project_metadata()
    entries = [ProjectConfigNamesAndIdsEntry(name=m.name, id=m.id) for m in metadata]
    return ProjectConfigNamesAndIdsList(projectConfigs=entries)
