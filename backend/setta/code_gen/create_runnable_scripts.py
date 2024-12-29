import os
from datetime import datetime
from pathlib import Path

from setta.code_gen.export_selected import (
    export_selected,
    get_gen_code_template_var,
    get_section_code,
    get_section_type,
    get_selected_section_variant,
)
from setta.code_gen.find_placeholders import template_prefix
from setta.code_gen.python.generate_code import (
    convert_var_names_to_readable_form,
    generate_code,
)
from setta.code_gen.utils import process_refs
from setta.utils.constants import (
    CODE_FOLDER,
    CODE_FOLDER_ENV_VARIABLE,
    SEND_ARTIFACT_TO_ENV_VARIABLE,
    C,
)
from setta.utils.utils import prune_dict


def runCode(message, terminal_write_fn=None, command_callback=None):
    p = message["content"]
    exporter_obj = export_selected(
        p, always_export_args_objs=False, force_include_template_var=False
    )
    folder_path = create_timestamped_folder(CODE_FOLDER)

    code, section_dependencies = generate_final_code_for_sections(
        p, exporter_obj, folder_path
    )

    print("runCodeBlocks", p["runCodeBlocks"], flush=True)
    section_dependencies = prune_dict(section_dependencies, p["runCodeBlocks"])

    to_write = topological_sort(section_dependencies)
    id_to_filepath = {}
    for sid in to_write:
        curr_code = code[sid]
        codeLanguage = curr_code["codeLanguage"]
        extension = languageToExtension(codeLanguage)
        filepath = write_string_to_file(
            folder_path, f"{curr_code['name']}{extension}", curr_code["code"]
        )
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        id_to_filepath[sid] = filepath

    # Only run code that isn't referenced by other code
    run_order = [
        x for x in to_write if all(x not in y for y in section_dependencies.values())
    ]

    # create a wrapper script if there are multiple files to run
    if len(run_order) > 1:
        bash_script = ""
        for sid in run_order:
            bash_script += codeCallStr(folder_path, code[sid])
        filepath = write_string_to_file(folder_path, "SETTA_ENTRY.sh", bash_script)
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        command = f"bash {filepath}"
    else:
        sid = run_order[0]
        filepath = id_to_filepath[sid]
        callingProgram = languageToCall(code[sid]["codeLanguage"])
        command = f"{callingProgram} {filepath}"

    if terminal_write_fn:
        terminal_write_fn(f"\x15{command}\n")
    elif command_callback:
        command_callback(command)


def generate_final_code_for_sections(p, exporter_obj, folder_path):
    code_sections = {
        k: v for k, v in p["sections"].items() if get_section_type(p, k) == C.CODE
    }
    code = {}
    section_dependencies = {}
    for s in code_sections.values():
        section_variant = get_selected_section_variant(p, s["id"])
        (
            curr_code,
            curr_section_dependencies,
        ) = generate_final_code_for_section(
            section_variant["code"],
            s["codeLanguage"],
            section_variant["evRefs"],
            section_variant["templateVars"],
            exporter_obj,
            folder_path,
            do_prepend_with_setup_code=True,
            projectConfigName=p["projectConfig"]["name"],
        )

        is_gen_code = bool(get_gen_code_template_var(section_variant["templateVars"]))
        code[s["id"]] = {
            "name": s["name"],
            "code": curr_code,
            "codeLanguage": s["codeLanguage"],
            "is_gen_code": is_gen_code,
        }
        section_dependencies[s["id"]] = curr_section_dependencies

    return code, section_dependencies


