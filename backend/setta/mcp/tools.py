import importlib.metadata
from typing import cast

from setta.mcp.tool_setup import setta_tool
from setta.server_state import SettaFastAPIState
from setta.terminals.run_code import run_code
from setta.types.ai import ID
from setta.types.helpers import get_children_of_callable
from setta.types.simplified_states import (
    SimplifiedCodeInfo,
    SimplifiedSection,
    SimplifiedSectionCreation,
)


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
    Returns the history of outputs of a terminal
    Args:
        sectionId: The id of the terminal.
    """
    return setta_state.terminals.get_terminal_history(sectionId)


@setta_tool
async def getGenPythonCode(setta_state: SettaFastAPIState, projectConfigId: str):
    """
    Returns the current state of the generated python code.
    Args:
        projectConfigId: The id of the project.
    """
    return await setta_state.project_manager.get_gen_python_code(projectConfigId)


@setta_tool
async def setSelectedItem(
    setta_state: SettaFastAPIState,
    projectConfigId: str,
    sectionId: ID,
    selectedItemName: str,
    refetchParams: bool,
) -> dict[ID, SimplifiedCodeInfo]:
    """
    Sets the selectedItem (i.e. the callable) of a section. Returns a list of function argument information.
    Args:
        projectConfigId: The id of the project.
        sectionId: The id of the section we're setting the selectedItem of.
        selectedItemName: The selected item name, for example "math.sqrt"
        refetchParams: If True, then the parameter list will be recomputed. Only do this if something with the python environment or language server has changed.
    """
    project_state = await setta_state.project_manager.set_callable(
        projectConfigId, sectionId, selectedItemName, refetchParams
    )
    output: dict[ID, SimplifiedCodeInfo] = {}
    children = get_children_of_callable(project_state, sectionId)
    for codeObj, codeObjImpl in children:
        output[ID(codeObj.id)] = SimplifiedCodeInfo(
            name=codeObj.name,
            defaultVal=codeObjImpl.defaultVal,
            description=codeObjImpl.description,
        )
    return output


@setta_tool
async def setGenCodePrefix(
    setta_state: SettaFastAPIState, projectConfigId: str, value: str
):
    """
    Set the value of code that is prepended to the generated python code.
    Args:
        value: This is what will be prepended to the generated code.
    """
    await setta_state.project_manager.set_gen_code_prefix(projectConfigId, value)
    return "success"


@setta_tool
async def setParamValues(
    setta_state: SettaFastAPIState,
    projectConfigId: str,
    sectionId: ID,
    paramIdsToValues: dict[ID, str],
):
    """
    Set the values of multiple parameters in a particular section.
    Args:
        sectionId: The id of the section that contains the parameters.
        paramIdsToValues: A mapping from parameter id to value. Each value is a string that contains python code that evaluates to whatever you want the parameter's value to be. For example to set the parameter to True, pass in "True". To set the parameter to "dog", pass in '"dog"'.
    """

    await setta_state.project_manager.set_param_values(
        projectConfigId, sectionId, cast(dict[str, str], paramIdsToValues)
    )
    return "success"


@setta_tool
async def getAllSectionInfo(
    setta_state: SettaFastAPIState, projectConfigId: str
) -> dict[ID, SimplifiedSection]:
    """
    Set the values of multiple parameters in a particular section. Returns an object that maps from sectionId to that section's information.
    """
    output = await setta_state.project_manager.get_top_level_sections(projectConfigId)
    simplified_output: dict[ID, SimplifiedSection] = {}
    for k, v in output.items():
        simplified_output[ID(k)] = SimplifiedSection(name=v.name)
    return simplified_output


@setta_tool
async def runCode(
    setta_state: SettaFastAPIState, projectConfigId: str, sectionId: ID
) -> ID:
    """
    Runs the specified code block in a terminal. Returns the id of the terminal running the code.
    Args:
        sectionId: The id of the code block to run.
    """

    terminal_id, new_terminal_created = await run_code(
        projectConfigId,
        sectionId,
        None,
        setta_state.project_manager,
        setta_state.terminals,
        setta_state.wmh_cli_sender,
    )

    if new_terminal_created:
        await setta_state.terminals.websocket_msg_handler.send_new_terminal_id(
            projectConfigId, terminal_id
        )

    return ID(terminal_id)


@setta_tool
async def createSections(
    setta_state: SettaFastAPIState,
    projectConfigId: str,
    sections: list[SimplifiedSectionCreation],
):
    """
    Args:
        sections: A list of information about sections to create.
    """

    await setta_state.project_manager.create_sections(projectConfigId, sections)
    return "success"
