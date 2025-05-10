import asyncio
from datetime import datetime
from pathlib import Path

from setta.code_gen.utils import (
    get_section_type,
    get_selected_section_variant,
)
from setta.database.utils import create_new_id
from setta.utils.constants import CODE_FOLDER, CWD, USER_SETTINGS, C
from setta.utils.utils import prune_dict


async def runCode(p, lsp_writers, code_state, terminals):
    command = await generateRunCodeCommand(p, lsp_writers, code_state)
    projectConfigId = p["projectConfig"]["id"]
    terminal_id = terminals.get_free_terminal(projectConfigId)

    new_terminal_created = False
    if not terminal_id:
        terminal_id = create_new_id()
        terminals.new_terminal(projectConfigId, terminal_id, True)
        new_terminal_created = True

    asyncio.create_task(terminals.run_command_in_terminal(terminal_id, command))

    return terminal_id, new_terminal_created


async def generateRunCodeCommand(p, lsp_writers, code_state):
    # exporter_obj = export_selected(p)
    folder_path = create_timestamped_folder(CODE_FOLDER)

    code_dict = await generate_final_code_for_sections(
        p,
        exporter_obj,
        lsp_writers,
        folder_path,
    )

    if len(p["runCodeBlocks"]) == 0:
        p[
            "runCodeBlocks"
        ] = []  # TODO: this should be set to the new read-only code block

    to_write, section_dependencies = prune_and_topological_sort(
        code_dict, p["runCodeBlocks"]
    )

    projectConfigId = p["projectConfig"]["id"]
    code_state.projects[projectConfigId] = p

    id_to_relpath = {}
    for sid in to_write:
        curr_code = code_dict[sid]
        rel_path_str = write_code_to_file(
            folder_path,
            curr_code["sanitized_full_name"],
            curr_code["code"],
            curr_code["codeLanguage"],
        )
        id_to_relpath[sid] = rel_path_str
        code_state.rel_path_to_project_id[rel_path_str] = projectConfigId

    # Only run code that isn't referenced by other code
    run_order = [
        x for x in to_write if all(x not in y for y in section_dependencies.values())
    ]

    # create a wrapper script if there are multiple files to run
    if len(run_order) > 1:
        rel_path_str = create_wrapper_bash_script(folder_path, run_order, code_dict)
        command = codeCallStr(rel_path_str, "bash")
    else:
        sid = run_order[0]
        command = codeCallStr(id_to_relpath[sid], code_dict[sid]["codeLanguage"])

    return command


async def generate_final_code_for_sections(
    p,
    exporter_obj,
    lsp_writers,
    folder_path,
    push_var_name=None,
):
    code_sections = {
        k: v for k, v in p["sections"].items() if get_section_type(p, k) == C.CODE
    }

    code_dict = {}
    for s in code_sections.values():
        section_variant = get_selected_section_variant(p, s["id"])

        (
            curr_code,
            curr_section_dependencies,
        ) = await generate_final_code_for_section(
            sectionId=s["id"],
            code=section_variant["code"],
            codeLanguage=s["codeLanguage"],
            exporter_obj=exporter_obj,
            lsp_writers=lsp_writers,
            folder_path=folder_path,
            projectConfigName=p["projectConfig"]["name"],
            push_var_name=push_var_name,
        )

        code_dict[s["id"]] = {
            "name": s["name"],
            "code": curr_code,
            "codeLanguage": s["codeLanguage"],
            "section_dependencies": curr_section_dependencies,
        }

    return code_dict


async def generate_final_code_for_section(
    sectionId,
    code,
    codeLanguage,
    lsp_writers,
    folder_path,
    projectConfigName=None,
):
    section_dependencies = []

    # TODO: code needs to be generated somewhere here

    if USER_SETTINGS["backend"]["inferImports"]:
        code = await maybe_validate_imports_and_update_code(
            sectionId, code, lsp_writers
        )

    return code, section_dependencies


def convert_folder_path_to_module_path(folder_path):
    return folder_path.as_posix().replace("/", ".").replace("\\", ".")


def languageToExtension(x):
    return {"python": ".py", "bash": ".sh", "yaml": ".yaml"}[x]


def languageToCall(x):
    return {"python": "python", "bash": "bash"}[x]


def codePathStr(folder_path, filename, codeLanguage):
    extension = languageToExtension(codeLanguage)
    output = folder_path / f"{filename}{extension}"
    return output.relative_to(CWD).as_posix()


def codeCallStr(filepath, codeLanguage):
    return f"{languageToCall(codeLanguage)} {filepath}"


def create_wrapper_bash_script(folder_path, run_order, code_dict):
    bash_script = ""
    for sid in run_order:
        curr_code = code_dict[sid]
        codePath = codePathStr(
            folder_path, curr_code["name"], curr_code["codeLanguage"]
        )
        bash_script += f"{codeCallStr(codePath, curr_code['codeLanguage'])}\n"
    return write_code_to_file(
        folder_path, C.DEFAULT_BASH_SCRIPT_NAME, bash_script, "bash"
    )


def prune_and_topological_sort(code_dict, to_keep):
    section_dependencies = {k: v["section_dependencies"] for k, v in code_dict.items()}
    section_dependencies = prune_dict(section_dependencies, to_keep)
    return topological_sort(section_dependencies), section_dependencies


# TODO: is this function actually necessary anymore?
def topological_sort(objects):
    graph = {node: refs for node, refs in objects.items()}
    visiting, visited = set(), set()
    order = []

    def dfs(node):
        if node in visiting:
            raise ValueError("Circular reference detected")
        if node not in visited:
            visiting.add(node)
            for neighbor in graph.get(node, []):
                dfs(neighbor)
            visiting.remove(node)
            visited.add(node)
            order.append(node)

    for node in graph.keys():
        if node not in visited:
            dfs(node)
    return order[::-1]


def create_timestamped_folder(base_dir, prefix=""):
    # Format the current timestamp with subsecond precision
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # Create folder name with optional prefix and subsecond precision
    folder_name = f"_{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = Path(base_dir) / folder_name
    folder_path.mkdir(parents=True, exist_ok=True)
    return folder_path


def write_code_to_file(folder_path, filename, code, codeLanguage):
    extension = languageToExtension(codeLanguage)
    filepath = write_string_to_file(folder_path, f"{filename}{extension}", code)
    return filepath.relative_to(CWD).as_posix()


def write_string_to_file(folder, filename, content):
    file_path = Path(folder) / filename
    file_path.write_text(content)
    return file_path


def relative_to_cwd(folder_path):
    return Path(folder_path).relative_to(CWD)


def sanitize_section_path_full_name(name):
    # Replace brackets, quotes and other invalid chars with underscores
    invalid_chars = "[]\"' "
    name = "".join("_" if c in invalid_chars else c for c in name)

    # Remove consecutive underscores
    while "__" in name:
        name = name.replace("__", "_")

    # Remove leading/trailing underscores
    name = name.strip("_")

    return name
