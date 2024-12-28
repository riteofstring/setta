import copy
import os
from datetime import datetime

from setta.code_gen.export_selected import (
    export_selected,
    get_section_code,
    get_section_type,
    get_selected_section_variant,
)
from setta.code_gen.find_placeholders import (
    double_braces,
    needs_generated_python,
    needs_yaml,
)
from setta.code_gen.python.generate_code import (
    convert_var_names_to_readable_form,
    generate_code,
    replace_keywords,
)
from setta.code_gen.utils import process_refs
from setta.utils.constants import (
    CODE_FOLDER,
    CODE_FOLDER_ENV_VARIABLE,
    SEND_ARTIFACT_TO_ENV_VARIABLE,
    C,
)


def runCode(message, terminal_write_fn=None, command_callback=None):
    p = message["content"]
    exporter_obj = export_selected(p, always_export_args_objs=False)
    selected = exporter_obj.output
    folder_path = create_timestamped_folder(CODE_FOLDER)

    code_sections = {
        id: copy.deepcopy(s)
        for id, s in p["sections"].items()
        if get_section_type(p, s["id"]) == C.CODE
    }
    dependencies = {}
    for s in code_sections.values():
        section_variant = get_selected_section_variant(p, s["id"])
        curr_code = section_variant["code"]
        curr_dependencies = []
        replacements = {}
        generated_python_code = None
        generated_python_var_name_to_line_num = None
        generated_python_code_area_ref_var_name_positions = None
        for other_s in code_sections.values():
            if double_braces(other_s["name"]) in curr_code:
                replacements[other_s["name"]] = codePathStr(
                    folder_path, other_s["name"], other_s["codeLanguage"]
                )
                curr_dependencies.append(other_s["id"])
        if needs_yaml(curr_code):
            replacements["SETTA_YAML_FILE"] = codePathStr(
                folder_path, "SETTA_YAML", "yaml"
            )
        if needs_generated_python(curr_code):
            (
                curr_code,
                _,
                generated_python_code_area_ref_var_name_positions,
            ) = process_refs(
                curr_code,
                section_variant["evRefs"],
                exporter_obj.get_ref_var_name,
            )
            (
                generated_python_code,
                generated_python_var_name_to_line_num,
            ) = generate_code(
                selected,
                curr_code,
                replace_templated_code=False,
                make_copy_of_selected=False,
            )
            replacements[C.SETTA_GENERATED_PYTHON] = generated_python_code

        section_variant["code"] = replace_keywords(
            curr_code, replacements, generated_python_code_area_ref_var_name_positions
        )

        section_variant["code"], setup_code = prepend_with_setup_code(
            section_variant["code"],
            s["codeLanguage"],
            folder_path,
            p["projectConfig"]["name"],
        )

        if generated_python_code:
            section_variant["code"] = convert_var_names_to_readable_form(
                section_variant["code"],
                generated_python_var_name_to_line_num,
                exporter_obj,
                generated_python_code_area_ref_var_name_positions,
                setup_code,
            )
        dependencies[s["id"]] = curr_dependencies

    to_write = topological_sort(dependencies)
    id_to_filepath = {}
    for sid in to_write:
        curr_section = code_sections[sid]
        codeLanguage = curr_section["codeLanguage"]
        extension = languageToExtension(codeLanguage)
        code = get_section_code(p, sid)
        filepath = write_string_to_file(
            folder_path, f"{curr_section['name']}{extension}", code
        )
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        id_to_filepath[sid] = filepath

    # Only run code that isn't referenced by other code
    run_order = [x for x in to_write if all(x not in y for y in dependencies.values())]

    # create a wrapper script if there are multiple files to run
    if len(run_order) > 1:
        bash_script = ""
        for sid in run_order:
            curr_section = code_sections[sid]
            bash_script += codeCallStr(folder_path, curr_section)
        filepath = write_string_to_file(folder_path, "SETTA_ENTRY.sh", bash_script)
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        command = f"bash {filepath}"
    else:
        sid = run_order[0]
        filepath = id_to_filepath[sid]
        callingProgram = languageToCall(code_sections[sid]["codeLanguage"])
        command = f"{callingProgram} {filepath}"

    if terminal_write_fn:
        terminal_write_fn(f"\x15{command}\n")
    elif command_callback:
        command_callback(command)


def languageToExtension(x):
    return {"python": ".py", "bash": ".sh", "yaml": ".yaml"}[x]


def languageToCall(x):
    return {"python": "python", "bash": "bash"}[x]


def codePathStr(folder_path, filename, codeLanguage):
    extension = languageToExtension(codeLanguage)
    output = f"{folder_path}/{filename}{extension}"
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
    folder_name = f"{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = os.path.join(base_dir, folder_name)

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
