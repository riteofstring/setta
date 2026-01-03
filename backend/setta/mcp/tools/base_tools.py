import importlib.metadata

from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.mcp.tool_setup import setta_init_tool, setta_tool
from setta.share.session_context import get_share_session_id
from setta.terminals.terminal_ids import build_terminal_id
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
    share_session_id = get_share_session_id() if ctx.fastmcp.state.share_mode else None
    if ctx.fastmcp.state.share_mode and share_session_id is None:
        raise KeyError("Missing share session id")
    terminal_id = build_terminal_id(sectionId, share_session_id)
    return ctx.fastmcp.state.terminals.get_terminal_history(terminal_id)


@setta_init_tool
def getProjectConfigNamesAndIds(ctx: Context):
    """
    Return metadata for every known project config so external agents can pick one.
    """
    _, metadata = (
        ctx.fastmcp.state.project_manager_switcher.main.get_all_project_metadata()
    )
    entries = [ProjectConfigNamesAndIdsEntry(name=m.name, id=m.id) for m in metadata]
    return ProjectConfigNamesAndIdsList(projectConfigs=entries)