def generate_final_code_for_section(
    code,
    codeLanguage,
    evRefs,
    templateVars,
    exporter_obj,
    folder_path,
    do_prepend_with_setup_code=False,
    projectConfigName=None,
):
    section_dependencies = []
    var_name_to_line_num_dict = {}

    (
        code,
        new_positions,
    ) = process_refs(
        code,
        evRefs,
        exporter_obj.get_ref_var_name,
        templateVars=templateVars,
        get_template_var_replacement_value=get_template_var_replacement_value_fn(
            exporter_obj, folder_path, section_dependencies, var_name_to_line_num_dict
        ),
    )

    setup_code = ""
    if do_prepend_with_setup_code:
        code, setup_code = prepend_with_setup_code(
            code,
            codeLanguage,
            folder_path,
            projectConfigName,
        )

    code = convert_var_names_to_readable_form(
        code,
        var_name_to_line_num_dict.get(template_prefix(C.SETTA_GENERATED_PYTHON), {}),
        exporter_obj,
        new_positions["refs"],
        setup_code,
    )

    return code, section_dependencies


def get_template_var_replacement_value_fn(
    exporter_obj, folder_path, section_dependencies, var_name_to_line_num_dict
):
    def get_template_var_replacement_value(code, template_var):
        print("get_template_var_replacement_value", template_var, flush=True)
        keyword = template_var["keyword"]
        if keyword == template_prefix(C.SETTA_GENERATED_PYTHON):
            code, var_name_to_line_num_dict[keyword] = generate_code(
                exporter_obj.output,
                code,
                make_copy_of_selected=False,
            )
            return code
        else:
            section_dependencies.append(template_var["sectionId"])
            module_path = convert_folder_path_to_module_path(folder_path)
            keyword = keyword.lstrip(C.TEMPLATE_PREFIX)
            return f"{module_path}.{keyword}"

    return get_template_var_replacement_value


def convert_folder_path_to_module_path(folder_path):
    return str(os.path.relpath(folder_path)).replace("/", ".").replace("\\", ".")


def languageToExtension(x):
    return {"python": ".py", "bash": ".sh", "yaml": ".yaml"}[x]


def languageToCall(x):
    return {"python": "python", "bash": "bash"}[x]


def codePathStr(folder_path, filename, codeLanguage):
    extension = languageToExtension(codeLanguage)
    output = folder_path / f"{filename}{extension}"
    return os.path.relpath(output).replace(os.sep, "/")


def codeCallStr(folder_path, section):
    codePath = codePathStr(folder_path, section["name"], section["codeLanguage"])
    return f"{languageToCall(section['codeLanguage'])} {codePath}\n"


def topological_sort(objects):
    graph = {id: refs for id, refs in objects.items()}
    visiting, visited = set(), set()
    order = []

    def dfs(node):
        if node in visiting:
            raise ValueError("Circular reference detected")
        if node not in visited:
            visiting.add(node)
            for neighbour in graph[node]:
                dfs(neighbour)
            visiting.remove(node)
            visited.add(node)
            order.append(node)

    for id in objects.keys():
        if id not in visited:
            dfs(id)

    return order[::-1]


def create_timestamped_folder(base_dir, prefix=""):
    # Format the current timestamp with subsecond precision
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # Create folder name with optional prefix and subsecond precision
    folder_name = f"_{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = Path(base_dir) / folder_name

    if not os.path.exists(folder_path):
        try:
            os.makedirs(folder_path)
        except FileExistsError:
            pass

    return folder_path


def write_string_to_file(folder, filename, content):
    # Full path to the file
    file_path = os.path.join(folder, filename)
    # Write the content to the file
    with open(file_path, "w") as file:
        file.write(content)
    return file_path


def prepend_with_setup_code(code, codeLanguage, folder_path, project_config_name):
    setup_code = ""
    if codeLanguage == "python":
        location = f"/{project_config_name}"
        setup_code = (
            "import sys\n"
            "import os\n"
            "from pathlib import Path\n"
            "sys.path.append(str(Path(__file__).parent.parent.parent))\n"
            f"os.environ['{SEND_ARTIFACT_TO_ENV_VARIABLE}'] = '{location}'\n"
            f"os.environ['{CODE_FOLDER_ENV_VARIABLE}'] = '{folder_path}'\n"
        )
        code = setup_code + code
    return code, setup_code
